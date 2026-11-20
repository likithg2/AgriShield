# AgriShield Deployment Guide

## Architecture

| Component | Service | URL pattern |
|-----------|---------|-------------|
| Frontend (React + Vite) | Vercel Hobby (Free) | `https://<your-project>.vercel.app` |
| Backend (FastAPI) | Render Free | `https://<your-service>.onrender.com` |
| Database | Supabase PostgreSQL Free | Provided connection string |

> [!IMPORTANT]
> Both Vercel and Render assign URLs automatically. The examples in this guide use placeholder names. Use the actual URLs assigned by each provider.

> [!NOTE]
> Render Free spins down after 15 minutes of inactivity. The first request after inactivity takes 30–60 seconds (cold start). This is expected behaviour on the free tier — do not add artificial heartbeat requests.

---

## Pre-Deployment Checklist

- [ ] GitHub repository is public (or Render/Vercel can access it)
- [ ] All secrets are in environment variables, **not** in code
- [ ] `frontend/.env.local` is in `.gitignore` (it is)
- [ ] `.env` is in `.gitignore` (it is)
- [ ] Model files are committed: `artifacts_v2.pkl`, `vegetable_quality_v5_model.keras`

---

## Step 1 — Supabase PostgreSQL (Database)

1. Go to [https://supabase.com](https://supabase.com) and sign in / create an account.
2. Click **New project** → choose a name (e.g. `agrishield`) → set a database password → select the **Singapore** region.
3. Wait for provisioning (~2 min).
4. Go to **Settings → Database → Connection string → URI** → copy the string.
   - It looks like: `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres`
5. Keep this connection string — you'll add it to Render as `DATABASE_URL`.

> [!NOTE]
> Supabase Free: 500 MB storage, 2 compute hours per day. The project **pauses after 1 week of inactivity**. Resume it from the Supabase dashboard when needed.

---

## Step 2 — Render (Backend)

### 2a. Create the service

1. Go to [https://render.com](https://render.com) → **New → Web Service**.
2. Connect your GitHub account and select the `AgriShield` repository.
3. Set the following:

   | Field | Value |
   |-------|-------|
   | **Name** | `agrishield-api` (or any name you prefer) |
   | **Region** | Singapore |
   | **Branch** | `main` |
   | **Root Directory** | *(leave empty — project root)* |
   | **Runtime** | Python 3 |
   | **Build Command** | `pip install -r backend/requirements.txt` |
   | **Start Command** | `uvicorn backend.main:app --host 0.0.0.0 --port $PORT` |

4. Under **Advanced**, add a **Health Check Path**: `/api/health`
5. Select the **Free** plan.
6. Click **Create Web Service**.

### 2b. Add environment variables

In the Render dashboard → your service → **Environment**:

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Your Supabase PostgreSQL URI |
| `SECRET_KEY` | A long random string (run `python -c "import secrets; print(secrets.token_hex(32))"`) |
| `ALLOWED_ORIGINS` | `https://<your-vercel-url>.vercel.app` (set after Vercel deploy) |
| `WEATHER_API_KEY` | Your OpenWeatherMap key |
| `GEMINI_API_KEY` | Your Google Gemini key |
| `GOOGLE_API_KEY` | Your Google API key |
| `PYTHON_VERSION` | `3.11.0` |

> [!CAUTION]
> Never put real secrets in `render.yaml` or any file committed to git. Only set them in the Render dashboard.

### 2c. Database initialization

After the first successful deploy, the app will auto-create all tables via SQLAlchemy on startup.

To seed initial data (warehouses, admin user), SSH into the Render shell or run locally pointing to Supabase:

```bash
DATABASE_URL="<your-supabase-url>" python backend/seed_data.py
```

### 2d. Note your Render URL

After deploy succeeds, Render shows your service URL, e.g. `https://agrishield-api.onrender.com`. Copy it.

---

## Step 3 — Vercel (Frontend)

### 3a. Create the project

1. Go to [https://vercel.com](https://vercel.com) → **Add New → Project**.
2. Import your `AgriShield` GitHub repository.
3. Set the following:

   | Field | Value |
   |-------|-------|
   | **Framework Preset** | Vite |
   | **Root Directory** | `frontend` |
   | **Build Command** | `npm run build` |
   | **Output Directory** | `dist` |

### 3b. Add environment variable

Under **Environment Variables** before deploying:

| Key | Value |
|-----|-------|
| `VITE_API_BASE_URL` | `https://<your-render-service>.onrender.com/api` |

4. Click **Deploy**.

### 3c. SPA routing

The `frontend/vercel.json` already configures all routes to redirect to `index.html` for React Router to handle. No additional setup needed.

---

## Step 4 — Update CORS on Render

Once Vercel gives you your frontend URL (e.g. `https://agrishield-abc123.vercel.app`):

1. Go to **Render → Your Service → Environment**.
2. Update `ALLOWED_ORIGINS` to your actual Vercel URL.
3. Render will redeploy automatically.

---

## Step 5 — Verify

| Check | How |
|-------|-----|
| Backend alive | `GET https://<render-url>/api/health` → `{"status":"healthy"}` |
| DB connected | `GET https://<render-url>/api/health/ready` → `{"ready":true}` |
| Frontend loads | Open `https://<vercel-url>.vercel.app` |
| Login works | Use a seeded account or register |
| Prediction works | Submit a prediction form |
| Image analysis | Upload a crop image |

---

## Render Cold Start Handling

After 15 min inactivity, the first request takes 30–60 seconds. The frontend shows API errors during this time. Users should wait and retry. This is a free-tier limitation.

---

## Cost Summary

| Service | Plan | Cost |
|---------|------|------|
| Vercel | Hobby | ₹0/month |
| Render | Free | ₹0/month |
| Supabase | Free | ₹0/month |
| **Total** | | **₹0/month** |

---

## Local Development

```bash
# Backend
cd d:/projects/AgriShield
backend/venv/Scripts/python -m uvicorn backend.main:app --reload

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

The frontend `.env.local` file sets `VITE_API_BASE_URL=http://localhost:8000/api` automatically.
