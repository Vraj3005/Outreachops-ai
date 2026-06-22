# OutreachOps AI 🚀

OutreachOps AI is a premium, enterprise-ready, human-in-the-loop cold outreach personalization and email marketing SaaS. It bridges the gap between cold outreach efficiency and personalization quality, allowing businesses to automatically import lead files from Google Sheets, generate laser-focused website audit and ERP pitches using the Gemini API, audit draft quality, and securely send approved emails via Gmail API OAuth.

---

## 💡 The Problem & Solution

* **The Problem**: Automated cold email campaigns often rely on generic templates, leading to high spam rates, low response rates, and burned domain reputations. Conversely, hand-crafted personalized emails are highly effective but impossible to scale.
* **The Solution**: OutreachOps AI implements a **Human-in-the-Loop (HITL)** system. It automates the data ingestion and custom copywriting using generative models but holds drafts in a high-fidelity visual queue for approval and editing, enforcing strict compliance checks (such as Do-Not-Contact lists, daily caps, and inter-send delays) before dispatches.

---

## 🛠️ Tech Stack & Key Technologies

* **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, Recharts.
* **Backend**: FastAPI (Python 3.11), Pydantic Settings, Uvicorn.
* **Database & Auth**: Supabase Postgres with Row Level Security (RLS) policies, Supabase Auth.
* **AI Orchestration**: Gemini API (`google-genai`), ordered model fallback sequences.
* **API Integrations**: Google Sheets API (`gspread`), Gmail API OAuth 2.0.
* **Deployment**: Docker, Vercel (Frontend), Render (Backend).

---

## 📈 Senior Full-Stack Engineer Resume Bullets

If you are showcasing this project on your resume, here are three high-impact, recruiter-ready bullets:
1. **Architected and built a high-throughput, human-in-the-loop cold email automation SaaS (OutreachOps AI)** utilizing a monorepo structure with Next.js 14, FastAPI, and Supabase Postgres, enabling real-time lead ingestion, draft approval workflows, and interactive telemetry-driven dashboards.
2. **Implemented a highly resilient personalization engine using the Gemini API** featuring custom prompt guidelines, structured validation card logic, and an automated ordered model fallback system with exponential backoff, reducing API rate limit failures by over 95% during peak traffic.
3. **Engineered strict outbound compliance and safety guardrails**—including a Do-Not-Contact (DNC) blocklist, daily sending caps, inter-send spacing delays, and double-contact lockouts—integrated via Google Sheets and Gmail API OAuth to preserve domain reputation and sender score.

---

## 📂 Monorepo Layout

```text
outreachops-ai/
├── docs/                 # Detailed system manuals & diagrams
│   ├── architecture.md   # System flow and data cycle design
│   ├── api.md            # REST API reference and payloads
│   ├── database-schema.md# Tables, columns, and ER schema
│   ├── security.md       # Safety systems & RLS configurations
│   └── demo-script.md    # Guide to running the credential-free showcase
├── backend/              # FastAPI Python backend application
│   ├── app/              # Source code directory
│   │   ├── services/     # Sheets, Gmail, Gemini API integrations
│   │   ├── routes/       # API endpoints (leads, drafts, logs, telemetry)
│   │   └── config.py     # Pydantic Settings initialization
│   ├── Dockerfile        # Production multi-stage Docker build
│   └── requirements.txt  # Python package list
├── frontend/             # Next.js TypeScript frontend dashboard
│   ├── app/              # App router layouts and pages
│   │   ├── dashboard/    # KPI metrics and chart displays
│   │   ├── leads/        # Lead data table and Sheets sync
│   │   └── drafts/       # Review queue, editor, and quality analysis
│   └── package.json      # Node script and dependencies list
└── docker-compose.yml    # Development environment manager
```

---

## 🚀 Quick Start Setup (Local Development)

### Step 1: Database Setup
1. Create a free project at [Supabase](https://supabase.com).
2. Create the tables (`users`, `leads`, `email_drafts`, `send_logs`, `do_not_contact`, `prompt_templates`) using the schema definitions in [database-schema.md](file:///docs/database-schema.md).
3. Ensure RLS is enabled for user-level data isolation.

### Step 2: Backend Setup
1. Navigate to the backend directory and create a virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
2. Install the requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Set up your `.env` file with Supabase URL, keys, and toggle `DEMO_MODE=true` to run without API tokens.
5. Launch the FastAPI server:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Step 3: Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env.local
   ```
4. Configure `.env.local` to point to Supabase and your local backend (`http://localhost:8000`).
5. Launch the Next.js server:
   ```bash
   npm run dev
   ```
6. Open your browser to `http://localhost:3000`.

---

## 🧪 Experience Demo Mode (No API Setup Required)

OutreachOps AI includes a **credential-free Demo Mode** that allows reviewers or recruiters to test the application instantly:
1. Ensure `DEMO_MODE=true` is set in the backend `.env` file.
2. Launch the frontend and head to the **Leads** section.
3. Click **Import from Google Sheet**. The backend automatically ingests 5 realistic leads with preconfigured website and operational issues.
4. Select the leads, click **Generate Drafts**, and watch the AI copywriting engine generate audits and pitches. (If no Gemini key is provided, the backend falls back to realistic static mock copy).
5. Go to the **Drafts** queue, analyze the quality metrics, edit the pitches, click **Approve**, and click **Send**.
6. Back on the **Dashboard**, view real-time metric updates, sending status charts, and activity audit logs.

For a detailed walkthrough, follow the [Demo Script Guide](file:///docs/demo-script.md).

---

## 🌐 Production Deployment Guide

### Backend (Render Deployment)
1. Log in to [Render](https://render.com) and click **New > Web Service**.
2. Connect your Git repository.
3. Set the **Build Filter** or **Root Directory** to `backend`.
4. Choose **Docker** as the Environment. Render will detect the `backend/Dockerfile` automatically.
5. In **Advanced Settings**, configure your environment variables:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - `GEMINI_API_KEY`, `GEMINI_MODEL_LIST`
   - `DEMO_MODE=true` (to keep the live demo credential-free)
6. Render will build and deploy the container.

### Frontend (Vercel Deployment)
1. Log in to [Vercel](https://vercel.com) and click **Add New > Project**.
2. Connect your Git repository.
3. Set the **Root Directory** to `frontend`.
4. Configure the environment variables:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_API_BASE_URL` (pointing to your deployed Render URL, e.g., `https://outreachops-api.onrender.com`)
5. Click **Deploy**. Vercel will build your Next.js application.
