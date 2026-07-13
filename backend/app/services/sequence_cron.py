import logging
import time
import datetime
import threading
from typing import Dict, Any

from app.database import supabase
from app.services.sequence_service import SequenceService

logger = logging.getLogger("outreachops.services.sequence_cron")


class SequenceCron:
    _thread: threading.Thread = None
    _stop_event = threading.Event()
    _running = False

    @classmethod
    def start(cls):
        if cls._running:
            return
        cls._stop_event.clear()
        cls._thread = threading.Thread(target=cls._run_cron_loop, daemon=True)
        cls._running = True
        cls._thread.start()
        logger.info("Sequence cron daemon background thread started successfully")

    @classmethod
    def stop(cls):
        if not cls._running:
            return
        cls._stop_event.set()
        if cls._thread:
            cls._thread.join(timeout=3.0)
        cls._running = False
        logger.info("Sequence cron daemon background thread stopped cleanly")

    @classmethod
    def _run_cron_loop(cls):
        while not cls._stop_event.is_set():
            try:
                cls.tick()
            except Exception as e:
                logger.error(f"Error occurred in sequence cron tick: {e}")
            
            # Poll interval: 3 seconds for responsive testing
            cls._stop_event.wait(3.0)

    @classmethod
    def tick(cls):
        """
        Executes sequence state checks and moves leads through stages.
        """
        if not supabase:
            return

        from app.services.gmail_sync_service import GmailSyncService
        try:
            GmailSyncService.sync_all_connections()
        except Exception as e:
            logger.error(f"Gmail sync execution failed in cron tick: {e}")

        now_str = datetime.datetime.now(datetime.UTC).isoformat()

        # Fetch all active campaigns
        camp_res = supabase.table("campaigns").select("id, status").eq("status", "active").execute()
        active_campaign_ids = [c["id"] for c in (camp_res.data or [])]
        if not active_campaign_ids:
            return

        # 1. Transition 'waiting' -> 'awaiting_generation' when scheduling time passes
        waiting_leads = supabase.table("campaign_leads")\
            .select("*")\
            .eq("status", "waiting")\
            .lte("next_step_scheduled_at", now_str)\
            .execute()

        for cl in (waiting_leads.data or []):
            if cl["campaign_id"] in active_campaign_ids:
                try:
                    SequenceService.transition_waiting_to_generation(cl["id"])
                    logger.info(f"Transitioned lead {cl['lead_id']} from waiting to awaiting_generation")
                except Exception as e:
                    logger.error(f"Failed to transition waiting lead {cl['id']}: {e}")

        # 2. Process 'awaiting_generation' leads -> auto generate drafts
        gen_leads = supabase.table("campaign_leads")\
            .select("*")\
            .eq("status", "awaiting_generation")\
            .execute()

        for cl in (gen_leads.data or []):
            if cl["campaign_id"] in active_campaign_ids:
                try:
                    SequenceService.generate_draft_for_current_step(cl["id"])
                    logger.info(f"Auto-generated draft for lead {cl['lead_id']} current step {cl['current_sequence_step']}")
                except Exception as e:
                    logger.error(f"Failed to generate draft for lead {cl['id']}: {e}")

        # 3. Process 'scheduled' leads whose next_step_scheduled_at is due -> dispatch
        sched_leads = supabase.table("campaign_leads")\
            .select("*")\
            .eq("status", "scheduled")\
            .lte("next_step_scheduled_at", now_str)\
            .execute()

        for cl in (sched_leads.data or []):
            if cl["campaign_id"] in active_campaign_ids:
                # Find the latest approved draft for this lead and campaign
                drafts_res = supabase.table("email_drafts")\
                    .select("id")\
                    .eq("lead_id", cl["lead_id"])\
                    .eq("campaign_id", cl["campaign_id"])\
                    .eq("status", "approved")\
                    .order("created_at", desc=True)\
                    .execute()
                
                if drafts_res.data:
                    draft_id = drafts_res.data[0]["id"]
                    try:
                        SequenceService.dispatch_scheduled_email(cl["id"], draft_id)
                        logger.info(f"Dispatched scheduled email for lead {cl['lead_id']} (Draft: {draft_id})")
                    except Exception as e:
                        logger.error(f"Failed to dispatch scheduled email for lead {cl['id']}: {e}")
                else:
                    # Approved draft was deleted or not found; mark failed
                    supabase.table("campaign_leads").update({
                        "status": "failed",
                        "last_error": "Approved draft not found for scheduled step execution"
                    }).eq("id", cl["id"]).execute()
