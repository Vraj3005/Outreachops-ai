# OutreachOps AI — Interview Q&A Guide

This guide compiles answers to key architecture, security, and systems engineering decisions you might be asked during interviews regarding this project.

---

## 💬 Core Questions & Answers

### 1. Why FastAPI for the backend instead of NestJS or Django?
* **Async & Performance**: Cold outreach orchestration consists of multiple network I/O operations (fetching websites, calling Gemini, checking Gmail threads). FastAPI’s native async/await model handles high volumes of concurrent I/O operations with minimal memory consumption.
* **Pydantic Validation**: Input data (leads spreadsheets, settings fields) are automatically verified and validated at the boundary using Pydantic, ensuring clean error outputs before database queries.

### 2. What is the database strategy, and why does it support an SQLite fallback?
* **Supabase Postgres (Production)**: Supabase Postgres provides database storage with Row-Level Security (RLS). This ensures that user data is isolated at the database engine level.
* **SQLite Fallback (Development & Demo)**: Setting `ENV=test` triggers a local SQLite database setup. This creates an offline-friendly, self-contained, credential-free database environment, making it perfect for recruiter demos, local testing, and automated test suite runs.

### 3. How does Row-Level Security (RLS) isolate data?
* Every query made by the client anon key requires Postgres to validate the user ID context:
  `auth.uid() = user_id`
* This isolates tenant datasets and blocks unauthorized queries.
* The backend API server connects using the service role key, bypassing RLS to safely manage queue tasks and sync threads server-side only.

### 4. How did you secure Gmail integrations?
* The system uses Google OAuth 2.0 Web flow.
* **Symmetric Encryption**: Refresh and access tokens are encrypted in Postgres using **Fernet symmetric cryptography**. If database tables are leaked, OAuth credentials cannot be decrypted without the `ENCRYPTION_KEY` env var.
* **MIME safety**: Receivers and subject lines are stripped of linebreaks (`\r`, `\n`) to prevent email header injection vulnerabilities.

### 5. Why is Server-Side Request Forgery (SSRF) a risk for this app, and how did you prevent it?
* **The Risk**: To personalize campaigns, the app scrapes prospect websites. If not protected, a user could supply a URL pointing to local files (`file:///etc/passwd`) or internal network metadata endpoints (like AWS metadata `http://169.254.169.254`), leading to data theft or internal scans.
* **The Mitigation**:
  * Block private IP ranges (localhost, loopback, private classes).
  * Lock connections strictly to ports 80 and 443.
  * Implement **Pinned DNS** binding via `socket.getaddrinfo` to ensure the host doesn't re-resolve to an internal IP mid-request (preventing DNS Rebinding).
  * Wrap DNS lookups in a thread-based join with a strict 5-second timeout.

### 6. Explain your structured logging design and how it helps troubleshooting.
* Outputs are formatted as JSON lines, containing details like level, timestamp, logger name, and messages.
* We leverage `contextvars` to store `correlation_id` contexts set by the HTTP request middleware.
* These correlation IDs flow through backend API endpoints to background worker loops, letting developers group and trace a request's exact lifecycle during logs analysis.
