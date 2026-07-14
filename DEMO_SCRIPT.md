# OutreachOps AI — Recruiter Demonstration Script

This guide outlines a step-by-step workflow to demonstrate OutreachOps AI v2 during live calls or recruiter walkthroughs.

---

## 🎬 Demo Workflow

### Step 1: Showcase Login & Dashboard
1. Open your browser and navigate to `http://localhost:3000`.
2. Explain the **bypassed authentication** designed for recruiter convenience (seeding a local token).
3. The dashboard loads showing live KPIs ( funnel counts, daily quota metrics, send rates, and real-time activity tracking).

### Step 2: Universal Upload & Column Mapper
1. Navigate to **Imports** in the sidebar.
2. Select **Upload File** and upload a test spreadsheet (or select the mock sheet URL).
3. Walk through the **Dynamic Mapping Wizard**. Point out how headers from the arbitrary spreadsheet are matched to backend schemas (`contact_email`, `company_name`, `website`).
4. Click **Preview Mappings** to verify rows, then click **Commit Import**.

### Step 3: Campaign Setup
1. Head to the **Campaigns** tab and select **New Campaign**.
2. Explain that the system supports **generic campaigns**. You can configure objectives (e.g. website speed pitches, SaaS introductions), CTAs, target roles, and custom email tones.
3. Configure a multi-step sequence (Step 1, Step 2 Follow-up) with spacing hours.
4. Enroll your imported leads.

### Step 4: Prompt Tuning & Studio Safety
1. Go to **Prompt Studio** and display system instruction configurations.
2. Introduce a deliberate variable error (e.g., delete `{company_name}` from the user prompt).
3. Show how the Prompt Studio highlights warnings, advising that campaign templates require mandatory placeholders.
4. Correct the error, click **Test Prompt**, and view structured scoring metrics (Clarity, Personalization, and Spam Risk).

### Step 5: Human-in-the-Loop Review Queue
1. Navigate to **Draft Queue**.
2. Select a generated lead draft and review the copy.
3. Tweak the subject line or body text, showing live edits.
4. Click **Regenerate Draft** to show the fallback models cycle.
5. Click **Approve** to move the email into the outbox scheduler.

### Step 6: Queue Diagnostics & Engine Controls
1. Go to the **Queue** page.
2. Show the pending scheduling list, inter-send delays, and send metrics.
3. Call attention to the right-hand **Engine Observability Panel**:
   * Show status indicators and heartbeat times for Sending and Generation worker daemons.
   * Toggle **Pause / Resume** on the outbox dispatcher to demonstrate manual control.
   * Toggle **Queue Draining** to demonstrate how the system handles queue shutdowns gracefully (processing active threads, blocking new claims).

### Step 7: Simulate Outbound Delivery & Analytics
1. Resume the Sending worker.
2. In **Demo Mode**, the worker executes dispatch checks (verifying DNC blocklist, same-day double-contact lock) and simulates sends without sending external emails.
3. Observe draft status update to `sent`.
4. Go back to the **Dashboard** and show live charts updating with sent metrics and success logs.
5. Simulate a prospect reply callback to show that the campaign sequence immediately halts for that recipient, preventing redundant follow-ups.
