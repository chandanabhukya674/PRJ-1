# 🌱 CropSense — ML Crop Recommendation System

A full-stack crop recommendation system using **Random Forest + SHAP (Explainable AI)** with a **Python FastAPI** backend and **Node.js** frontend gateway.

---

## 🚀 Deploy on Render (Free)

### Step 1 — MongoDB Atlas (Free Database)
1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) → Sign up free
2. Create a free **M0 cluster**
3. Create a database user (username + password)
4. Under **Network Access** → Add IP → Allow from anywhere (`0.0.0.0/0`)
5. Click **Connect** → **Drivers** → copy the connection string
   - Looks like: `mongodb+srv://user:password@cluster.mongodb.net/crop_recommendation_db`

---

### Step 2 — Deploy Python ML Backend on Render
1. Go to [https://render.com](https://render.com) → Sign up with GitHub
2. Click **New** → **Web Service**
3. Connect your GitHub repo: `chandanabhukya674/PRJ-1`
4. Fill in:
   - **Name:** `cropsense-python`
   - **Runtime:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
5. Under **Environment Variables** add:
   - `GEMINI_API_KEY` = your Gemini key
6. Click **Deploy** — wait for it to go live
7. **Copy the URL** — looks like `https://cropsense-python.onrender.com`

---

### Step 3 — Deploy Node.js Server on Render
1. Click **New** → **Web Service** again
2. Connect same GitHub repo
3. Fill in:
   - **Name:** `cropsense-node`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Under **Environment Variables** add:
   - `PYTHON_API_URL` = URL from Step 2 (e.g. `https://cropsense-python.onrender.com`)
   - `JWT_SECRET` = any long random string (e.g. `cropsense-super-secret-2024`)
   - `MONGO_URI` = MongoDB Atlas connection string from Step 1
5. Click **Deploy**
6. Your app is live at: `https://cropsense-node.onrender.com`

---

## 💻 Run Locally

### Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB (optional)

### Install
```bash
pip install -r requirements.txt
npm install
```

### Start Python Backend (Terminal 1)
```bash
python -m uvicorn backend.main:app --reload --port 8001
```

### Start Node Server (Terminal 2)
```bash
node server.js
```

Open: **http://localhost:3000**

---

## 🏗️ Architecture

```
Browser → Node.js (port 3000) → Python FastAPI (port 8001)
                              → MongoDB Atlas
```

## 🔑 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | Secret key for JWT tokens |
| `PYTHON_API_URL` | ✅ on Render | URL of Python backend |
| `GEMINI_API_KEY` | Optional | For AI market insights |
| `MONGO_URI` | Optional | MongoDB connection string |
| `JWT_EXPIRES_IN` | Optional | Token expiry (default: 7d) |
