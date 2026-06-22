# OutreachOps AI — Recruiter Demonstration Script

This script walks through demonstrating the complete core capabilities of OutreachOps AI without needing live Google API credentials or Gemini API keys, utilizing the built-in **Demo Mode**.

---

## Prerequisites
1. Ensure the backend `.env` file has:
   ```ini
   DEMO_MODE=true
   ```
2. Start the FastAPI backend and Next.js frontend servers.
3. Open the frontend landing page in your browser (`http://localhost:3000`).

---

## Step-by-Step Flow

### Step 1: Login
1. Navigate to the `/login` page.
2. Enter the demo credentials (or create a new account via Supabase Auth signup).
3. Upon entering, you are redirected to the Dashboard. Notice the dashboard KPIs and charts initialize.

### Step 2: Ingest Leads (Sheets Simulator)
1. Click **Leads** in the side navigation bar.
2. Observe that the leads table is initially empty.
3. Click the **Import from Google Sheet** button.
4. The backend sheets service detects `DEMO_MODE=true`, bypasses live sheet connections, and inserts 5 mock construction and roofing leads with distinct pain points into your Supabase database.
5. The frontend table refreshes to show the loaded leads (e.g., *Apex Roofing Solutions*, *Beacon Masonry Inc*, etc.).

### Step 3: Generate Personalizations (Gemini Simulator)
1. Select one or multiple checkbox items next to the imported leads.
2. Click **Generate Drafts**.
3. Choose the type of personalization you want (e.g., **Website Email**, **ERP Email**, or **Both**).
4. Click **Confirm**. The app triggers draft generation in the background.
5. In Demo Mode, the backend checks for a `GEMINI_API_KEY`. Since it is empty/mock, the engine retrieves realistic, context-specific website/ERP pitches and evaluates them through the `EmailQualityService`.
6. You are automatically redirected to the **Drafts** queue.

### Step 4: Review and Edit Drafts (Quality Core)
1. Browse the cards under the **Website Emails** or **ERP Emails** tabs.
2. Note the dynamic badges showing calculated scores:
   - **Quality Score** (e.g., 90%)
   - **Spam Risk** (e.g., low score is good)
   - **Clarity & Personalization Scores**
3. Select a draft card and click **Edit**.
4. Modify the email body or subject, then click **Save**. The draft updates in the Supabase DB and reflects instantly.

### Step 5: Safety Checks & Send (Gmail Simulator)
1. Click **Approve** on one of the drafts. The draft's status changes to `approved` and is highlighted.
2. Click **Send Email** on an approved draft.
3. The backend executes validation rules:
   - Email format is checked.
   - Do Not Contact (DNC) blocklist is checked.
   - Frequency capping rules are checked.
4. The Gmail API dispatch is mocked. The backend logs the attempt as a success, records a simulated `gmail_message_id`, and sets the draft status to `sent`.

### Step 6: Telemetry Dashboard Audit
1. Return to the **Dashboard**.
2. Notice the KPI cards have updated dynamically:
   - **Total Leads**: 5
   - **Drafts Generated**: 5 (or based on selections)
   - **Approved**: Count matches approved drafts
   - **Sent Today**: Count matches dispatched sends
3. The charts display the updated data breakdown (Website vs ERP distribution, send volume over time).
