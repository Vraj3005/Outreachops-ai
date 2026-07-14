# Settings and Integrations Technical Report

This report outlines the implementation details for the secure stored settings system and the external API integration handlers in OutreachOps AI v2.

---

## 1. Cryptographic Security Foundation

We implemented URL-safe symmetric AES-256 Fernet keys to encrypt sensitive API tokens and credentials:
* **Key Derivation**: The system derives a stable 32-byte secret key by running SHA-256 over `settings.ENCRYPTION_KEY`. This lets developers configure any arbitrary string in development while generating a valid Fernet key.
* **Storage Encryption**: Sensitive fields (e.g. Gmail refresh tokens, Sheets Service Account JSON key strings, custom Gemini keys) are encrypted before insertion into the database table `integration_connections`.
* **Zero Plaintext Leaks**: De-serialized credential models never expose decrypted secrets to frontend endpoints.

---

## 2. Stored Configuration Schema

We added real persistent config tables mapping settings to the single owner user:
* **Database Alters**: SQLite initialization inside `database.py` automatically injects new columns like `offer_description` and `default_target_audience` into the `owner_settings` table.
* **Branding and Sending Options**: Stores 19 fields including timezone, daily sending cap, delay spacing bounds, and required compliance footers.
* **Pydantic Validation**:
  * Enforces `HH:MM` time bounds using regex formatting.
  * Enforces daily caps between 1 and 1000 sends.
  * Validates email string syntax rules without external library dependencies.

---

## 3. Integrations Handlers

* **Gmail OAuth Connection**: Uses Supabase-backed credentials cache to store OAuth tokens. Re-connects and revokes tokens securely on request.
* **Google Sheets Sync**: Accepts and decrypts service account credentials to access spreadsheet listings dynamically.
* **Gemini Provider**: Custom API key config with fallback model loop checking.

---

## 4. Frontend Experience

* **Settings Page (`frontend/app/settings/page.tsx`)**: Fully integrated forms with optimistic UI state changes, reversing fields to prior values and triggering toasts if saving returns errors.
* **Integrations Page (`frontend/app/integrations/page.tsx`)**: Service account JSON textareas, Gemini configuration modals, OAuth authentication steps, and active disconnect controllers.
