# OutreachOps AI v2 — Production Deployment Guide

This guide details the deployment of the Next.js frontend, FastAPI API server, background worker processes, and Supabase Postgres database.

---

## 1. Supabase Postgres & Auth Setup
1. Create a project at [Supabase](https://supabase.com).
2. Go to **SQL Editor** and execute the database DDL schema located in [database-schema.md](file:///docs/database-schema.md) to set up all tables and indexes.
3. In **Authentication > Providers**, configure your Whitelist settings or email signup settings. Enable Row-Level Security (RLS) on all tables to restrict access to authenticated owners.

---

## 2. API Server & Worker Process Deployment

FastAPI can be deployed to platforms like **Render**, **Railway**, or **Fly.io** using the provided `backend/Dockerfile`.

We recommend deploying two separate resources from the backend:
1. **Web Service (API Process)**:
   * Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   * Handles user requests, settings updates, and imports.
2. **Background Worker Service (Worker Process)**:
   * Command: `python -m app.services.durable_sending_worker` (or run generation/sending daemon processes)
   * Note: In OutreachOps AI, background workers can run as separate services, or start inside the FastAPI server startup hooks using lifespan daemon threads (which is the default configuration for solo deployments).

---

## 3. Environment Variables (Backend)

Ensure the following variables are configured in your server dashboard:

| Variable | Description | Example / Recommended Value |
| :--- | :--- | :--- |
| `ENV` | Deployment environment context | `production` |
| `SUPABASE_URL` | Supabase API connection URL | `https://your-project.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service role credential (server only) | `eyJhbGciOi...` |
| `GEMINI_API_KEY` | Google Gemini API Key | `AIzaSy...` |
| `GEMINI_MODEL_LIST` | Ordered fallback models | `gemini-3.1-flash-lite,gemini-2.5-flash` |
| `ENCRYPTION_KEY` | symmetric cryptography key | Fernet key (see generation below) |
| `OWNER_EMAIL` | Whitelisted administrator email | `admin@agency.com` |
| `DEMO_MODE` | Sandbox credentials bypass toggle | `false` |

### Generating the ENCRYPTION_KEY
The application encrypts credentials in the database using Fernet cryptography. To generate a key, run:
```bash
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## 4. Google OAuth Credentials & Redirect URIs
To enable Gmail integrations, configure Google Cloud Console OAuth details:
1. Go to [Google Cloud Console](https://console.cloud.google.com).
2. Create **OAuth 2.0 Client Credentials** for a Web Application.
3. Configure **Authorized Redirect URIs**:
   * Local: `http://localhost:8000/api/v1/integrations/oauth2callback`
   * Production: `https://your-api-domain.com/api/v1/integrations/oauth2callback`
4. Set the resulting base64 string under `GMAIL_CREDENTIALS_B64` or place the credential JSON file in the backend.

---

## 5. Next.js Frontend Deployment (Vercel)
1. Import your repository into [Vercel](https://vercel.com).
2. Set the **Root Directory** to `frontend`.
3. Configure the **Environment Variables**:
   * `NEXT_PUBLIC_SUPABASE_URL`: `https://your-project.supabase.co`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`: `eyJhbGciOi...` (Anon key)
   * `NEXT_PUBLIC_API_URL`: `https://your-api-domain.com` (API domain)
4. Click **Deploy**.

---

## 6. Scheduled Reply Sync Cron
For production synchronization of incoming email replies, set up a recurring scheduler (e.g. Render Cron Job or GitHub Action) calling the sync route:
* **Trigger Endpoint**: `POST /api/v1/emails/sync` (triggered every 5-10 minutes)
* Alternatively, ensure the built-in background thread runs in your worker process.
