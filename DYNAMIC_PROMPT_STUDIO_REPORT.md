# Dynamic Prompt Studio System Report

This report outlines the design, implementation details, and verification outcomes for the rebuilt **Dynamic Prompt Studio** engine.

---

## 1. Safe Template Engine (`SafeTemplateRenderer`)

Implemented a custom template parsing class in `app/services/template_renderer.py`:
* **Syntax Format**: Employs double-curly-braces (`{{variable_name}}` or `{{variable_name|fallback}}`) syntax.
* **Security Bounds**: Employs regex lookaround matches to parse tokens; completely avoids raw Python `eval` or arbitrary statement execution blocks.
* **Output Caps**: Restricts maximum rendering size to 10,000 characters to prevent memory exhaustion from recursion or long loops.
* **Fallback Values**: Parses optional fallback strings natively via `{{variable_name|fallback}}` if a parameter resolves to empty or null.

---

## 2. Namespace Whitelists

Restricts variables to verified namespace paths:
* **Lead**: `first_name`, `last_name`, `full_name`, `company_name`, `job_title`, `contact_email`, `website`, `industry`, `country`, `city`, `custom.*`
* **Campaign**: `campaign.name`, `campaign.objective`, `campaign.offer`, `campaign.value_proposition`, `campaign.target_audience`, `campaign.cta`
* **Research**: `research.summary`, `research.services`, `research.observations`, `research.sources`
* **Sender**: `sender.name`, `sender.company`, `sender.website`, `sender.phone`, `sender.signature`
* **Sequence**: `sequence.step_number`, `sequence.previous_subject`

---

## 3. Real-Time Template Validation

Exposes syntax-checking audits on the validation endpoint `/prompts/validate`:
* **Brace Balancing**: Validates unmatched opening/closing braces.
* **Typo Warnings**: Highlights single-braced placeholders (e.g. `{first_name}`) as potential typos.
* **Unknown Detections**: Lists all placeholder parameters not matching the allowed namespace whitelist.
* **Instructive Preview**: Returns a live preview compiled against standard sandbox context.

---

## 4. Immutable Version Controls & Comparisons

Provides history tracking for prompt templates:
* **Immutable Logs**: Every save version creates a permanent, un-editable `prompt_versions` table record.
* **State Modes**: Allows versioning states between `'draft'` (inactive template) and `'published'` (active template text).
* **Rollbacks**: The `/activate` endpoint updates the active status and propagates the selected version text back to the main `prompt_templates` template text.
* **Diff comparisons**: Exposes `/compare` diffing texts utilizing standard Python `difflib.ndiff` inline comparison indicators (e.g., lines starting with `+`, `-`, or ` `).

---

## 5. Live Simulation Testing & Telemetry

Integrates sandbox trial dispatches on the `/test` endpoint:
* **Dynamic Lead Selector**: Merges select target lead data inside the namespaces schema context.
* **Token Estimator**: Heuristic char-length ratio analysis calculates simulated token count requirements.
* **AI Rationale Tray**: Exposes Gemini's internal displayed `reasoning` rationale dynamically.
* **Scoring Rules**: Calculates quality scores, personalization, and spam risks, ensuring compliance warnings.

---

## 6. AI-Assisted Template Builders

Allows generation of prompt guidelines from owner instructions:
* **Generic Builders**: Gemini generates guidelines prompts utilizing double-braced placeholder parameters, completely avoiding legacy hardcoded ERP terminology.
* **Structured JSON**: Native GenAI client config `response_mime_type="application/json"` forces structured returns containing `subject`, `body`, `reasoning`, and `warnings`.

---

## 7. Automated Test Suites

Implemented unit tests covering renderers, syntax validations, comparisons diffs, and mock testing dispatches:
* **Test Location**: `backend/tests/test_prompt_studio_v2.py`
* **Verification Outcome**: **54/54 tests passed successfully** with **47.80% overall test coverage**.
