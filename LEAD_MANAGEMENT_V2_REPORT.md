# Lead Management V2 Upgrade Report

This document details the architecture, security sanitization patterns, deliverability validations, scoring models, and bulk actions integrated into the OutreachOps AI v2 Lead Management framework.

---

## 1. Schema & Backend CRUD Models

* **Pydantic Lead Models**: `LeadBase`, `LeadCreate`, `LeadUpdate`, and `Lead` support the generic v2 variables:
  * Standard properties: `website`, `contact_email`, `company_name`, `first_name`, `last_name`, `job_title`, `industry`, `country`, `city`, `phone`.
  * Enrichment properties: `research_status`, `research_summary`, `personalization_context`.
  * Evaluation properties: `fit_score`, `fit_score_reasons` (lists), `email_validation_status`.
  * Custom metadata: `custom_fields` (arbitrary dictionary maps).
* **SQLite & Postgres alters**: Injected `ARCHIVED` status to `LeadStatus` enum choices to support archiving lead rows.

---

## 2. Advanced Normalization Pipeline

The `LeadQualityService.normalize_lead_data` pipeline executes the following checks:
* **Empty Values**: Scans top-level string values and converts empty or `"null"`/`"none"`/`"undefined"` placeholders to a standard `None` placeholder.
* **Email Casing**: Strips whitespaces and downcases characters.
* **URL/Website Structure**: Forces the `https://` schema prefix and normalizes domains (extracting `company_domain` automatically).
* **Phone Formats**: Strips formatting symbols, keeping only numeric digits and a leading `+` symbol where applicable.
* **Locations and Names**: Truncates double spacings and title-cases country and city values.
* **Tags**: Lowercases and deduplicates tags, returning a sorted list array.

---

## 3. Security & Custom Fields Sanitization

To secure the database against script injection or SQL injection attacks through custom column inputs:
* **Key Sanitization**: Custom fields key strings undergo regex sanitization keeping only alphanumeric characters and underscores (`[a-z0-9_]`).
* **Value Sanitization**: String values undergo HTML tag removal matching `<[^>]*>` to clean any script contents or HTML tags before they are saved.
* **Complex Data Support**: Validates nested list arrays or JSON sub-objects safely without parsing errors.

---

## 4. Email Deliverability Validation

Verifies prospects' emails without intrusive SMTP probes:
* **Syntax Validation**: Regex format validation.
* **Disposable Check**: Flags domains present in a local blacklist containing common temporary email hosts.
* **Role Check**: Identifies generic addresses like `info@` or `support@`.
* **DNS Mail Routing**: Validates the domain's live mail server configuration by resolving MX records or looking up A host IP addresses.

---

## 5. Explanatory Fit Scoring

Computes campaign fit alignments (0 to 100 points) based on campaign parameters:
* **Vertical Industry Match**: +20 pts.
* **Region/Location Match**: +20 pts.
* **Target Job Role Title Match**: +20 pts.
* **Contact Completeness (email, phone, etc.)**: +15 pts.
* **AI Research Context presence**: +15 pts.
* **Campaign Custom Rules bonus**: +10 pts.
* **Explanation**: Returns specific point breakdowns and appends a compliance disclaimer: *"Disclaimer: This score represents profile parameter alignment and does not predict actual outreach conversion probability."*

---

## 6. Bulk Actions and CSV Export

* **Bulk Operations Route (`/bulk-action`)**:
  * Applies/removes tags.
  * Enrolls/disenrolls leads into/from campaign mapping queues.
  * Re-triggers email deliverability verifications.
  * Generates mock AI research triggers.
  * Archives leads (updating status to `Archived`).
* **Database CSV Stream (`/export`)**: Streams custom CSV files containing complete lead database details. Matches select filters or exports the entire catalog.

---

## 7. Frontend Integration

Modified `frontend/app/leads/page.tsx`:
* **Configurable Columns**: Allows users to configure active table column views dynamically.
* **Custom Fields Drawer**: Side panel viewer showing JSON structures for custom fields.
* **Validation Badges**: Emerald, Amber, Sky, and Rose badges for valid/disposable/role/invalid emails.
* **CSV Export**: Added an "Export CSV" button to the bulk action bar that queries the backend streaming endpoint.

---

## 8. Automated Testing

Integrated 5 tests inside `backend/tests/test_lead_management_v2.py`:
* **Malicious keys and HTML stripping**
* **Malformed email syntax verifications**
* **Merges and duplicate conflict rules**
* **Custom nested JSON values**
* **Search keyword filtering and pagination offsets**
* **Status**: **45/45 tests passed successfully** with **44.00% coverage**.
