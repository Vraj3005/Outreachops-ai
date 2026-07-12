# Generic Campaign System Upgrade Report

This document details the transition from legacy mixed/specialized (ERP and website) campaigns to a fully generic campaign system. It covers database migrations, campaign presets, cloning mechanics, configuration snapshots, and testing results.

---

## 1. Database Schema Extensions

We extended the `campaigns` database schema to accommodate all 7 wizard steps:
* **Identification & Objective**: `preset` (preset choice), `description`, and standard campaign metadata.
* **Outreach Offer**: `offer` (description of offer), `value_proposition`, `proof_points`, `required_facts`, and `prohibited_claims`.
* **Audience Filtering**: `target_industry`, `target_roles`, `countries`, `tags` (JSON string list), `min_lead_fit_score` (minimum score), and `selected_leads` (JSON string manual IDs list).
* **Copywriting Constraints**: `tone`, `email_length` (short/medium/long), `language`, `CTA`, `required_content`, `banned_content`, and template identifiers.
* **Control Spacing**: `timezone`, `send_spacing_seconds`, `sending_window_start`, `sending_window_end`, `start_date`, and `approval_mode`.
* **Audit & Reproducibility snapshots**:
  * `sender_profile_snapshot`: JSON dictionary capturing sender name, email, and signature at creation/clone time.
  * `prompt_config_snapshot`: JSON dictionary capturing brand voice, tone, and offer descriptions.
  * `cloned_from_id`: UUID tracking source campaign for cloned records.

---

## 2. Legacy Migration Strategy

A startup migration logic maps old campaign records to generic outreach campaigns:
* **Detection**: Identifies campaigns where `campaign_type` is `'erp'`, `'website'`, or `'mixed'`.
* **Mapping**:
  * Converts `campaign_type` to `'generic'`.
  * If `objective` is empty, maps a default text based on the type (e.g. `'erp'` is mapped to *Introduce an ERP consulting service and propose schedule systems*).
* **Data Integrity**: Maintains all historical campaign metrics, stats, draft relationships, and logs intact.

---

## 3. Clone & Sequence Isolation Mechanics

When copying a campaign:
* **Record Copy**: Duplicates all campaign columns under a new ID and appends `"Copy of "` to the campaign name.
* **Sequence Isolation**: If the campaign has an associated sequence, creates a new sequence record and duplicates all associated `sequence_steps` records under new unique IDs. This isolates the sequence of the copy, so subsequent modifications to the clone do not affect the original campaign's sequence.
* **Snapshots**: Takes a real-time copy of the owner's configurations (sender info, signatures, brand voice) and serializes them in `sender_profile_snapshot` and `prompt_config_snapshot`.

---

## 4. 7-Step Front-End Campaign Wizard

Built a React wizard modal inside `frontend/app/campaigns/page.tsx`:
* **Step 1 — Identity**: Name, description, and presets.
* **Step 2 — Offer**: Offer proposition, required facts, and warnings.
* **Step 3 — Audience**: Location and role targeting, minimum fit scores.
* **Step 4 — Writing**: Tone choices, length selectors, language, and CTA formats.
* **Step 5 — Sequence**: Associated sequence selection.
* **Step 6 — Sending Controls**: Daily caps, inter-send spacing sliders, window hours.
* **Step 7 — Preview**: Lists campaign summary parameters and displays 3 mock outreach drafts fetched from `/preview-drafts`.

---

## 5. Automated Verification Outcomes

We validated the backend endpoints using unit tests:
* **Preservation presets**: Presets are correctly created in a paused state.
* **Cloning & Isolation**: Verifies name copies, isolated step duplicates, and correct snapshot generation.
* **Historical Migration**: Confirms legacy campaigns are transformed to generic format with appropriate defaults.
* **Template Previews**: Previews generate exactly 3 formatted emails reflecting target lead parameters.
* **Status**: **49/49 tests passed successfully** with **46.08% overall coverage**.
