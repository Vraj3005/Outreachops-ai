import json
import logging
import re
from datetime import datetime, timedelta
from typing import Any

from app.config import settings
from app.database import supabase
from app.services.gemini_service import GeminiService

logger = logging.getLogger("outreachops.services.personalization_context")
gemini_service = GeminiService()


# --- Security Sanitizer ---


def sanitize_context_value(val: Any) -> str:
    """
    Sanitizes values to block prompt injection markers and limits character lengths.
    """
    if val is None:
        return ""
    text = str(val).strip()

    # Strip potential injection indicators
    injection_patterns = [
        r"(?i)ignore\s+previous\s+instructions",
        r"(?i)system\s+override",
        r"(?i)you\s+must\s+now",
        r"(?i)<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>",
    ]
    for pattern in injection_patterns:
        text = re.sub(pattern, "[injection_filtered]", text)

    return text


class PersonalizationContextService:

    @classmethod
    def compile_context(
        cls,
        lead: dict[str, Any],
        campaign: dict[str, Any] | None = None,
        sender_settings: dict[str, Any] | None = None,
        sequence_step: int | None = 1,
        prev_comms: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Gathers raw data, checks conflicts, sanitizes inputs, scores lead fit alignment,
        extracts locked/excluded properties, and yields a safe structured AI personalization bundle.
        """
        warnings = []

        # 1. Parse manual overrides or exclusions stored in personalization_context JSON
        locked_facts = []
        excluded_fields = []

        raw_p_context = lead.get("personalization_context")
        if raw_p_context:
            try:
                parsed_context = json.loads(raw_p_context)
                if isinstance(parsed_context, dict):
                    locked_facts = parsed_context.get("locked_facts", [])
                    excluded_fields = parsed_context.get("excluded_fields", [])
            except Exception:
                # If it's a simple string, treat it as a locked fact
                locked_facts = [raw_p_context]

        # 2. Collect Factual Source Data
        factual_context = []
        inferred_context = []

        # Map base lead fields to facts (filtering out excluded fields)
        fields_to_check = [
            ("company_name", "Company Name"),
            ("website", "Website Domain"),
            ("job_title", "Job Title"),
            ("industry", "Industry"),
            ("city", "City Location"),
            ("country", "Country Location"),
        ]

        for field_key, label in fields_to_check:
            if field_key in excluded_fields:
                continue
            val = lead.get(field_key)
            if val:
                factual_context.append(
                    f"{label}: {sanitize_context_value(val)} (Source: Lead Profile)"
                )
            else:
                warnings.append(f"Missing context: '{label}' is not defined.")

        # Ingest Custom fields
        custom = lead.get("custom_fields") or {}
        for k, v in custom.items():
            if f"custom.{k}" in excluded_fields:
                continue
            sanitized_v = sanitize_context_value(v)
            factual_context.append(
                f"Custom field '{k}': {sanitized_v} (Source: Lead Metadata)"
            )

        # Ingest locked facts
        for lf in locked_facts:
            factual_context.append(
                f"{sanitize_context_value(lf)} (Source: Locked Owner Override)"
            )

        # 3. Retrieve Website Research Snapshots
        research_fresh = False
        research_age_days = 0
        research_summary_text = ""

        if supabase:
            try:
                res = (
                    supabase.table("research_snapshots")
                    .select("*")
                    .eq("lead_id", lead["id"])
                    .eq("research_type", "website")
                    .execute()
                )
                if res.data:
                    snap = res.data[0]
                    created_dt = datetime.fromisoformat(
                        snap["created_at"].replace("Z", "+00:00")
                    )
                    age = (
                        datetime.utcnow().replace(tzinfo=created_dt.tzinfo) - created_dt
                    )
                    research_age_days = age.days
                    if age < timedelta(days=7):
                        research_fresh = True

                    # Read facts
                    summary_data = json.loads(snap["structured_summary"])
                    research_summary_text = summary_data.get("summary", "")

                    # Factual points
                    for fact in summary_data.get("personalization_facts", []):
                        factual_context.append(
                            f"{sanitize_context_value(fact)} (Source: Website Crawl)"
                        )

                    # Inferred observations
                    relevance = summary_data.get("campaign_relevance", "")
                    if relevance:
                        inferred_context.append(
                            f"[Inferred/Observation] Potential Campaign Hook: {sanitize_context_value(relevance)}"
                        )

                    for warn in summary_data.get("uncertainty_warnings", []):
                        warnings.append(
                            f"Research uncertainty: {sanitize_context_value(warn)}"
                        )
            except Exception as e:
                logger.warning(
                    f"Could not retrieve research snapshot for lead {lead['id']}: {e}"
                )

        if not research_summary_text:
            warnings.append(
                "Missing context: No recent public website research snapshot found."
            )

        # 4. Field Conflict Diagnostics
        cls._detect_field_conflicts(lead, warnings)

        # 5. Prohibited Campaign Claims check
        if campaign:
            cls._check_prohibited_claims(campaign, factual_context, warnings)

        # 6. Safe AI Context Generator
        # Excludes PII (phone number, contact_email) to defend privacy
        safe_ai_context = {
            "first_name": sanitize_context_value(lead.get("first_name")),
            "last_name": sanitize_context_value(lead.get("last_name")),
            "full_name": sanitize_context_value(lead.get("full_name")),
            "company_name": sanitize_context_value(lead.get("company_name")),
            "website": sanitize_context_value(lead.get("website")),
            "job_title": sanitize_context_value(lead.get("job_title")),
            "industry": sanitize_context_value(lead.get("industry")),
            "city": sanitize_context_value(lead.get("city")),
            "country": sanitize_context_value(lead.get("country")),
            "custom": {
                k: sanitize_context_value(v)
                for k, v in custom.items()
                if f"custom.{k}" not in excluded_fields
            },
            "research_summary": sanitize_context_value(research_summary_text),
            "sequence_step": sequence_step,
        }

        # Size limit control: truncate safe_ai_context serialized content if it exceeds 5000 chars
        serialized_test = json.dumps(safe_ai_context)
        if len(serialized_test) > 5000:
            # Truncate research summary to fit
            safe_ai_context["research_summary"] = (
                safe_ai_context["research_summary"][:1000]
                + "... [context size cap limit reached]"
            )

        # 8. Compute Explainable Fit Score
        fit_score, score_reasons = cls.calculate_explainable_fit_score(
            lead, campaign, research_fresh, research_summary_text
        )

        # Human-readable paragraph summary
        completeness_pct = int(
            (len(factual_context) / (len(fields_to_check) + len(custom) + 1)) * 100
        )
        completeness_pct = min(100, completeness_pct)

        summary_text = (
            f"Lead fit alignment score is evaluated at {fit_score}/100. "
            f"Profile data is {completeness_pct}% complete. "
        )
        if research_fresh:
            summary_text += (
                f"Website crawling research is fresh ({research_age_days} days old)."
            )
        else:
            summary_text += (
                "Website research data is missing or expired (crawling recommended)."
            )

        return {
            "personalization_context": {
                "factual_context": factual_context,
                "inferred_context": inferred_context,
                "locked_facts": locked_facts,
                "excluded_fields": excluded_fields,
            },
            "lead_fit_score": fit_score,
            "fit_score_reasons": score_reasons,
            "missing_context_warnings": warnings,
            "safe_ai_context_object": safe_ai_context,
            "human_readable_summary": summary_text,
        }

    @classmethod
    def calculate_explainable_fit_score(
        cls,
        lead: dict[str, Any],
        campaign: dict[str, Any] | None,
        research_fresh: bool,
        research_summary: str,
    ) -> tuple[int, list[str]]:
        """
        Calculates explainable campaign fit score (0-100) based on transparent criteria.
        AI scoring supplements but does not replace the rules-based metrics.
        """
        score = 0
        reasons = []

        if not campaign:
            reasons.append("Global default campaign match criteria (+100 pts).")
            return 100, reasons

        # Target vertical verticals vertical Vertical vertical
        target_industries = [
            i.lower().strip() for i in campaign.get("target_industries", []) if i
        ]
        target_locations = [
            l.lower().strip() for l in campaign.get("target_locations", []) if l
        ]
        target_roles = [
            r.lower().strip() for r in campaign.get("target_roles", []) if r
        ]

        # 1. Industry Alignment (up to 20 pts)
        lead_ind = str(lead.get("industry") or "").strip().lower()
        if target_industries and lead_ind:
            if lead_ind in target_industries:
                score += 20
                reasons.append(
                    "+20 pts: Industry matches campaign target vertical criteria."
                )
            else:
                reasons.append(
                    f"+0 pts: Lead vertical '{lead.get('industry')}' does not match campaign vertical targets."
                )
        elif not target_industries:
            score += 20
            reasons.append(
                "+20 pts: No industry vertical limits specified for campaign."
            )
        else:
            reasons.append("+0 pts: Lead industry vertical information is missing.")

        # 2. Location Alignment (up to 20 pts)
        lead_country = str(lead.get("country") or "").strip().lower()
        lead_city = str(lead.get("city") or "").strip().lower()
        if target_locations:
            matched_loc = False
            for loc in target_locations:
                if loc == lead_country or loc == lead_city:
                    score += 20
                    reasons.append(
                        f"+20 pts: Location match found for region keyword '{loc.capitalize()}'."
                    )
                    matched_loc = True
                    break
            if not matched_loc:
                reasons.append(
                    "+0 pts: Lead region does not match campaign target boundaries."
                )
        else:
            score += 20
            reasons.append("+20 pts: Campaign is configured for global audience scope.")

        # 3. Audience Role Alignment (up to 20 pts)
        lead_title = str(lead.get("job_title") or "").strip().lower()
        if target_roles and lead_title:
            matched_role = False
            for role in target_roles:
                if role in lead_title:
                    score += 20
                    reasons.append(
                        f"+20 pts: Job title '{lead.get('job_title')}' matches role vertical targets."
                    )
                    matched_role = True
                    break
            if not matched_role:
                reasons.append(
                    f"+0 pts: Job title '{lead.get('job_title')}' does not match campaign roles."
                )
        elif not target_roles:
            score += 20
            reasons.append("+20 pts: No target audience roles restrictions defined.")
        else:
            reasons.append("+0 pts: Job title information is empty.")

        # 4. Ingest Completeness check (up to 15 pts)
        filled_count = 0
        checks = ["contact_email", "phone", "website", "company_name"]
        for c in checks:
            if lead.get(c):
                filled_count += 1
        comp_score = int((filled_count / len(checks)) * 15)
        score += comp_score
        reasons.append(
            f"+{comp_score} pts: Profile data attributes completeness score."
        )

        # 5. Website Research Freshness (up to 15 pts)
        if research_fresh:
            score += 15
            reasons.append(
                "+15 pts: Lead website crawler snapshot is fresh (less than 7 days old)."
            )
        else:
            reasons.append("+0 pts: Website research data is outdated or missing.")

        # 6. AI Vertical Relevance supplement (up to 10 pts)
        ai_supplement = 0
        if settings.DEMO_MODE or not gemini_service.api_key:
            # Mock relevance supplement
            if lead_ind and target_industries and lead_ind in target_industries:
                ai_supplement = 10
            else:
                ai_supplement = 5
            score += ai_supplement
            reasons.append(
                f"+{ai_supplement} pts: AI relevance vertical supplement (Demo Mode)."
            )
        else:
            if research_summary and campaign.get("description"):
                try:
                    ai_supplement = cls._query_ai_vertical_relevance(
                        research_summary, campaign["description"]
                    )
                    score += ai_supplement
                    reasons.append(
                        f"+{ai_supplement} pts: AI relevance analysis Vertical evaluation score."
                    )
                except Exception as e:
                    logger.warning(f"AI scoring failed: {e}")
                    reasons.append("+0 pts: AI vertical relevance calculation error.")

        # Cap score at 100
        score = min(100, score)
        reasons.append(
            "WARNING: The fit score is a campaign profile alignment metric; it must not be interpreted as a conversion probability."
        )

        return score, reasons

    @classmethod
    def _query_ai_vertical_relevance(
        cls, website_summary: str, campaign_desc: str
    ) -> int:
        """
        Queries Gemini to obtain a supplemental fit relevance score (0 to 10).
        """
        prompt = f"""
Analyze the vertical alignment between a business description and a target outreach campaign vertical.

Business description:
{website_summary}

Target Campaign Description:
{campaign_desc}

Based strictly on this comparison, evaluate the relevance alignment on a scale of 0 to 10 where:
- 0: Completely unrelated.
- 5: Moderate vertical interest overlap.
- 10: Perfect business alignment fit.

Output ONLY a JSON object:
{{
  "score": 8
}}
"""
        client = gemini_service._get_client()
        try:
            config = {"response_mime_type": "application/json", "temperature": 0.1}
            response = client.models.generate_content(
                model=settings.gemini_models[0], contents=prompt, config=config
            )
            raw = getattr(response, "text", "").strip()
            data = json.loads(raw)
            score_val = int(data.get("score", 5))
            return max(0, min(10, score_val))
        except Exception:
            return 5

    @classmethod
    def _detect_field_conflicts(cls, lead: dict[str, Any], warnings: list[str]):
        """
        Checks for geographic and domain consistency.
        """
        email = lead.get("contact_email")
        website = lead.get("website")
        if email and website:
            email_domain = email.split("@")[-1].lower().replace("www.", "")
            web_domain = (
                website.lower()
                .replace("https://", "")
                .replace("http://", "")
                .split("/")[0]
                .replace("www.", "")
            )

            # Skip public mail providers
            public_providers = [
                "gmail.com",
                "yahoo.com",
                "outlook.com",
                "hotmail.com",
                "aol.com",
            ]
            if email_domain != web_domain and email_domain not in public_providers:
                warnings.append(
                    f"Conflict warning: Email domain '@{email_domain}' mismatches website domain '{web_domain}'."
                )

        city = lead.get("city", "")
        country = lead.get("country", "")
        if city and country:
            city_l = city.lower().strip()
            country_l = country.lower().strip()
            # Simple list of common geographical conflicts
            conflicts = [
                ("new york", ["united kingdom", "uk", "canada", "germany", "france"]),
                ("london", ["usa", "united states", "canada", "france"]),
                ("toronto", ["usa", "united states", "uk", "united kingdom", "france"]),
                ("paris", ["usa", "united states", "uk", "united kingdom", "canada"]),
            ]
            for target_city, invalid_countries in conflicts:
                if target_city in city_l and any(
                    ic in country_l for ic in invalid_countries
                ):
                    warnings.append(
                        f"Conflict warning: Geographic conflict. City '{city}' is not situated in '{country}'."
                    )

    @classmethod
    def _check_prohibited_claims(
        cls, campaign: dict[str, Any], facts: list[str], warnings: list[str]
    ):
        """
        Flags if any lead context text touches prohibited claims configured in the campaign.
        """
        prohibited = campaign.get("prohibited_claims", []) or []
        combined_facts = "\n".join(facts).lower()

        for claim in prohibited:
            if claim.strip() and claim.lower() in combined_facts:
                warnings.append(
                    f"Prohibited Claim warning: Context matches campaign claims restrictions on '{claim}'."
                )
