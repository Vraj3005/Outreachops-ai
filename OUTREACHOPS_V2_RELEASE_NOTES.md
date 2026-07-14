# OutreachOps AI v2.0.0 — Official Release Notes

OutreachOps AI v2.0.0 introduces production-grade logging, automated multi-service timeouts, dynamic operational worker controls, security boundary fixes, universal import parsing, and multi-step sequence transitions.

---

## 🚀 Key Features & Changes

### 1. Observability & Reliability Upgrade
* **Structured JSON Logging**: Implemented context-aware standard stdout JSON logging; propagates `correlation_id` through HTTP handlers and background tasks using `contextvars`.
* **Standardized Error Codes**: Refactored error handlers to map exceptions to stable responses (`AUTH_EXPIRED`, `QUOTA_EXCEEDED`, `TIMEOUT`, `VALIDATION_ERROR`, `CONNECTION_FAILED`).
* **Live Engine Diagnostics**: Added authenticated diagnostic endpoints providing worker status heartbeats, database ping checks, queue depths, and stuck job listings.

### 2. Service-Level Timeouts & DNS Guardrails
* **Enforced Network Boundaries**: Standardized timeouts across external services (30s for Gemini API, 15s for Gmail/Google Sheets/Supabase APIs, and 10s for crawls).
* **DNS Resolution Limit**: Integrated custom thread-join handlers restricting host resolutions to 5 seconds max.

### 3. Dynamic Daemon Operations
* **Worker Controls**: Toggles to pause/resume sending and generation worker daemons, and toggle queue draining.
* **Database State**: Persistent storage of configurations inside `owner_settings`.

### 4. Hardened Security Guardrails
* **SSRF & DNS Rebinding**: Restricted crawls to safe IP ranges and ports 80/443; pinned target socket resolutions to pre-verified IPs during requests.
* **OAuth Encryptions**: Symmetric encryption of integration tokens using Fernet cryptographic functions.
* **Email Safety**: Added DNC blocklists, same-day double-contact lockouts, daily send throttling, and linebreak sanitization.

### 5. Automated Local CI checks
* Created `run_ci_checks.ps1` validating secret detection, code formatting (Black), ruff linting, pytest suites (passing with 22.0% coverage), Next.js typechecks, and production bundle builds.
