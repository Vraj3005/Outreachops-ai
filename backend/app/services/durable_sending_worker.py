import os
import sys
import time
import json
import logging
import datetime
import random
import signal
import threading
import email.message
import base64
from typing import Dict, Any, List, Optional
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from googleapiclient.discovery import build
from google.auth.transport.requests import Request

from app.config import settings
from app.database import supabase
from app.services.gmail_service import GmailService
from app.services.rate_limit_service import RateLimitService

logger = logging.getLogger("outreachops.services.durable_sending_worker")


class DurableSendingWorker:
    _thread: threading.Thread = None
    _stop_event = threading.Event()
    _running = False
    _heartbeat_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "worker_heartbeat.json")

    @classmethod
    def start(cls):
        if cls._running:
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._run_worker_loop, daemon=True)
        cls._running = True
        cls._thread.start()
        logger.info("Durable sending worker daemon thread started")

    @classmethod
    def stop(cls):
        if not cls._running:
            return
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=3.0)
        cls._running = False
        logger.info("Durable sending worker daemon thread stopped")

    @classmethod
    def _run_worker_loop(cls):
        while not cls._stop_event.is_set():
            try:
                cls.tick()
            except Exception as e:
                logger.error(f"Error in durable worker iteration: {e}")
            
            # Health heartbeat update
            cls._update_heartbeat()
            
            cls._stop_event.wait(3.0)

    @classmethod
    def _update_heartbeat(cls):
        try:
            hb_data = {
                "status": "healthy",
                "last_heartbeat": datetime.datetime.now(datetime.UTC).isoformat(),
                "pid": os.getpid(),
                "timestamp": time.time()
            }
            with open(cls._heartbeat_path, "w") as f:
                json.dump(hb_data, f)
        except Exception as e:
            logger.error(f"Failed to update worker heartbeat file: {e}")

    @classmethod
    def get_health_status(cls) -> Dict[str, Any]:
        """Reads local heartbeat file to confirm worker status."""
        try:
            if os.path.exists(cls._heartbeat_path):
                with open(cls._heartbeat_path, "r") as f:
                    hb = json.load(f)
                age = time.time() - hb.get("timestamp", 0)
                if age < 15: # Within 15 seconds is healthy
                    return {"status": "healthy", "last_heartbeat": hb.get("last_heartbeat")}
            return {"status": "offline", "reason": "No active heartbeat registered within bounds"}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    @classmethod
    def tick(cls):
        """
        Locks pending/retry scheduled emails, validates multi-level guardrails, and dispatches via Gmail.
        """
        if not supabase:
            return

        now_str = datetime.datetime.now(datetime.UTC).isoformat()
        
        # Concurrency-safe claim logic
        # 1. Fetch pending candidates
        cand_res = supabase.table("scheduled_emails")\
            .select("*")\
            .in_("status", ["pending", "retry"])\
            .execute()

        candidates = cand_res.data or []
        due_candidates = []
        
        for cand in candidates:
            sched_time = cand.get("scheduled_for") or cand.get("scheduled_at")
            if sched_time and sched_time <= now_str:
                due_candidates.append(cand)

        # Process a batch size of up to 5 at a time
        batch = due_candidates[:5]
        for job in batch:
            # Atomic claim status transition check
            claim_res = supabase.table("scheduled_emails").update({
                "status": "processing",
                "attempts": (job.get("attempts") or 0) + 1,
                "updated_at": now_str
            }).eq("id", job["id"]).eq("status", job["status"]).execute()

            if not claim_res.data:
                # Claim failed (claimed by another process thread), skip
                continue

            cls._process_job(job)

    @classmethod
    def _process_job(cls, job: Dict[str, Any]):
        now_str = datetime.datetime.now(datetime.UTC).isoformat()
        draft_id = job["draft_id"]
        lead_id = job["lead_id"]
        campaign_id = job["campaign_id"]
        user_id = job["user_id"]

        try:
            # 1. Idempotency Check (Check if already sent)
            if job.get("idempotency_key"):
                sent_check = supabase.table("send_events")\
                    .select("id")\
                    .eq("user_id", user_id)\
                    .eq("campaign_id", campaign_id)\
                    .eq("lead_id", lead_id)\
                    .eq("event_type", "sent")\
                    .execute()
                if sent_check.data:
                    logger.warning(f"Idempotency violation caught. Skip dispatching scheduled_email {job['id']}.")
                    supabase.table("scheduled_emails").update({
                        "status": "sent",
                        "updated_at": now_str
                    }).eq("id", job["id"]).execute()
                    return

            # 2. Fetch dependencies
            camp_res = supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
            if not camp_res.data:
                raise ValueError("Campaign not found")
            campaign = camp_res.data[0]

            lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
            if not lead_res.data:
                raise ValueError("Lead not found")
            lead = lead_res.data[0]

            draft_res = supabase.table("email_drafts").select("*").eq("id", draft_id).execute()
            if not draft_res.data:
                raise ValueError("Draft not found")
            draft = draft_res.data[0]

            # 3. Guardrail Validations
            ok, fail_reason = cls._check_guardrails(job, campaign, lead, draft)
            if not ok:
                # Permanent failure
                cls._mark_failed(job, fail_reason, is_transient=False)
                return

            # 4. Dispatch Email
            cls._dispatch_gmail(job, campaign, lead, draft)

        except Exception as e:
            err_str = str(e).lower()
            is_trans = ("429" in err_str or "503" in err_str or "timeout" in err_str or "rate limit" in err_str or "overloaded" in err_str)
            cls._mark_failed(job, str(e), is_transient=is_trans)

    @classmethod
    def _check_guardrails(cls, job: Dict[str, Any], campaign: Dict[str, Any], lead: Dict[str, Any], draft: Dict[str, Any]) -> tuple[bool, Optional[str]]:
        # A. Demo Mode validation
        if settings.DEMO_MODE and not settings.DEMO_SENDING_ENABLED:
            return False, "Demo Mode active. Sending is disabled."

        # B. Campaign Active Status
        if campaign.get("status") != "active":
            return False, "Campaign is not in active state"

        # C. Draft Approved Status
        if draft.get("status") != "approved":
            return False, f"Associated draft is in status '{draft.get('status')}', not approved"

        # D. Lead validity check
        if lead.get("lead_status") == "Archived":
            return False, "Associated lead status is marked Archived"

        # E. Recipient validity
        email_str = lead.get("contact_email") or ""
        if "@" not in email_str or "." not in email_str:
            return False, f"Invalid recipient email formatting: '{email_str}'"

        # F. Not DNC check
        dnc_res = supabase.table("do_not_contact")\
            .select("id")\
            .eq("user_id", job["user_id"])\
            .eq("email", email_str.strip().lower())\
            .execute()
        if dnc_res.data:
            return False, "Recipient is on the Do Not Contact (DNC) list"

        # G. Reply-stop / tags validation
        tags = []
        lead_tags = lead.get("tags")
        if isinstance(lead_tags, str):
            try:
                tags = json.loads(lead_tags)
            except Exception:
                pass
        elif isinstance(lead_tags, list):
            tags = lead_tags

        opt_outs = ["unsubscribed", "opt-out", "bounce", "replied", "stop"]
        for tag in tags:
            if tag.lower() in opt_outs:
                return False, f"Recipient lead is opt-out blocked by tag: '{tag}'"

        # H. Active reply search
        events_res = supabase.table("send_events")\
            .select("event_type")\
            .eq("campaign_id", campaign["id"])\
            .eq("lead_id", lead["id"])\
            .execute()
        for ev in (events_res.data or []):
            if ev.get("event_type") in ["reply", "replied"]:
                return False, "Recipient replied to previous thread step"
            if ev.get("event_type") == "bounce":
                return False, "Email address has bounced"

        # I. User Daily cap checks
        sent_today = cls._count_today_sends(job["user_id"])
        daily_limit = campaign.get("daily_send_limit") or 50
        if sent_today >= daily_limit:
            return False, f"Daily cap reached ({sent_today} / {daily_limit})"

        # J. Time slot window check
        timezone_str = campaign.get("timezone", "UTC")
        window_start = campaign.get("sending_window_start", "09:00")
        window_end = campaign.get("sending_window_end", "17:00")
        exclude_weekends = bool(campaign.get("exclude_weekends", 1))

        from zoneinfo import ZoneInfo
        try:
            tz = ZoneInfo(timezone_str)
        except Exception:
            tz = datetime.timezone.utc

        now_local = datetime.datetime.now(tz)
        if exclude_weekends and now_local.weekday() >= 5:
            return False, "Weekend sending is excluded by campaign option"

        try:
            sh, sm = map(int, window_start.split(":"))
            eh, em = map(int, window_end.split(":"))
        except Exception:
            sh, sm = 9, 0
            eh, em = 17, 0

        curr_mins = now_local.hour * 60 + now_local.minute
        if curr_mins < (sh * 60 + sm) or curr_mins > (eh * 60 + em):
            return False, f"Current hour falls outside allowed sending hours window: {window_start}-{window_end}"

        return True, None

    @classmethod
    def _count_today_sends(cls, user_id: str) -> int:
        now = datetime.datetime.now(datetime.UTC)
        start_of_day = datetime.datetime(now.year, now.month, now.day, 0, 0, 0, tzinfo=datetime.UTC).isoformat()
        
        events = supabase.table("send_events")\
            .select("id")\
            .eq("user_id", user_id)\
            .eq("event_type", "sent")\
            .gte("occurred_at", start_of_day)\
            .execute()
        return len(events.data or [])

    @classmethod
    def _dispatch_gmail(cls, job: Dict[str, Any], campaign: Dict[str, Any], lead: Dict[str, Any], draft: Dict[str, Any]):
        gmail_service = GmailService()
        user_id = job["user_id"]
        recipient = lead["contact_email"]
        subject = draft["subject"]
        body = draft["body"]

        # Prevent header injection: strip CR/LF
        clean_subject = subject.replace("\r", "").replace("\n", "")

        gmail_message_id = None
        gmail_thread_id = None

        if settings.DEMO_MODE:
            gmail_message_id = f"demo_msg_{job['id']}_{int(time.time())}"
            gmail_thread_id = f"demo_thread_{job['id']}"
            logger.info(f"[Demo Mode] Dispatched email to {recipient} (ID: {gmail_message_id})")
        else:
            # Refresh connection
            gmail_service.check_connection_status(user_id)
            gmail_client = gmail_service._get_gmail_client(user_id)

            message = MIMEMultipart()
            message["to"] = recipient
            message["subject"] = clean_subject
            message.attach(MIMEText(body, "plain", "utf-8"))

            # Reply Threading
            # Find previous step dispatched message
            prev_events = supabase.table("send_events")\
                .select("gmail_message_id, gmail_thread_id")\
                .eq("campaign_id", campaign["id"])\
                .eq("lead_id", lead["id"])\
                .eq("event_type", "sent")\
                .order("occurred_at", desc=True)\
                .execute()

            body_payload = {}
            if prev_events.data and prev_events.data[0].get("gmail_message_id"):
                prev_msg_id = prev_events.data[0]["gmail_message_id"]
                prev_thread_id = prev_events.data[0]["gmail_thread_id"]
                
                # Format headers properly
                formatted_msg_id = prev_msg_id if (prev_msg_id.startswith("<") and prev_msg_id.endswith(">")) else f"<{prev_msg_id}>"
                message["In-Reply-To"] = formatted_msg_id
                message["References"] = formatted_msg_id
                
                body_payload["threadId"] = prev_thread_id
                gmail_thread_id = prev_thread_id

            raw_msg = base64.urlsafe_b64encode(message.as_bytes()).decode()
            body_payload["raw"] = raw_msg

            # Send via Gmail
            res = gmail_client.users().messages().send(userId="me", body=body_payload).execute()
            gmail_message_id = res.get("id")
            gmail_thread_id = res.get("threadId") or gmail_thread_id or gmail_message_id

        now_str = datetime.datetime.now(datetime.UTC).isoformat()

        # Update draft
        supabase.table("email_drafts").update({
            "status": "sent",
            "sent_at": now_str
        }).eq("id", draft["id"]).execute()

        # Insert send event log
        event_id = str(mocker_uuid() if "mocker_uuid" in globals() else uuid_gen())
        supabase.table("send_events").insert({
            "id": event_id,
            "user_id": user_id,
            "campaign_id": campaign["id"],
            "lead_id": lead["id"],
            "scheduled_email_id": job["id"],
            "event_type": "sent",
            "recipient_email": recipient,
            "gmail_message_id": gmail_message_id,
            "gmail_thread_id": gmail_thread_id,
            "variant_id": draft.get("variant_id"),
            "variant_name": draft.get("variant_name"),
            "prompt_version_id": draft.get("prompt_version"),
            "occurred_at": now_str
        }).execute()

        # Update scheduled email record status to sent
        supabase.table("scheduled_emails").update({
            "status": "sent",
            "gmail_message_id": gmail_message_id,
            "gmail_thread_id": gmail_thread_id,
            "updated_at": now_str
        }).eq("id", job["id"]).execute()

        # Transition next sequence step state
        from app.services.sequence_service import SequenceService
        cl_res = supabase.table("campaign_leads")\
            .select("id")\
            .eq("campaign_id", campaign["id"])\
            .eq("lead_id", lead["id"])\
            .execute()
        if cl_res.data:
            SequenceService.transition_sent(cl_res.data[0]["id"])

        logger.info(f"Durable dispatch success: Job {job['id']} for lead {lead['id']}")

    @classmethod
    def _mark_failed(cls, job: Dict[str, Any], error: str, is_transient: bool):
        now_str = datetime.datetime.now(datetime.UTC).isoformat()
        attempts = job.get("attempts") or 1

        if is_transient and attempts < 3:
            # Exponential backoff + jitter (2^attempts minutes delay)
            backoff_mins = (2 ** attempts) + random.uniform(0.5, 1.5)
            next_time = datetime.datetime.now(datetime.UTC) + datetime.timedelta(minutes=backoff_mins)
            
            supabase.table("scheduled_emails").update({
                "status": "retry",
                "last_error": error,
                "scheduled_for": next_time.isoformat(),
                "updated_at": now_str
            }).eq("id", job["id"]).execute()
            
            logger.info(f"Transient error on job {job['id']}. Rescheduled for retry at {next_time.isoformat()}")
        else:
            # Permanent failure or dead-letter bounds exceeded
            supabase.table("scheduled_emails").update({
                "status": "failed",
                "last_error": error,
                "updated_at": now_str
            }).eq("id", job["id"]).execute()

            # Mark campaign lead step failed
            supabase.table("campaign_leads").update({
                "status": "failed",
                "last_error": error
            }).eq("campaign_id", job["campaign_id"]).eq("lead_id", job["lead_id"]).execute()

            # Insert failure event log
            draft_id = job.get("draft_id")
            draft = {}
            if draft_id:
                try:
                    draft_res = supabase.table("email_drafts").select("variant_id, variant_name, prompt_version").eq("id", draft_id).execute()
                    if draft_res.data:
                        draft = draft_res.data[0]
                except Exception:
                    pass

            event_id = str(mocker_uuid() if "mocker_uuid" in globals() else uuid_gen())
            supabase.table("send_events").insert({
                "id": event_id,
                "user_id": job["user_id"],
                "campaign_id": job["campaign_id"],
                "lead_id": job["lead_id"],
                "scheduled_email_id": job["id"],
                "event_type": "failed",
                "recipient_email": "",
                "error_message": error,
                "variant_id": draft.get("variant_id"),
                "variant_name": draft.get("variant_name"),
                "prompt_version_id": draft.get("prompt_version"),
                "occurred_at": now_str
            }).execute()

            logger.error(f"Permanent dispatch failure on job {job['id']}: {error}")


def uuid_gen():
    import uuid
    return uuid.uuid4()


if __name__ == "__main__":
    # Script execution signal handling
    def sig_handler(signum, frame):
        logger.info("Received stop signal. Initiating clean shutdown...")
        DurableSendingWorker.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, sig_handler)
    signal.signal(signal.SIGTERM, sig_handler)

    DurableSendingWorker.start()
    while True:
        time.sleep(1.0)
