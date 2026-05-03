require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const PYTHON_API_URL = process.env.PYTHON_API_URL || "http://127.0.0.1:8001";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is required. Set it in your .env file.");
}

app.use(cors());
app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname, "frontend")));

// ─── MongoDB (optional) ───────────────────────────────────────────────────────
let db = null, usersCol = null, predictionsCol = null;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    await client.connect();
    db = client.db("crop_recommendation_db");
    usersCol = db.collection("users");
    predictionsCol = db.collection("predictions");
    await usersCol.createIndex({ email: 1 }, { unique: true });
    console.log("✅ Connected to MongoDB successfully!");
  } catch (error) {
    console.warn("⚠️  MongoDB unavailable – using local file storage fallback.");
    db = null;
  }
}

connectDB();

// ─── File-based fallback storage (used when MongoDB is down) ─────────────────
const USERS_FILE = path.join(__dirname, "users_local.json");

function readLocalUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return {};
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeLocalUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function createAuthToken(user) {
  return jwt.sign(
    { email: user.email, first_name: user.first_name, last_name: user.last_name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ detail: "Missing or invalid authorization token" });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

// ─── Signup ───────────────────────────────────────────────────────────────────
app.post("/signup", async (req, res) => {
  const { email, password, firstName, lastName } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ detail: "Missing required fields" });
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const newUser = {
    email,
    first_name: firstName,
    last_name: lastName,
    password: hashedPassword,
    created_at: new Date().toISOString(),
  };

  // Try MongoDB first
  if (db && usersCol) {
    try {
      const existing = await usersCol.findOne({ email });
      if (existing) return res.status(400).json({ detail: "Email already registered" });
      await usersCol.insertOne(newUser);
      return res.json({ message: "User created successfully" });
    } catch (err) {
      console.error("MongoDB signup error:", err.message);
      // fall through to file fallback
    }
  }

  // File-based fallback
  const users = readLocalUsers();
  if (users[email]) {
    return res.status(400).json({ detail: "Email already registered" });
  }
  users[email] = newUser;
  writeLocalUsers(users);
  return res.json({ message: "User created successfully" });
});

// ─── Login ────────────────────────────────────────────────────────────────────
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ detail: "Email and password are required" });
  }

  let user = null;

  // Try MongoDB first
  if (db && usersCol) {
    try {
      user = await usersCol.findOne({ email });
    } catch (err) {
      console.error("MongoDB login error:", err.message);
    }
  }

  // File-based fallback
  if (!user) {
    const users = readLocalUsers();
    user = users[email] || null;
  }

  if (!user) {
    return res.status(401).json({ detail: "Invalid email or password" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ detail: "Invalid email or password" });
  }

  const token = createAuthToken(user);
  return res.json({
    message: "Login successful",
    token,
    user: { email: user.email, first_name: user.first_name, last_name: user.last_name },
  });
});

// ─── Me ───────────────────────────────────────────────────────────────────────
app.get("/me", authenticateToken, (req, res) => {
  res.json({
    user: {
      email: req.user.email,
      first_name: req.user.first_name,
      last_name: req.user.last_name,
    },
  });
});

// ─── Season Recommendations (proxy to Python backend) ────────────────────────
app.get("/season-recs", async (req, res) => {
  const { season } = req.query;
  if (!season) {
    return res.status(400).json({ detail: "season query parameter is required" });
  }
  try {
    const pythonRes = await axios.get(`${PYTHON_API_URL}/season-recs`, {
      params: { season },
      timeout: 8000,
    });
    res.json(pythonRes.data);
  } catch (error) {
    console.error("season-recs proxy error:", error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ detail: "ML service unavailable for season recommendations." });
    }
  }
});

// ─── Predict (proxy to Python backend) ───────────────────────────────────────
app.post("/predict", authenticateToken, async (req, res) => {
  try {
    const pythonRes = await axios.post(`${PYTHON_API_URL}/predict`, req.body, {
      timeout: 30000,
    });
    const predictionData = pythonRes.data;

    // Save to MongoDB if available (non-blocking)
    if (db && predictionsCol) {
      predictionsCol
        .insertOne({
          timestamp: new Date(),
          user_email: req.user.email,
          features: req.body,
          recommended_crop: predictionData.recommended_crop,
          confidence: predictionData.confidence,
          financials: {
            investment: predictionData.estimated_investment,
            profit: predictionData.estimated_profit,
            insight: predictionData.market_insight,
          },
        })
        .catch((e) => console.error("Failed to save prediction:", e.message));
    }

    res.json(predictionData);
  } catch (error) {
    console.error("Predict proxy error:", error.message);
    if (error.response) {
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(503).json({ detail: "Machine Learning service is unavailable. Make sure the Python backend is running on port 8001." });
    }
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌱 CropSense Node.js server running at http://localhost:${PORT}`);
  console.log(`   Frontend: http://localhost:${PORT}/index.html`);
  console.log(`   Login:    http://localhost:${PORT}/login.html\n`);
});
