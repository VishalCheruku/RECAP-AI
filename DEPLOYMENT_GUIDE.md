# RECAP AI - Complete Deployment Guide

## Overview
- **Backend (FastAPI)** → Railway.app
- **Frontend (React)** → Vercel
- **Database (MongoDB)** → MongoDB Atlas (free tier)

---

## PHASE 1: SETUP (Do This First)

### 1A. Create Free Accounts
1. **Railway.app**: https://railway.app (sign up with GitHub)
2. **Vercel**: https://vercel.com (sign up with GitHub)
3. **MongoDB Atlas**: https://www.mongodb.com/cloud/atlas (create free cluster)

### 1B. Prepare Your Local Code
```powershell
cd "c:\VS Code\New folder\recap-ai"
git init
git add .
git commit -m "Initial commit before deployment"
```

### 1C. Push to GitHub
1. Create a new repository on GitHub (recap-ai)
2. Run:
```powershell
git remote add origin https://github.com/YOUR_USERNAME/recap-ai.git
git branch -M main
git push -u origin main
```

---

## PHASE 2: DEPLOY BACKEND TO RAILWAY

### 2A. Create MongoDB Atlas Database
1. Go to https://www.mongodb.com/cloud/atlas
2. Create free account
3. Create a free cluster
4. Get connection string: "mongodb+srv://username:password@cluster.mongodb.net/recap_ai"

### 2B. Deploy on Railway
1. Go to https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your recap-ai repository
4. Select root directory: `/`
5. Choose service: Python

### 2C. Add Environment Variables in Railway
In Railway dashboard, go to Variables and add:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/recap_ai
MONGO_DB_NAME=recap_ai
TWILIO_ACCOUNT_SID=your_sid (if using SMS)
TWILIO_AUTH_TOKEN=your_token (if using SMS)
FRONTEND_URL=https://your-vercel-domain.vercel.app
```

### 2D. Configure Port
Railway auto-detects and sets PORT. Your backend will run at:
```
https://your-railway-domain.up.railway.app
```

---

## PHASE 3: DEPLOY FRONTEND TO VERCEL

### 3A. Create Vercel Project
1. Go to https://vercel.com
2. Click "New Project"
3. Import your GitHub repo (recap-ai)
4. Framework: "Create React App"
5. Root Directory: `frontend`

### 3B. Add Environment Variables in Vercel
In Vercel project settings → Environment Variables, add:

```
REACT_APP_API_URL=https://your-railway-domain.up.railway.app
```

### 3C. Deploy
Vercel auto-deploys on push to main. Your frontend will be at:
```
https://recap-ai.vercel.app (or custom domain)
```

---

## PHASE 4: FINAL CONFIGURATION

### 4A. Update Railway CORS (if needed)
In Railway dashboard, update `FRONTEND_URL` variable:
```
FRONTEND_URL=https://recap-ai.vercel.app
```

### 4B. Test Connection
1. Go to your Vercel URL
2. Upload a document
3. Check logs in Railway dashboard for errors

---

## TROUBLESHOOTING

### Frontend can't connect to backend
- Check `REACT_APP_API_URL` in Vercel env vars
- Verify Railway `FRONTEND_URL` matches your Vercel domain
- Check Railway logs for CORS errors

### MongoDB connection fails
- Verify `MONGODB_URI` is correct
- Check MongoDB Atlas whitelist allows all IPs (0.0.0.0/0)

### Railway build fails
- Check logs: Railway Dashboard → Deployments
- Ensure `requirements.txt` has all dependencies
- Verify Procfile is in backend/ root

---

## Quick Reference

| Service | URL Pattern | Type |
|---------|------------|------|
| Backend | https://your-project.up.railway.app | FastAPI |
| Frontend | https://project.vercel.app | React |
| Database | MongoDB Atlas Cloud | MongoDB |

