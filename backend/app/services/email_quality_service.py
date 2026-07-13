import logging
import re
from typing import Any

from app.config import settings
from app.services.prompt_service import BANNED_PHRASES

logger = logging.getLogger("outreachops.services.email_quality")

SPAM_WORDS = [
    "buy now",
    "click here",
    "guarantee",
    "risk-free",
    "double your",
    "100% free",
    "promise",
    "urgent",
    "credit card",
    "act fast",
    "limited time",
    "make money",
    "passive income",
    "earn cash",
    "special promotion",
    "unsolicited",
]


class EmailQualityService:
    """
    Evaluates generated email copy quality, formats signatures,
    calculates scores, and checks for warning flags.
    """

    def _get_settings_for_lead(self, lead: dict) -> dict:
        user_id = lead.get("user_id") if lead else None
        if user_id:
            from app.routes.settings import get_owner_settings_sync

            owner_settings = get_owner_settings_sync(user_id)
            return {
                "sender_name": owner_settings.get("sender_name") or settings.YOUR_NAME,
                "agency": owner_settings.get("business_name")
                or settings.YOUR_AGENCY_NAME,
                "website": owner_settings.get("website") or settings.YOUR_WEBSITE,
                "phone": owner_settings.get("sender_phone") or settings.YOUR_PHONE,
                "default_signature": owner_settings.get("default_signature"),
            }
        return {
            "sender_name": settings.YOUR_NAME,
            "agency": settings.YOUR_AGENCY_NAME,
            "website": settings.YOUR_WEBSITE,
            "phone": settings.YOUR_PHONE,
            "default_signature": None,
        }

    def clean_and_normalize(
        self, subject: str, body: str, lead: dict = None
    ) -> dict[str, str]:
        """
        Cleans up leaked subjects and normalizes signature blocks.
        """
        cleaned_body = body.strip()

        # 1. Strip leaked subject patterns from the top of the body
        lines = cleaned_body.splitlines()
        filtered_lines = []
        subject_leaked = False

        for line in lines:
            normalized = line.strip().upper()
            if normalized.startswith("SUBJECT:") or normalized.startswith(
                "SUBJECT LINE:"
            ):
                subject_leaked = True
                # Skip this line
                continue
            # Also check if it's the duplicate text of the subject line
            if subject and line.strip().strip('"').strip("'") == subject.strip().strip(
                '"'
            ).strip("'"):
                subject_leaked = True
                continue
            filtered_lines.append(line)

        cleaned_body = "\n".join(filtered_lines).strip()

        # 2. Normalize Signature block formatting
        # Expected standard format: Name | Agency | Website [| Phone]
        owner_cfg = self._get_settings_for_lead(lead)
        sender_name = owner_cfg["sender_name"]
        agency = owner_cfg["agency"]
        website = owner_cfg["website"]
        phone = owner_cfg["phone"]

        if owner_cfg.get("default_signature"):
            normalized_signature = owner_cfg["default_signature"]
        else:
            sig_parts = [sender_name, agency, website]
            if phone and phone.strip():
                sig_parts.append(phone.strip())
            normalized_signature = " | ".join(sig_parts)

        # Check if a signature or sender name exists at the end of the body
        # Look for signoffs (e.g. Regards, Best regards, Thanks, Best, Sincerely)
        signoffs = [
            "regards",
            "best regards",
            "thanks",
            "best",
            "sincerely",
            "cheers",
            "respectfully",
        ]
        found_signoff_index = -1

        body_lower = cleaned_body.lower()

        # Look for the last signoff
        for signoff in signoffs:
            idx = body_lower.rfind(signoff)
            if idx > found_signoff_index:
                # Ensure it is on its own line or followed by comma/newline
                # check bounding characters
                if idx == 0 or body_lower[idx - 1] in ["\n", " ", "\r"]:
                    found_signoff_index = idx

        if found_signoff_index != -1:
            # We found a signoff line. Let's see if we should reconstruct the body with normalized signature
            header_text = cleaned_body[:found_signoff_index].rstrip()
            signoff_line = cleaned_body[found_signoff_index:].splitlines()[0]
            # Strip trailing punctuation from signoff line (e.g., "Best," -> "Best")
            signoff_line = re.sub(r"[^\w\s]", "", signoff_line).strip()

            cleaned_body = f"{header_text}\n\n{signoff_line},\n{normalized_signature}"
        else:
            # If no signoff is found, but the sender name is near the end, replace that part
            name_idx = cleaned_body.rfind(sender_name)
            if name_idx != -1 and name_idx > len(cleaned_body) - 150:
                header_text = cleaned_body[:name_idx].rstrip()
                cleaned_body = f"{header_text}\n\nBest,\n{normalized_signature}"
            else:
                # If neither is found, append normalized signature to the end
                # Check if it already has standard signature elements
                if (
                    agency.lower() not in body_lower
                    and sender_name.lower() not in body_lower
                ):
                    cleaned_body = f"{cleaned_body}\n\nBest,\n{normalized_signature}"

        return {
            "subject": subject.strip().strip('"').strip("'"),
            "body": cleaned_body,
            "subject_leaked": subject_leaked,
        }

    def evaluate_draft(
        self, subject: str, body: str, email_type: str, lead: dict[str, Any]
    ) -> dict[str, Any]:
        """
        Runs full analysis on the draft copy.
        Returns:
            - scores: Dict containing length_score, personalization_score, clarity_score, spam_risk_score, repetition_score, quality_score
            - warnings: List of warning strings
            - cleaned_subject: cleaned subject line
            - cleaned_body: cleaned body text
        """
        # 1. Clean first
        cleaned = self.clean_and_normalize(subject, body, lead)
        cleaned_sub = cleaned["subject"]
        cleaned_body = cleaned["body"]
        subject_leaked_flag = cleaned["subject_leaked"]

        warnings = []

        # Word count of cleaned body
        words = len(cleaned_body.split())

        # 2. Check Banned Phrases (Case Insensitive)
        full_text = (cleaned_sub + " " + cleaned_body).lower()
        for phrase in BANNED_PHRASES:
            if phrase.lower() in full_text:
                warnings.append(f"Banned phrase found: '{phrase}'")

        # 3. Check Subject Leaks (using pre-cleanup indicator or search)
        if (
            subject_leaked_flag
            or "subject:" in body.lower()
            or "subject line:" in body.lower()
        ):
            warnings.append("Subject line leaked in body")

        # 4. Check Length Constraints & Calculate Length Score
        # website: 55-85 words, erp: 60-90 words, follow_up: 30-50 words
        if email_type == "website":
            ideal_min, ideal_max = 55, 85
        elif email_type == "erp":
            ideal_min, ideal_max = 60, 90
        else:  # follow_up
            ideal_min, ideal_max = 30, 50

        # Calculate Length Score (0-10)
        ideal_mid = (ideal_min + ideal_max) / 2
        deviation = abs(words - ideal_mid)
        # Deduct score if outside range or far from mid
        if ideal_min <= words <= ideal_max:
            length_score = 10.0
        else:
            diff_from_bounds = (
                (ideal_min - words) if words < ideal_min else (words - ideal_max)
            )
            length_score = max(1.0, 10.0 - (diff_from_bounds * 0.2))

            if words > 120:
                warnings.append(f"Too long ({words} words)")
            elif words < ideal_min - 10:
                warnings.append(f"Too short ({words} words)")

        # 5. Check Signature Presence
        owner_cfg = self._get_settings_for_lead(lead)
        sender_name = owner_cfg["sender_name"].lower()
        agency = owner_cfg["agency"].lower()
        if (
            sender_name not in cleaned_body.lower()
            and agency not in cleaned_body.lower()
        ):
            warnings.append("Signature missing")

        # 6. Check CTA Length (Last sentence before signature)
        # Separate body copy from signature to evaluate CTA
        body_lines = cleaned_body.splitlines()
        content_lines = [l for l in body_lines if l.strip()]

        # Typically the last 1 or 2 lines before signoff contains the CTA
        cta_text = ""
        # Let's search for lines containing question marks or call action keywords
        for line in reversed(content_lines):
            # Skip signature lines
            if (
                owner_cfg["sender_name"].lower() in line.lower()
                or owner_cfg["website"].lower() in line.lower()
                or "best" in line.lower()
                or "regards" in line.lower()
            ):
                continue
            if (
                "?" in line
                or "call" in line.lower()
                or "meet" in line.lower()
                or "chat" in line.lower()
                or "review" in line.lower()
                or "mockup" in line.lower()
            ):
                cta_text = line
                break

        if not cta_text and len(content_lines) >= 2:
            # Default to the line right before the signature block (or the last non-empty content line)
            non_sig_lines = [
                l
                for l in content_lines
                if not any(
                    k in l.lower()
                    for k in [
                        "best,",
                        "regards,",
                        "thanks,",
                        owner_cfg["sender_name"].lower(),
                        owner_cfg["agency"].lower(),
                    ]
                )
            ]
            if non_sig_lines:
                cta_text = non_sig_lines[-1]

        cta_word_count = len(cta_text.split())
        if cta_word_count > 20:
            warnings.append("CTA too long")

        # 7. Personalization Score (0-10)
        # Check reference to lead details: company name, website, pain points/erp approach
        personalization_score = 1.0
        company = (lead.get("company_name") or "").lower()
        website = (lead.get("website") or "").lower()

        if company and company in cleaned_body.lower():
            personalization_score += 3.0
        if website and (
            website in cleaned_body.lower()
            or website.split(".")[0] in cleaned_body.lower()
        ):
            personalization_score += 3.0

        # Check if pain points or erp approach is mentioned in some way
        pain_points = (
            lead.get("website_pain_points") or lead.get("erp_approach") or ""
        ).lower()
        if pain_points:
            # check if keywords or sub-phrases from pain points are used
            keywords = [
                kw.strip()
                for kw in re.split(r"[,.\s]+", pain_points)
                if len(kw.strip()) > 4
            ]
            matches = 0
            for kw in keywords[:5]:
                if kw in cleaned_body.lower():
                    matches += 1
            if matches > 0:
                personalization_score += 3.0
            elif pain_points[:15] in cleaned_body.lower():
                personalization_score += 3.0

        personalization_score = min(10.0, personalization_score)

        # 8. Spam Risk Score (0-10)
        spam_count = 0
        for word in SPAM_WORDS:
            if word in cleaned_body.lower() or word in cleaned_sub.lower():
                spam_count += 1

        spam_risk_score = min(10.0, spam_count * 2.0)

        # 9. Repetition Score (0-10)
        # Count unique non-stop words vs total non-stop words
        stop_words = {
            "the",
            "a",
            "and",
            "or",
            "of",
            "in",
            "to",
            "for",
            "is",
            "that",
            "on",
            "with",
            "this",
            "our",
            "your",
            "we",
            "you",
            "i",
            "it",
            "are",
            "be",
            "at",
            "as",
            "by",
            "an",
        }
        all_words = [w.strip(".,;:?!()\"'").lower() for w in cleaned_body.split()]
        filtered_words = [w for w in all_words if w and w not in stop_words]

        if len(filtered_words) > 0:
            unique_words = set(filtered_words)
            ratio = len(unique_words) / len(filtered_words)
            # Normal ratio is around 0.65+. If lower, deduct
            if ratio >= 0.7:
                repetition_score = 10.0
            else:
                repetition_score = max(1.0, 10.0 - (0.7 - ratio) * 20.0)
        else:
            repetition_score = 10.0

        # 10. Clarity Score (0-10)
        clarity_score = 10.0
        # Deduct for long sentences
        sentences = re.split(r"[.!?]+", cleaned_body)
        long_sentences = 0
        for s in sentences:
            s_words = len(s.split())
            if s_words > 20:
                long_sentences += 1

        clarity_score -= min(3.0, long_sentences * 1.0)

        # Paragraph limit (Max 3)
        paragraphs = [p for p in cleaned_body.split("\n\n") if p.strip()]
        if len(paragraphs) > 3:
            clarity_score -= 2.0

        if subject_leaked_flag:
            clarity_score -= 3.0

        clarity_score = max(1.0, clarity_score)

        # 11. Quality Score (Average of scores)
        # Quality score should be lower if there are banned phrases or high spam risk
        raw_quality = (
            length_score
            + personalization_score
            + clarity_score
            + (10.0 - spam_risk_score)
            + repetition_score
        ) / 5.0

        # Penalty for warnings
        if warnings:
            # Deduct 1.0 per warning, max deduction 4.0
            raw_quality -= min(4.0, len(warnings) * 1.0)

        quality_score = max(1.0, round(raw_quality, 1))

        return {
            "subject": cleaned_sub,
            "body": cleaned_body,
            "warnings": warnings,
            "scores": {
                "quality_score": quality_score,
                "spam_risk_score": round(spam_risk_score, 1),
                "personalization_score": round(personalization_score, 1),
                "clarity_score": round(clarity_score, 1),
                "length_score": round(length_score, 1),
                "repetition_score": round(repetition_score, 1),
            },
        }
