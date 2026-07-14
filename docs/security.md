# OutreachOps AI — Security & Guardrails

This document describes the safety engineering practices, encryption designs, network protections, and sending safeguards implemented in OutreachOps AI.

---

## 1. Authentication & Owner-Only Access
* **Whitelist Check**: System entry is restricted to the owner email configured under `OWNER_EMAIL`. All non-matching JWT signatures are rejected.
* **Token Verification**: Handled server-side by the FastAPI backend validating Supabase JWT signatures. No client-supplied user IDs are trusted.
* **Durable Authentication Rate Limiting**: Attempts are tracked by IP in the database. Ten failed attempts within a 60-second window will temporarily block the IP.

---

## 2. Secrets Management & Decryption
* **Secrets Hygiene**: API keys, credentials, and credentials keys are stored securely in `.env` files. No credentials or OAuth configurations are checked into git.
* **Base64 Startup Decryption**: Credentials keys stored in environment variables (e.g. `GMAIL_CREDENTIALS_B64`) are automatically decoded into temporary JSON/PKL files during startup.

---

## 3. Data Encryption
* Integrations metadata (e.g. Gmail OAuth tokens and spreadsheet credentials) is encrypted before being stored in the database.
* **Fernet Symmetric Cryptography**: Encryption is handled using Fernet cryptography utilizing `ENCRYPTION_KEY`. Stored database fields cannot be read in plain-text if the database is compromised.

---

## 4. SSRF & DNS Rebinding Prevention
To secure website crawls, the `WebsiteResearchService` enforces several guardrails:
* **Private Network Blocking**: IP ranges (such as `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`, AWS/GCP metadata ports `169.254.169.254`) are blocked.
* **Port Whitelisting**: Connections are restricted strictly to standard HTTP/HTTPS ports (`80` and `443`).
* **DNS Rebinding Protection (Pinned DNS)**: Hostnames are verified to safe IPs before requests. During the HTTP stream, the custom `pinned_dns` context pins the socket resolution to the validated safe IP.
* **DNS Timeout**: Explicit 5-second timeout on DNS lookup operations using threaded joins.

---

## 5. Upload Safety
* Universal imports accept only `.csv`, `.xlsx`, and `.xls` files.
* Content validation is executed before DB commit, filtering out corrupted binary structures or executable headers to prevent remote code executions.

---

## 6. Prompt Injection Mitigation
* Prompts are compiled into templates where lead website details are sanitized and passed inside designated user parameter segments.
* Responses are forced into structured JSON formats with strict JSON schema parsing and schema validation rules.

---

## 7. Outbound Sending Safeguards
* **Do-Not-Contact (DNC) crosscheck**: Scans recipient addresses against DNC database registry before enqueueing or dispatching.
* **Daily Caps**: Enforces strict daily caps (default: 50 emails/day) to prevent bulk spam issues.
* **Inter-send Spacing Delays**: Adds a 60-second delay between dispatches to mimic natural human typing behaviors and protect domain health.
* **Same-Day Double-Contact Lock**: Prevents dispatching multiple campaigns or pitch templates to the same recipient on the same day.
