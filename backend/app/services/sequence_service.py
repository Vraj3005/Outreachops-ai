import datetime
import json
import logging
import uuid
from typing import Any
from zoneinfo import ZoneInfo

from app.database import supabase
from app.services.email_quality_service import EmailQualityService
from app.services.gemini_service import GeminiService
from app.services.gmail_service import GmailService
from app.services.template_renderer import SafeTemplateRenderer

logger = logging.getLogger("outreachops.services.sequence_service")


class SequenceService:

    @classmethod
    def get_or_create_default_sequence(cls, campaign_id: str, user_id: str) -> str:
        """
        Retrieves the sequence_id associated with a campaign.
        If not present, creates a default 3-step sequence and associates it.
        """
        camp_res = (
            supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
        )
        if not camp_res.data:
            raise ValueError(f"Campaign {campaign_id} not found")
        campaign = camp_res.data[0]

        seq_id = campaign.get("sequence_id")
        if seq_id:
            seq_res = supabase.table("sequences").select("*").eq("id", seq_id).execute()
            if seq_res.data:
                return seq_id

        seq_id = str(uuid.uuid4())
        supabase.table("sequences").insert(
            {
                "id": seq_id,
                "user_id": user_id,
                "name": f"Sequence for {campaign.get('name')}",
                "description": "Auto-generated default sequence follow-up steps",
            }
        ).execute()

        default_steps = [
            {
                "id": str(uuid.uuid4()),
                "sequence_id": seq_id,
                "step_number": 1,
                "name": "Initial Outreach",
                "delay_amount": 0,
                "delay_unit": "hours",
                "require_manual_approval": 1,
                "stop_conditions": "{}",
            },
            {
                "id": str(uuid.uuid4()),
                "sequence_id": seq_id,
                "step_number": 2,
                "name": "Follow-up",
                "delay_amount": 3,
                "delay_unit": "days",
                "require_manual_approval": 1,
                "stop_conditions": "{}",
            },
            {
                "id": str(uuid.uuid4()),
                "sequence_id": seq_id,
                "step_number": 3,
                "name": "Final Follow-up",
                "delay_amount": 7,
                "delay_unit": "days",
                "require_manual_approval": 1,
                "stop_conditions": "{}",
            },
        ]
        supabase.table("sequence_steps").insert(default_steps).execute()

        supabase.table("campaigns").update({"sequence_id": seq_id}).eq(
            "id", campaign_id
        ).execute()
        logger.info(
            f"Associated default 3-step sequence {seq_id} with campaign {campaign_id}"
        )
        return seq_id

    @classmethod
    def calculate_next_send_time(
        cls,
        from_utc_dt: datetime.datetime,
        delay_amount: int,
        delay_unit: str,
        timezone_str: str,
        window_start_str: str,
        window_end_str: str,
        exclude_weekends: bool,
    ) -> datetime.datetime:
        """
        Calculates next valid sending timestamp in UTC based on delay details, sending hours, and weekend options.
        """
        try:
            tz = ZoneInfo(timezone_str)
        except Exception:
            try:
                tz = ZoneInfo("UTC")
            except Exception:
                tz = datetime.UTC

        # Handle timezone casting safely
        if isinstance(tz, datetime.timezone):
            local_dt = from_utc_dt.astimezone(tz)
        else:
            try:
                local_dt = from_utc_dt.astimezone(tz)
            except Exception:
                local_dt = from_utc_dt.astimezone(datetime.UTC)

        unit = delay_unit.lower()
        if unit == "minutes":
            local_dt += datetime.timedelta(minutes=delay_amount)
        elif unit == "hours":
            local_dt += datetime.timedelta(hours=delay_amount)
        elif unit == "days":
            local_dt += datetime.timedelta(days=delay_amount)
        else:
            local_dt += datetime.timedelta(hours=delay_amount)

        try:
            sh, sm = map(int, window_start_str.split(":"))
            eh, em = map(int, window_end_str.split(":"))
        except Exception:
            sh, sm = 9, 0
            eh, em = 17, 0

        for _ in range(30):
            # Weekend exclusion check
            if exclude_weekends and local_dt.weekday() >= 5:  # Saturday=5, Sunday=6
                days_to_add = 7 - local_dt.weekday()
                local_dt += datetime.timedelta(days=days_to_add)
                local_dt = local_dt.replace(hour=sh, minute=sm, second=0, microsecond=0)
                continue

            # Send hours slot check
            curr_mins = local_dt.hour * 60 + local_dt.minute
            start_mins = sh * 60 + sm
            end_mins = eh * 60 + em

            if curr_mins < start_mins:
                local_dt = local_dt.replace(hour=sh, minute=sm, second=0, microsecond=0)
            elif curr_mins > end_mins:
                local_dt += datetime.timedelta(days=1)
                local_dt = local_dt.replace(hour=sh, minute=sm, second=0, microsecond=0)
                continue

            break

        return local_dt.astimezone(datetime.UTC)

    @classmethod
    def enroll_lead(
        cls, campaign_id: str, lead_id: str, user_id: str
    ) -> dict[str, Any]:
        """
        Enrolls a lead, setting status = 'enrolled' and transitioning to generation queue.
        """
        cls.get_or_create_default_sequence(campaign_id, user_id)

        existing = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("campaign_id", campaign_id)
            .eq("lead_id", lead_id)
            .execute()
        )
        if existing.data:
            cl_id = existing.data[0]["id"]
            supabase.table("campaign_leads").update(
                {
                    "status": "enrolled",
                    "current_sequence_step": 1,
                    "next_step_scheduled_at": None,
                    "stopped_reason": None,
                    "completed_at": None,
                    "last_error": None,
                }
            ).eq("id", cl_id).execute()
        else:
            cl_id = str(uuid.uuid4())
            supabase.table("campaign_leads").insert(
                {
                    "id": cl_id,
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "status": "enrolled",
                    "current_sequence_step": 1,
                }
            ).execute()

        return cls.transition_to_awaiting_generation(cl_id)

    @classmethod
    def transition_to_awaiting_generation(cls, campaign_lead_id: str) -> dict[str, Any]:
        """
        Sets lead status to awaiting_generation.
        """
        supabase.table("campaign_leads").update({"status": "awaiting_generation"}).eq(
            "id", campaign_lead_id
        ).execute()
        return {"status": "awaiting_generation"}

    @classmethod
    def generate_draft_for_current_step(cls, campaign_lead_id: str) -> dict[str, Any]:
        """
        Compiles context variables, calls AI to draft follow-up templates, and transitions to review or schedule gates.
        """
        cl_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("id", campaign_lead_id)
            .execute()
        )
        if not cl_res.data:
            raise ValueError("Campaign lead not found")
        cl = cl_res.data[0]

        campaign_id = cl["campaign_id"]
        lead_id = cl["lead_id"]
        step_idx = cl["current_sequence_step"]

        # Evaluate stops
        stop_needed, stop_reason = cls.evaluate_stop_conditions(campaign_id, lead_id)
        if stop_needed:
            supabase.table("campaign_leads").update(
                {
                    "status": "stopped",
                    "stopped_reason": stop_reason,
                    "next_step_scheduled_at": None,
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "stopped", "reason": stop_reason}

        # Fetch details
        camp_res = (
            supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
        )
        campaign = camp_res.data[0]

        if campaign.get("status") == "paused":
            supabase.table("campaign_leads").update(
                {
                    "status": "stopped",
                    "stopped_reason": "Campaign paused",
                    "next_step_scheduled_at": None,
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "stopped", "reason": "Campaign paused"}

        lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
        lead = lead_res.data[0]

        seq_id = campaign.get("sequence_id")
        steps_res = (
            supabase.table("sequence_steps")
            .select("*")
            .eq("sequence_id", seq_id)
            .order("step_number")
            .execute()
        )
        steps = steps_res.data or []

        if not steps or step_idx > len(steps):
            supabase.table("campaign_leads").update(
                {
                    "status": "completed",
                    "completed_at": datetime.datetime.now(datetime.UTC).isoformat(),
                    "next_step_scheduled_at": None,
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "completed"}

        current_step = steps[step_idx - 1]

        # Determine subject template text & body template text
        # If specific step template is missing, fall back to global campaign prompt_template_id or templates
        prompt_ver_id = current_step.get("body_template_version_id") or campaign.get(
            "prompt_template_id"
        )

        assigned_variant_id = None
        assigned_variant_name = None

        try:
            exp_res = (
                supabase.table("experiments")
                .select("*")
                .eq("campaign_id", campaign_id)
                .eq("status", "active")
                .execute()
            )

            if exp_res.data:
                experiment = exp_res.data[0]
                exp_id = experiment["id"]

                var_res = (
                    supabase.table("experiment_variants")
                    .select("*")
                    .eq("experiment_id", exp_id)
                    .execute()
                )
                variants = var_res.data or []

                if variants:
                    # Check existing assignment
                    assign_res = (
                        supabase.table("experiment_assignments")
                        .select("*")
                        .eq("experiment_id", exp_id)
                        .eq("lead_id", lead_id)
                        .execute()
                    )

                    if assign_res.data:
                        assigned_variant_id = assign_res.data[0]["variant_id"]
                        assigned_variant_name = assign_res.data[0]["variant_name"]
                    else:
                        import hashlib

                        hash_input = f"{lead_id}_{exp_id}"
                        hash_val = int(
                            hashlib.sha256(hash_input.encode()).hexdigest(), 16
                        )
                        percent = hash_val % 100

                        cumulative = 0
                        assigned_var = variants[-1]
                        for v in variants:
                            weight_pct = int((v.get("weight") or 0.5) * 100)
                            cumulative += weight_pct
                            if percent < cumulative:
                                assigned_var = v
                                break

                        assigned_variant_id = assigned_var["id"]
                        assigned_variant_name = assigned_var["name"]

                        import uuid

                        supabase.table("experiment_assignments").insert(
                            {
                                "id": str(uuid.uuid4()),
                                "experiment_id": exp_id,
                                "lead_id": lead_id,
                                "variant_id": assigned_variant_id,
                                "variant_name": assigned_variant_name,
                            }
                        ).execute()

                    # Override prompt_ver_id if variant specifies one
                    variant_details = [
                        v for v in variants if v["id"] == assigned_variant_id
                    ]
                    if variant_details and variant_details[0].get(
                        "prompt_template_version_id"
                    ):
                        prompt_ver_id = variant_details[0]["prompt_template_version_id"]
        except Exception as e:
            logger.error(f"Error resolving A/B experiment assignment: {e}")
        template_text = ""
        if prompt_ver_id:
            pv_res = (
                supabase.table("prompt_versions")
                .select("*")
                .eq("id", prompt_ver_id)
                .execute()
            )
            if pv_res.data:
                template_text = pv_res.data[0]["template_text"]

        if not template_text:
            # Check prompt_templates table
            pt_res = supabase.table("prompt_templates").select("*").execute()
            if pt_res.data:
                template_text = pt_res.data[0]["template_text"]
            else:
                template_text = "Hi {{first_name}},\n\nJust following up on my previous message. Let me know if you have time to connect.\n\nBest,\n{{sender.name}}"

        # Fetch previous message details for subject thread formatting
        prev_subject = ""
        if step_idx > 1:
            drafts_res = (
                supabase.table("email_drafts")
                .select("*")
                .eq("lead_id", lead_id)
                .eq("campaign_id", campaign_id)
                .order("created_at", desc=True)
                .execute()
            )
            if drafts_res.data:
                prev_subject = drafts_res.data[0].get("subject") or ""
                # Prefix Re: if not already present
                if prev_subject and not prev_subject.lower().startswith("re:"):
                    prev_subject = f"Re: {prev_subject}"

        # Fetch owner settings
        set_res = (
            supabase.table("owner_settings")
            .select("*")
            .eq("user_id", campaign["user_id"])
            .execute()
        )
        sender_settings = set_res.data[0] if set_res.data else {}

        # Compile namespaces
        renderer_context = {
            "first_name": lead.get("first_name") or "there",
            "last_name": lead.get("last_name") or "",
            "full_name": lead.get("full_name") or "",
            "company_name": lead.get("company_name") or "",
            "job_title": lead.get("job_title") or "",
            "contact_email": lead.get("contact_email") or "",
            "website": lead.get("website") or "",
            "industry": lead.get("industry") or "",
            "country": lead.get("country") or "",
            "city": lead.get("city") or "",
            "custom": lead.get("custom_fields") or {},
            "campaign": {
                "name": campaign.get("name") or "",
                "objective": campaign.get("objective") or "",
                "offer": campaign.get("offer") or "",
                "value_proposition": campaign.get("value_proposition") or "",
                "target_audience": campaign.get("target_audience") or "",
                "cta": campaign.get("CTA") or "",
            },
            "research": {
                "summary": lead.get("research_summary") or "",
                "services": "",
                "observations": "",
                "sources": lead.get("website") or "",
            },
            "sender": {
                "name": sender_settings.get("sender_name") or "",
                "company": sender_settings.get("business_name") or "",
                "website": sender_settings.get("website") or "",
                "phone": sender_settings.get("phone") or "",
                "signature": sender_settings.get("signature") or "",
            },
            "sequence": {
                "step_number": str(step_idx),
                "previous_subject": prev_subject,
            },
        }

        # Render prompt template
        rendered_prompt, _, missing_vars = SafeTemplateRenderer.render(
            template_text, renderer_context
        )

        # Inject standard follow-up rules to guarantee AI does not fake read claims
        instruction_payload = (
            f"{rendered_prompt}\n\n"
            f"IMPORTANT COMPLIANCE RULE: Do NOT fabricate or claim that the recipient read, opened, or clicked "
            f"on any previous emails. Keep the tone professional, concise, and focused on the campaign offer."
        )

        # AI generation call
        gemini = GeminiService()
        ai_res = gemini.generate_email_content(
            instruction_payload, user_id=campaign["user_id"]
        )

        subject = (
            ai_res.get("subject")
            or prev_subject
            or f"Follow-up regarding {campaign.get('name')}"
        )
        body = ai_res.get("body") or ""

        # Quality evaluation
        quality_checker = EmailQualityService()
        eval_res = quality_checker.evaluate_draft(
            subject, body, campaign.get("campaign_type") or "generic", lead
        )

        draft_id = str(uuid.uuid4())

        # Determine human approval logic
        manual_req = bool(current_step.get("require_manual_approval", 1))
        pre_approved_mode = campaign.get("approval_mode") == "pre-approved"

        if manual_req or not pre_approved_mode:
            draft_status = "draft"
            lead_status = "awaiting_approval"
            scheduled_time_str = None
        else:
            draft_status = "approved"
            lead_status = "scheduled"

            # Calculate dispatch schedule time
            base_time = datetime.datetime.now(datetime.UTC)
            scheduled_time = cls.calculate_next_send_time(
                from_utc_dt=base_time,
                delay_amount=current_step.get("delay_amount", 0),
                delay_unit=current_step.get("delay_unit", "hours"),
                timezone_str=campaign.get("timezone", "UTC"),
                window_start_str=campaign.get("sending_window_start", "09:00"),
                window_end_str=campaign.get("sending_window_end", "17:00"),
                exclude_weekends=bool(cl.get("exclude_weekends", 1)),
            )
            scheduled_time_str = scheduled_time.isoformat()

        # Insert draft
        draft_payload = {
            "id": draft_id,
            "lead_id": lead_id,
            "user_id": campaign["user_id"],
            "email_type": campaign.get("campaign_type") or "generic",
            "subject": eval_res["subject"],
            "body": eval_res["body"],
            "status": draft_status,
            "ai_model": ai_res.get("model_used") or "gemini-1.5-flash",
            "prompt_version": prompt_ver_id or "default",
            "quality_score": eval_res["scores"]["quality_score"],
            "spam_risk_score": eval_res["scores"]["spam_risk_score"],
            "personalization_score": eval_res["scores"]["personalization_score"],
            "clarity_score": eval_res["scores"]["clarity_score"],
            "warnings": json.dumps(eval_res["warnings"]),
            "campaign_id": campaign_id,
            "variant_id": assigned_variant_id,
            "variant_name": assigned_variant_name,
        }
        supabase.table("email_drafts").insert(draft_payload).execute()

        # Update campaign lead status
        supabase.table("campaign_leads").update(
            {"status": lead_status, "next_step_scheduled_at": scheduled_time_str}
        ).eq("id", campaign_lead_id).execute()

        return {
            "status": lead_status,
            "draft_id": draft_id,
            "scheduled_at": scheduled_time_str,
        }

    @classmethod
    def approve_lead_draft(cls, campaign_lead_id: str, draft_id: str) -> dict[str, Any]:
        """
        Manually approves a generated draft, transitioning campaign lead to scheduled.
        """
        cl_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("id", campaign_lead_id)
            .execute()
        )
        if not cl_res.data:
            raise ValueError("Campaign lead not found")
        cl = cl_res.data[0]

        campaign_id = cl["campaign_id"]
        step_idx = cl["current_sequence_step"]

        camp_res = (
            supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
        )
        campaign = camp_res.data[0]

        seq_id = campaign.get("sequence_id")
        steps_res = (
            supabase.table("sequence_steps")
            .select("*")
            .eq("sequence_id", seq_id)
            .order("step_number")
            .execute()
        )
        steps = steps_res.data or []

        current_step = steps[step_idx - 1] if steps and step_idx <= len(steps) else {}

        # Set draft as approved
        supabase.table("email_drafts").update({"status": "approved"}).eq(
            "id", draft_id
        ).execute()

        # Calculate dispatch time
        base_time = datetime.datetime.now(datetime.UTC)
        scheduled_time = cls.calculate_next_send_time(
            from_utc_dt=base_time,
            delay_amount=current_step.get("delay_amount", 0),
            delay_unit=current_step.get("delay_unit", "hours"),
            timezone_str=campaign.get("timezone", "UTC"),
            window_start_str=campaign.get("sending_window_start", "09:00"),
            window_end_str=campaign.get("sending_window_end", "17:00"),
            exclude_weekends=bool(cl.get("exclude_weekends", 1)),
        )

        supabase.table("campaign_leads").update(
            {
                "status": "scheduled",
                "next_step_scheduled_at": scheduled_time.isoformat(),
            }
        ).eq("id", campaign_lead_id).execute()

        return {
            "status": "scheduled",
            "next_step_scheduled_at": scheduled_time.isoformat(),
        }

    @classmethod
    def dispatch_scheduled_email(
        cls, campaign_lead_id: str, draft_id: str
    ) -> dict[str, Any]:
        """
        Sends the approved draft via Gmail API and calculates scheduling for the next step.
        """
        cl_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("id", campaign_lead_id)
            .execute()
        )
        if not cl_res.data:
            raise ValueError("Campaign lead not found")
        cl = cl_res.data[0]

        stop_needed, stop_reason = cls.evaluate_stop_conditions(
            cl["campaign_id"], cl["lead_id"]
        )
        if stop_needed:
            supabase.table("campaign_leads").update(
                {
                    "status": "stopped",
                    "stopped_reason": stop_reason,
                    "next_step_scheduled_at": None,
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "stopped", "reason": stop_reason}

        gmail_service = GmailService()
        res = gmail_service.send_approved_email(
            draft_id=draft_id, user_id=cl["user_id"]
        )

        if res.get("status") == "success":
            return cls.transition_sent(campaign_lead_id)
        else:
            supabase.table("campaign_leads").update(
                {
                    "status": "failed",
                    "last_error": res.get("error") or "Gmail transmission failed",
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "failed", "error": res.get("error")}

    @classmethod
    def transition_sent(cls, campaign_lead_id: str) -> dict[str, Any]:
        """
        Sets last_sent_at timestamp and schedules waiting period for next sequence step.
        """
        cl_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("id", campaign_lead_id)
            .execute()
        )
        cl = cl_res.data[0]

        next_step = cl["current_sequence_step"] + 1

        camp_res = (
            supabase.table("campaigns")
            .select("*")
            .eq("id", cl["campaign_id"])
            .execute()
        )
        campaign = camp_res.data[0]

        seq_id = campaign.get("sequence_id")
        steps_res = (
            supabase.table("sequence_steps")
            .select("*")
            .eq("sequence_id", seq_id)
            .execute()
        )
        total_steps = len(steps_res.data or [])

        if next_step > total_steps:
            supabase.table("campaign_leads").update(
                {
                    "status": "completed",
                    "completed_at": datetime.datetime.now(datetime.UTC).isoformat(),
                    "next_step_scheduled_at": None,
                    "last_sent_at": datetime.datetime.now(datetime.UTC).isoformat(),
                }
            ).eq("id", campaign_lead_id).execute()
            return {"status": "completed"}

        supabase.table("campaign_leads").update(
            {
                "status": "waiting",
                "current_sequence_step": next_step,
                "last_sent_at": datetime.datetime.now(datetime.UTC).isoformat(),
                "next_step_scheduled_at": None,
            }
        ).eq("id", campaign_lead_id).execute()

        return cls.schedule_waiting_period(campaign_lead_id)

    @classmethod
    def schedule_waiting_period(cls, campaign_lead_id: str) -> dict[str, Any]:
        """
        Transitions lead from waiting back to generation state after calculating delay.
        """
        cl_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("id", campaign_lead_id)
            .execute()
        )
        cl = cl_res.data[0]

        camp_res = (
            supabase.table("campaigns")
            .select("*")
            .eq("id", cl["campaign_id"])
            .execute()
        )
        campaign = camp_res.data[0]

        seq_id = campaign.get("sequence_id")
        steps_res = (
            supabase.table("sequence_steps")
            .select("*")
            .eq("sequence_id", seq_id)
            .order("step_number")
            .execute()
        )
        steps = steps_res.data or []

        step_idx = cl["current_sequence_step"]
        current_step = steps[step_idx - 1]

        base_time = datetime.datetime.now(datetime.UTC)
        if cl.get("last_sent_at"):
            try:
                base_time = datetime.datetime.fromisoformat(cl["last_sent_at"])
            except Exception:
                pass

        scheduled_time = cls.calculate_next_send_time(
            from_utc_dt=base_time,
            delay_amount=current_step.get("delay_amount", 0),
            delay_unit=current_step.get("delay_unit", "hours"),
            timezone_str=campaign.get("timezone", "UTC"),
            window_start_str=campaign.get("sending_window_start", "09:00"),
            window_end_str=campaign.get("sending_window_end", "17:00"),
            exclude_weekends=bool(cl.get("exclude_weekends", 1)),
        )

        supabase.table("campaign_leads").update(
            {"next_step_scheduled_at": scheduled_time.isoformat()}
        ).eq("id", campaign_lead_id).execute()

        return {
            "status": "waiting",
            "next_step_scheduled_at": scheduled_time.isoformat(),
        }

    @classmethod
    def transition_waiting_to_generation(cls, campaign_lead_id: str) -> dict[str, Any]:
        """
        Transitions lead state from waiting to awaiting_generation.
        """
        supabase.table("campaign_leads").update(
            {"status": "awaiting_generation", "next_step_scheduled_at": None}
        ).eq("id", campaign_lead_id).execute()
        return {"status": "awaiting_generation"}

    @classmethod
    def evaluate_stop_conditions(
        cls, campaign_id: str, lead_id: str
    ) -> tuple[bool, str | None]:
        """
        Scans leads details, tags, and campaign status to check if follow-up sequence should halt.
        """
        lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
        if not lead_res.data:
            return True, "Lead not found"
        lead = lead_res.data[0]

        if lead.get("lead_status") == "Archived":
            return True, "Lead archived / invalidated"

        email = lead.get("contact_email")
        if email:
            dnc_check = (
                supabase.table("do_not_contact")
                .select("id")
                .eq("email", email.strip().lower())
                .execute()
            )
            if dnc_check.data:
                return True, "Lead added to Do Not Contact (DNC) list"

        tags = []
        if isinstance(lead.get("tags"), str):
            try:
                tags = json.loads(lead["tags"])
            except Exception:
                tags = []
        elif isinstance(lead.get("tags"), list):
            tags = lead["tags"]

        opt_out_keywords = ["unsubscribed", "opt-out", "bounce", "replied", "stop"]
        for tag in tags:
            if tag.lower() in opt_out_keywords:
                return True, f"Lead tag stop keyword matched: '{tag}'"

        events_res = (
            supabase.table("send_events")
            .select("*")
            .eq("campaign_id", campaign_id)
            .eq("lead_id", lead_id)
            .execute()
        )
        for ev in events_res.data or []:
            if ev.get("event_type") in ["reply", "replied"]:
                return True, "Lead replied to sequence thread"
            if ev.get("event_type") == "bounce":
                return True, "Email bounced"

        return False, None

    @classmethod
    def recalculate_paused_campaign_leads(cls, campaign_id: str) -> None:
        """
        Safe reschedule recalculation of all campaign lead scheduling times after campaign resumes.
        """
        leads_res = (
            supabase.table("campaign_leads")
            .select("*")
            .eq("campaign_id", campaign_id)
            .execute()
        )
        for cl in leads_res.data or []:
            if (
                cl.get("status")
                in ["awaiting_generation", "awaiting_approval", "scheduled", "stopped"]
                and cl.get("stopped_reason") == "Campaign paused"
            ):
                cls.schedule_current_step(cl["id"])
