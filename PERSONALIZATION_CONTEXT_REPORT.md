# Personalization Context Service Report

This report outlines the architecture, data schemas, fit scoring criteria, and validation controls implemented in the centralized **Personalization Context Service**.

---

## 1. System Inputs & Outputs

### Core Inputs
* **Normalized Lead Fields**: Company name, domain/website, job title, industry vertical, and geographic location.
* **Custom Fields**: Dynamic, user-defined metadata attributes stored on the lead profile.
* **Campaign Settings**: Target vertical vertical rules, location requirements, audience roles, and description specifications.
* **Website Research snapshots**: Factual data points and campaign relevance summaries from crawled pages.
* **Sender/Signature Settings**: Profile coordinates, sender company details, and templates.

### Generated Outputs
* **Personalization Context object**:
  * `factual_context`: Grounding facts marked with their source (e.g. Lead Profile, Website Crawl, or Owner Override).
  * `inferred_context`: Derived observations or suggestions, explicitly labelled with the prefix `[Inferred/Observation]`.
  * `locked_facts`: Custom user-entered personalization observations locked by the owner.
  * `excluded_fields`: Whitelist array detailing which fields were stripped from AI prompt generations.
* **Profile Alignment score (0-100)**: Rules-based match score.
* **Explainable criteria justifications**: Multi-point score additions list explaining vertical matching rules.
* **Diagnostics warnings**: Highlights missing metadata, domain anomalies, and geographic contradictions.
* **Safe AI Context Object**: Size-limited JSON structure stripped of PII fields (phone, email) for prompt template merging.

---

## 2. Fit Scoring System

The fit scoring mechanism prioritizes **transparent explainable rules** over black-box AI decisions:
* **Rules-Based Weighting (90% of total)**:
  * **Industry alignment**: +20 points (target vertical matches lead vertical).
  * **Geographical alignment**: +20 points (lead country or city matches targets).
  * **Job role alignment**: +20 points (lead job title keyword matches targets).
  * **Ingest completeness check**: +15 points (company, website, email, and job title present).
  * **Website Research Freshness**: +15 points (snapshot crawl age less than 7 days).
* **AI Relevance Supplement (10% of total)**:
  * Gemini reviews the lead's website summary against the campaign target outreach description and yields a relevance match (0-10 points).
* **Capping and Safety Warning**:
  * Total fit score is capped at 100 points.
  * An explicit disclaimer is attached to all displays: `"WARNING: The fit score is a campaign profile alignment metric; it must not be interpreted as a conversion probability."`

---

## 3. UI Dashboard Integrations

The lead detail viewer drawer was upgraded in `frontend/app/leads/page.tsx`:
* **Explainable Score meter**: Renders score indicator badges accompanied by the detailed score addition logs.
* **Diagnostics warnings block**: Displays location inconsistencies and data completeness meters.
* **Field Exclusions panel**: Multi-checkbox controls letting users exclude key fields (phone, email, title) from AI prompting.
* **Locked Facts Editor**: Interactive text area allowing users to type and persist custom facts, immediately running score updates.

---

## 4. Test Verification Outcomes

Unit tests in `tests/test_personalization_context.py` verified the following scenarios:
* **`test_sanitize_context_value`**: Checks script tag stripping and injection command filtering.
* **`test_compile_context_no_research`**: Gracefully resolves context when crawling snapshot is missing.
* **`test_detect_field_conflicts`**: Flags geographic conflicts (e.g. Toronto, USA) and domain conflicts (mismatched email/website hosts).
* **`test_custom_fields_and_exclusions`**: Confirms custom fields are parsed and excluded fields are omitted.
* **`test_context_oversized_truncation`**: Truncates website details when compiled context exceeds 5,000 characters.
* **`test_unsupported_campaign_claims`**: Detects and warns when context matches a campaign claims restriction.

**Test Outcomes**: **All 70 tests passed successfully with 49.02% overall test coverage.**
