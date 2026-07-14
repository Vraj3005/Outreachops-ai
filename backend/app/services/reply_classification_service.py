import datetime
import json
import logging
from typing import Any

from app.config import settings
from app.database import supabase
from app.services.gemini_service import GeminiService

logger = logging.getLogger("outreachops.services.reply_classification_service")


class ReplyClassificationService:
    CATEGORIES = [
        "positive/interested",
        "meeting request",
        "not interested",
        "not now",
        "unsubscribe",
        "wrong person",
        "referral",
        "out of office",
        "bounce/delivery failure",
        "unclear",
    ]

    @classmethod
    def classify_and_process(
        cls,
        user_id: str,
        campaign_id: str,
        lead_id: str,
        gmail_message_id: str,
        sender: str,
        subject: str,
        body: str,
    ) -> dict[str, Any]:
        """
        Classifies incoming replies, redacts body snippets for privacy, updates campaign states,
        and generates response draft recommendations.
        """
        # 1. Privacy Excerpt + Redaction
        # Store only first 300 characters of clean body content
        body_excerpt = body[:300].strip()
        # Redact common PII patterns like phone numbers or SSN
        import re

        body_excerpt = re.sub(
            r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b", "[PHONE-REDACTED]", body_excerpt
        )
        body_excerpt = re.sub(
            r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
            "[EMAIL-REDACTED]",
            body_excerpt,
        )

        # 2. Apply Deterministic Rules First
        category, confidence, rule_used, explanation = cls._apply_rules(
            sender, subject, body
        )

        # 3. Optional AI Classification Fallback
        if category is None or confidence < 0.8:
            ai_cat, ai_conf, ai_explain = cls._classify_with_ai(
                user_id, subject, body_excerpt
            )
            if ai_cat:
                category = ai_cat
                confidence = ai_conf
                rule_used = "gemini-ai"
                explanation = ai_explain
            else:
                # Fallback to unclear if AI fails
                category = category or "unclear"
                confidence = confidence or 0.5
                rule_used = rule_used or "rule-fallback"
                explanation = (
                    explanation or "Categorized using keyword pattern matches."
                )

        # 4. Insert or Update reply_events
        now_str = datetime.datetime.now(datetime.UTC).isoformat()
        event_id = f"rep_{gmail_message_id}_{int(datetime.datetime.now().timestamp())}"

        reply_record = {
            "id": event_id,
            "user_id": user_id,
            "campaign_id": campaign_id,
            "lead_id": lead_id,
            "gmail_message_id": gmail_message_id,
            "subject": subject,
            "body": body_excerpt,
            "category": category,
            "confidence": confidence,
            "rule_model_used": rule_used,
            "explanation": explanation,
            "manual_override": 0,
            "replied_at": now_str,
        }

        try:
            supabase.table("reply_events").insert(reply_record).execute()
        except Exception as e:
            logger.warning(f"Failed to insert reply_event record (might exist): {e}")

        # 5. Emit Analytics Event
        cls._emit_analytics_event(
            user_id, campaign_id, lead_id, category, gmail_message_id
        )

        # 6. Apply Sequence Stopping Rules
        cls._apply_sequence_stopping(user_id, campaign_id, lead_id, category)

        # 7. Generate suggested reply draft for manual review (no autonomous sending)
        if category in [
            "positive/interested",
            "meeting request",
            "unclear",
            "referral",
        ]:
            cls._create_suggested_reply_draft(
                user_id, campaign_id, lead_id, subject, body_excerpt
            )

        return reply_record

    @classmethod
    def _apply_rules(
        cls, sender: str, subject: str, body: str
    ) -> tuple[str, float, str, str]:
        sender_lower = sender.lower()
        sub_lower = subject.lower()
        body_lower = body.lower()

        # A. Bounce/Delivery Failure
        bouncers = ["mailer-daemon", "postmaster", "delivery", "subsystem"]
        bounce_sub = [
            "undeliverable",
            "returned mail",
            "delivery failure",
            "delivery status notification",
            "failure notice",
        ]
        if any(b in sender_lower for b in bouncers) or any(
            s in sub_lower for s in bounce_sub
        ):
            return (
                "bounce/delivery failure",
                1.0,
                "deterministic-rules",
                "Inbound sender domain or subject matches automated mail daemon failure signature.",
            )

        # B. Out of office (OOO)
        ooo_triggers = [
            "out of office",
            "auto-reply",
            "autoreply",
            "vacation",
            "away from my",
            "ooo",
        ]
        if any(t in sub_lower for t in ooo_triggers) or any(
            t in body_lower for t in ooo_triggers
        ):
            return (
                "out of office",
                1.0,
                "deterministic-rules",
                "Subject/body matches automated out-of-office autoreply templates.",
            )

        # C. Unsubscribe request
        unsub_triggers = [
            "unsubscribe",
            "remove me",
            "stop writing",
            "do not email",
            "take me off",
        ]
        if any(t in sub_lower for t in unsub_triggers) or any(
            t in body_lower for t in unsub_triggers
        ):
            return (
                "unsubscribe",
                0.9,
                "deterministic-rules",
                "Contains explicit opt-out keywords like unsubscribe/remove.",
            )

        return None, 0.0, None, None

    @classmethod
    def _classify_with_ai(
        cls, user_id: str, subject: str, body_excerpt: str
    ) -> tuple[str, float, str]:
        """Uses Gemini model to classify the outcome sentiment category."""
        prompt = (
            f"You are a reply intelligence agent analyzing a cold outreach response email.\n"
            f"Subject: {subject}\n"
            f"Message Excerpt: {body_excerpt}\n\n"
            f"Classify this email into exactly one of these categories:\n"
            f"{', '.join(cls.CATEGORIES)}\n\n"
            f"Return a raw JSON object matching this schema:\n"
            f"{{\n"
            f'  "category": "string (exact category name from list)",\n'
            f'  "confidence": 0.0 to 1.0,\n'
            f'  "explanation": "brief string explanation"\n'
            f"}}\n"
        )

        try:
            gemini = GeminiService()
            client = gemini._get_client(user_id)

            if settings.DEMO_MODE and not gemini.api_key:
                # Return demo AI classification
                return "positive/interested", 0.85, "Demo AI fallback categorization"

            model_name = (
                gemini.model_list[0] if gemini.model_list else "gemini-2.5-flash-lite"
            )
            res = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            data = json.loads(res.text)
            cat = data.get("category", "").lower().strip()

            # Map back to valid CATEGORIES list
            matched_cat = None
            for c in cls.CATEGORIES:
                if c.lower() == cat:
                    matched_cat = c
                    break

            return (
                matched_cat or "unclear",
                float(data.get("confidence", 0.7)),
                data.get("explanation", ""),
            )
        except Exception as e:
            logger.error(f"Gemini reply classification failed: {e}")
            return None, 0.0, None

    @classmethod
    def _apply_sequence_stopping(
        cls, user_id: str, campaign_id: str, lead_id: str, category: str
    ):
        """Immediately halts pending steps based on category type or campaign OOO options."""
        now_str = datetime.datetime.now(datetime.UTC).isoformat()

        # Determine behavior
        should_stop = category in [
            "unsubscribe",
            "bounce/delivery failure",
            "not interested",
            "wrong person",
            "positive/interested",
            "meeting request",
            "referral",
            "not now",
        ]

        if category == "out of office":
            # Fetch campaign OOO behavior config
            try:
                camp_res = (
                    supabase.table("campaigns")
                    .select("ooo_behavior")
                    .eq("id", campaign_id)
                    .execute()
                )
                if camp_res.data and camp_res.data[0].get("ooo_behavior") == "pause":
                    should_stop = True
            except Exception as e:
                logger.error(f"Failed to fetch OOO config: {e}")

        if should_stop:
            new_status = (
                "replied"
                if category
                in ["positive/interested", "meeting request", "referral", "unclear"]
                else "stopped"
            )

            # 1. Update Campaign Lead state
            supabase.table("campaign_leads").update(
                {
                    "status": new_status,
                    "last_error": f"Sequence halted due to reply category: {category}",
                }
            ).eq("campaign_id", campaign_id).eq("lead_id", lead_id).execute()

            # 2. Cancel all pending scheduled emails
            supabase.table("scheduled_emails").update(
                {
                    "status": "cancelled",
                    "last_error": f"Halted by sequence stop rule ({category})",
                }
            ).eq("campaign_id", campaign_id).eq("lead_id", lead_id).in_(
                "status", ["pending", "retry"]
            ).execute()

            logger.info(
                f"Halted sequence steps for lead {lead_id} under category {category}"
            )

    @classmethod
    def _emit_analytics_event(
        cls,
        user_id: str,
        campaign_id: str,
        lead_id: str,
        category: str,
        message_id: str,
    ):
        """Emits analytics metrics corresponding to the outcome category."""
        try:
            event_type = "reply"
            if category == "meeting request":
                event_type = "meeting_request"
            elif category == "positive/interested":
                event_type = "positive_reply"
            elif category == "unsubscribe":
                event_type = "unsubscribe"
            elif category == "bounce/delivery failure":
                event_type = "bounce"

            import uuid

            supabase.table("send_events").insert(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "event_type": event_type,
                    "recipient_email": "",
                    "gmail_message_id": message_id,
                    "occurred_at": datetime.datetime.now(datetime.UTC).isoformat(),
                }
            ).execute()
        except Exception as e:
            logger.error(f"Failed to emit reply analytics event: {e}")

    @classmethod
    def _create_suggested_reply_draft(
        cls,
        user_id: str,
        campaign_id: str,
        lead_id: str,
        orig_subject: str,
        orig_body: str,
    ):
        """Creates a suggested reply draft in the draft database table for manual approval."""
        prompt = (
            f"Generate a polite, helpful reply to this prospect outreach response:\n"
            f"Original Subject: {orig_subject}\n"
            f"Prospect's Email Content: {orig_body}\n\n"
            f"Draft a suggested reply. Keep it concise, engaging, and professional.\n"
            f"Output a valid JSON object only matching this schema:\n"
            f"{{\n"
            f'  "subject": "string",\n'
            f'  "body": "string"\n'
            f"}}\n"
        )

        try:
            gemini = GeminiService()
            client = gemini._get_client(user_id)

            if settings.DEMO_MODE and not gemini.api_key:
                subject = f"Re: {orig_subject}"
                body = "Hi there, thank you for showing interest. Let's schedule a call next week."
            else:
                model_name = (
                    gemini.model_list[0]
                    if gemini.model_list
                    else "gemini-2.5-flash-lite"
                )
                res = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={"response_mime_type": "application/json"},
                )
                data = json.loads(res.text)
                subject = data.get("subject") or f"Re: {orig_subject}"
                body = data.get("body") or "Hi there, let's schedule a call next week."

            import uuid

            draft_id = str(uuid.uuid4())
            supabase.table("email_drafts").insert(
                {
                    "id": draft_id,
                    "user_id": user_id,
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "email_type": "reply_suggestion",
                    "subject": subject,
                    "body": body,
                    "status": "suggested_reply",
                    "created_at": datetime.datetime.now(datetime.UTC).isoformat(),
                    "updated_at": datetime.datetime.now(datetime.UTC).isoformat(),
                }
            ).execute()
            logger.info(
                f"Generated suggested reply draft {draft_id} for lead {lead_id}"
            )
        except Exception as e:
            logger.error(f"Failed to generate suggested reply draft: {e}")
