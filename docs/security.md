# OutreachOps AI — Security & Safety Guardrails

This document outlines the safety guardrails, environment hygiene, and security design patterns built into OutreachOps AI.

---

## 1. Secrets Management & Git Hygiene

* **Credential Suppression**: All configuration settings and API keys are stored in server-side `.env` files. No credentials or OAuth JSON files are checked into version control.
* **Gitignore Directives**: The root `.gitignore` explicitly blocks the following file patterns:
  - `*.json` (specifically `sheets_credentials.json` and `gmail_credentials.json` at root or config directories)
  - `*.pkl` (specifically `gmail_token.pkl` which stores access and refresh tokens)
  - `.env` and `.env.local`
  - `.venv/` and `__pycache__/`

---

## 2. Row Level Security (RLS) in Supabase

Every table in the database is protected by PostgreSQL Row Level Security (RLS) policies.

* **Owner Scoping**: Users can only read, write, update, or delete rows where the `user_id` column matches their authenticated user ID (`auth.uid()`).
  ```sql
  -- Example policy for leads table
  CREATE POLICY "Leads user isolation" 
  ON public.leads 
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);
  ```
* **Database Client Isolation**: The Next.js client uses the Anon Key (which respects RLS policies), while the FastAPI backend service uses the Service Role Key exclusively for secure, server-side orchestration.

---

## 3. Email Outbound Guardrails (Safety Core)

OutreachOps AI implements strict rules to prevent automated spamming, domain reputation damage, and double-contact errors:

### I. Do Not Contact (DNC) Blocklist
Before any email dispatch, the backend queries the `do_not_contact` table. If the recipient email exists in this blocklist, the draft status is marked as `rejected` and the transmission is blocked immediately.

### II. Validation Engine
Emails must pass a validation check using regex formatting. If the contact email format is missing or invalid, the dispatch fails, the draft status updates to `failed`, and a failure log is created.

### III. Daily Send Throttling
* The backend enforces a configurable `DAILY_SEND_LIMIT` (e.g., 50 sends per user).
* Once the limit is met, all remaining approved drafts are paused, preventing accidental spikes.

### IV. Inter-Send Delay (Spacing)
* To avoid being flagged as bot behavior by Google mail servers, the outbox processor waits `SEND_DELAY_SECONDS` (default: 60 seconds) between successive email sends.
* This delay is processed asynchronously in the background.

### V. Same-Day Double Contact Lockout
* A lock prevents sending both a website improvement email and an ERP pitch email to the same contact on the same calendar day.
* If a draft has been successfully sent to a recipient, any subsequent draft to that contact is held in the queue.
