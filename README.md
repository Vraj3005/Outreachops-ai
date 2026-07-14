# OutreachOps AI v2 🚀

OutreachOps AI v2 is a specialized, human-in-the-loop cold outreach personalization and email marketing platform designed for single-owner agencies, consultants, and B2B services. It automates lead research and personalized copy generation using the Gemini API, while holding all drafts in a high-fidelity visual queue for approval and editing, enforcing strict safety checks before Gmail dispatch.

---

## 💡 The Problem & Solution

* **The Problem**: Automated cold email campaigns often rely on generic templates, leading to high spam rates, low response rates, and burned domain reputations. Conversely, hand-crafted personalized emails are highly effective but impossible to scale.
* **The Solution**: OutreachOps AI implements a **Human-in-the-Loop (HITL)** system. It automates the data ingestion and custom copywriting using generative models but holds drafts in a review queue for approval and editing, enforcing strict compliance checks (such as Do-Not-Contact lists, daily caps, and inter-send delays) before dispatches.

---

## 🛠️ Core Capabilities

### 1. Single-Owner Design
* Designed specifically for solo agencies, consultants, or single-operator teams.
* Scoped multi-tenant data structures, where all database entries are strictly separated and secured.
* Simple, robust credential management designed for easy local setup or solo production hosting without team/collaborator bloat.

### 2. Universal Imports & Column Mapping
* Supports uploading and importing arbitrary `.csv`, `.xlsx`, or `.xls` spreadsheets.
* **Column Mapping Engine**: Dynamically matches source headers to target contact fields (e.g. Email, Company Name, First Name, Industry) with real-time import preview and validation.
* Remembers previous mappings to save time on subsequent imports.

### 3. Generic & Custom Campaigns
* Supports generic campaign types where templates and rules are configured around custom target audiences, tone of voice, offers, and call-to-actions (CTAs).
* No longer locked to rigid pre-configured ERP pitches; fully flexible for any outreach objective.

### 4. Multi-Step Sequences
* Define sequential multi-step templates (Step 1, Step 2, Follow-up) with custom delay amounts (in hours or days).
* Automatic state transitions move leads from "enrolled" to "scheduled", "sent", and eventually "completed".

### 5. Website Research Snapping
* **Website Research Service**: SSRF-safe scraper crawls homepages and subpages safely to extract visible textual content.
* Bypasses blocks gracefully by reading and respecting target `robots.txt` guidelines.
* Leverages Gemini to build structured company summaries, personalization facts, and relevance analysis.

### 6. AI Personalization & Prompt Versions
* Formulates hyper-targeted copy based on lead research details.
* **Prompt Studio**: Version-controlled prompt templates with active drafts simulation. Warnings are triggered automatically in the UI if expected template variables are missing.
* ResilientOrdered model fallback list automatically shifts down the hierarchy (e.g., trying Gemini 2.5 Flash, then falling back to Lite versions) if temporary API rate limits or quota boundaries are encountered.

### 7. Human Review & Approval Loop
* All generated draft items land in a dedicated **Draft Queue**.
* Edit subject lines or email bodies, view model scoring (clarity, personalization, spam risk), or trigger a manual regeneration.
* Approve items individually or in bulk to queue them for scheduling.

### 8. Gmail Delivery Safety & Safeguards
* **DNC Registry**: Cross-checks recipient addresses against a Do-Not-Contact (DNC) blocklist before dispatch.
* **Daily Caps**: Enforces strict daily caps (e.g. 50 sends/day) and inter-send spacing delays (e.g. 60 seconds) to mimic natural human typing behaviors and protect domain reputation.
* **Same-Day Double-Contact Lock**: Prevents sending multiple cold emails to the same recipient on the same day.

### 9. Reply Sync & Stop Sequences
* Background synchronization process crawls Gmail inbox threads securely.
* Automatically analyzes incoming emails using rule-based classification models.
* Categorizes sentiment and automatically transitions the campaign lead to "stopped" if a reply is detected, preventing embarrassing template follow-ups after a prospect responds.

### 10. Dashboard & Analytics
* Telemetry metrics covering lead funnel statistics, send success rates, reply counts, and campaign conversion rates.
* Real-time engine observability diagnostics monitoring daemon heartbeats, database ping rates, and queue depths.

---

## 🏗️ Technology Stack

* **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, shadcn/ui, Lucide Icons, Recharts.
* **Backend**: FastAPI (Python 3.11/3.14), SQLite / Supabase Postgres.
* **Orchestration**: Gemini API (`google-genai`), Google Sheets API (`gspread`), Gmail API OAuth 2.0.

---

## 📂 System Layout

```text
outreachops-ai/
├── docs/                 # System guides and references
│   ├── architecture.md   # System flow and data cycle design
│   ├── api.md            # REST API reference and payloads
│   ├── database-schema.md# Tables, columns, and ER schema
│   ├── security.md       # Safety systems & RLS configurations
│   ├── user-guide.md     # Full step-by-step onboarding walkthrough
│   └── deployment.md     # Hosting config (Vercel, Render, Supabase)
├── backend/              # FastAPI Python backend application
│   ├── app/              # Source code directory
│   │   ├── services/     # Sheets, Gmail, Gemini, research modules
│   │   ├── routes/       # API endpoints (leads, drafts, settings, health)
│   │   └── utils/        # Logging, crypt, and middleware utilities
│   ├── Dockerfile        # Production Docker build
│   └── requirements.txt  # Python dependencies
├── frontend/             # Next.js TypeScript frontend dashboard
│   ├── app/              # Page layouts and routes
│   └── components/       # Shared UI views and Toast notifications
└── run_ci_checks.ps1     # Automated local pipeline validation script
```

---

## 🚀 Local Development Quickstart

### 1. Backend Setup
1. Navigate to the backend directory and create a virtual environment:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```
2. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example .env
   ```
4. Update `.env` variables (e.g. set `DEMO_MODE=true` to test locally without remote API tokens).
5. Launch the FastAPI server:
   ```bash
   uvicorn app.main:app --port 8000 --reload
   ```

### 2. Frontend Setup
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   npm install
   ```
2. Copy environment configuration:
   ```bash
   cp .env.example .env.local
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Experience Demo Mode

OutreachOps AI includes a **credential-free Demo Mode** that allows reviewers to test the application instantly:
1. Set `DEMO_MODE=true` and `ENV=test` in the backend `.env` file (forces local SQLite mode).
2. Launch the backend and frontend.
3. Go to the **Leads** section in the UI and click **Import from Google Sheet** or upload a file. Real-looking mock leads will be generated.
4. Select leads, click **Generate Drafts**, and watch the visual queue populate with realistic copy (clearly labeled as `[DEMO MOCK]`).
5. Go to the **Queue** page to see the active Heartbeats, Database links, and toggle pause/resume states.
