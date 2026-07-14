import datetime
import json
import logging
import os
import random
import threading
import time
import uuid
from typing import Any

from app.database import SQLiteSupabaseClient, supabase
from app.services.email_quality_service import EmailQualityService
from app.services.gemini_service import GeminiService
from app.services.generation_job_service import GenerationJobService
from app.services.personalization_context_service import PersonalizationContextService
from app.services.template_renderer import SafeTemplateRenderer

logger = logging.getLogger("outreachops.services.generation_worker")


class GenerationWorker:
    """
    Asynchronous queue worker to execute email generation jobs.
    Runs on a background thread and claims items concurrency-safely.
    """

    _worker_thread: threading.Thread | None = None
    _stop_event = threading.Event()
    worker_id = f"worker-{random.randint(1000, 9999)}"
    poll_interval = 1.0  # seconds
    _heartbeat_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
        "worker_generation_heartbeat.json",
    )

    @classmethod
    def start(cls):
        """
        Starts the background worker thread.
        """
        if cls._worker_thread and cls._worker_thread.is_alive():
            logger.info("Generation background worker is already running.")
            return

        cls._stop_event.clear()
        cls._worker_thread = threading.Thread(
            target=cls._run_worker_loop, name="GenerationQueueWorker", daemon=True
        )
        cls._worker_thread.start()
        logger.info(
            f"✅ Generation background worker started (Worker ID: {cls.worker_id})"
        )

    @classmethod
    def stop(cls):
        """
        Signals the worker thread to stop and joins it.
        """
        if not cls._worker_thread:
            return

        cls._stop_event.set()
        cls._worker_thread.join(timeout=5.0)
        cls._worker_thread = None
        logger.info("Stopped generation background worker thread.")

    @classmethod
    def _update_heartbeat(cls):
        try:
            hb_data = {
                "status": "healthy",
                "last_heartbeat": datetime.datetime.now(datetime.UTC).isoformat(),
                "pid": os.getpid(),
                "timestamp": time.time(),
            }
            with open(cls._heartbeat_path, "w") as f:
                json.dump(hb_data, f)
        except Exception as e:
            logger.error(f"Failed to update worker generation heartbeat file: {e}")

    @classmethod
    def _should_skip_claiming(cls) -> bool:
        try:
            res = (
                supabase.table("generation_job_items")
                .select("job_id")
                .eq("status", "pending")
                .limit(1)
                .execute()
            )
            if not res.data:
                return False
            job_id = res.data[0]["job_id"]
            job_res = (
                supabase.table("generation_jobs")
                .select("user_id")
                .eq("id", job_id)
                .execute()
            )
            if not job_res.data:
                return False
            user_id = job_res.data[0]["user_id"]

            from app.services.worker_control_service import WorkerControlService

            if WorkerControlService.is_generation_worker_paused(user_id):
                return True
            if WorkerControlService.is_queue_drain_enabled(user_id):
                return True
        except Exception as e:
            logger.warning(f"Error checking generation worker skip status: {e}")
        return False

    @classmethod
    def get_health_status(cls) -> dict[str, Any]:
        """Reads local heartbeat file to confirm worker status."""
        try:
            if os.path.exists(cls._heartbeat_path):
                with open(cls._heartbeat_path) as f:
                    hb = json.load(f)
                age = time.time() - hb.get("timestamp", 0)
                if age < 15:  # Within 15 seconds is healthy
                    return {
                        "status": "healthy",
                        "last_heartbeat": hb.get("last_heartbeat"),
                    }
            return {
                "status": "offline",
                "reason": "No active heartbeat registered within bounds",
            }
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    @classmethod
    def _run_worker_loop(cls):
        """
        Main worker execution loop.
        """
        while not cls._stop_event.is_set():
            try:
                # Update heartbeat at start of loop iteration
                cls._update_heartbeat()

                # Check if paused or draining queue
                if cls._should_skip_claiming():
                    time.sleep(cls.poll_interval)
                    continue

                # 1. Attempt to claim next pending item safely
                item = cls._claim_next_item()
                if item:
                    logger.info(
                        f"Worker {cls.worker_id} claimed item {item['id']} for job {item['job_id']}"
                    )
                    cls._process_job_item(item)
                    # Loop immediately to check if there are more items
                    continue
            except Exception as e:
                logger.error(f"Error in worker claim or process: {e}", exc_info=True)

            # Sleep if no items or error occurred
            time.sleep(cls.poll_interval)

    @classmethod
    def _claim_next_item(cls) -> dict[str, Any] | None:
        """
        Atomically claims a pending item to prevent double-claiming by parallel workers.
        Handles SQLite transaction lock or Supabase optimistic lock.
        """
        now_str = datetime.datetime.utcnow().isoformat()

        # FALLBACK 1: SQLite Transaction-Safe Claim
        if isinstance(supabase, SQLiteSupabaseClient):
            import sqlite3

            conn = sqlite3.connect(supabase.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            try:
                cursor.execute("BEGIN IMMEDIATE TRANSACTION;")
                # Grab first pending item where scheduled retry timestamp (updated_at) is ready
                cursor.execute(
                    "SELECT * FROM generation_job_items "
                    "WHERE status = 'pending' "
                    "AND (updated_at IS NULL OR updated_at <= ?) "
                    "ORDER BY created_at ASC LIMIT 1",
                    (now_str,),
                )
                row = cursor.fetchone()
                if row:
                    item = dict(row)
                    cursor.execute(
                        "UPDATE generation_job_items "
                        "SET status = 'processing', attempts = attempts + 1, updated_at = ? "
                        "WHERE id = ?",
                        (now_str, item["id"]),
                    )
                    conn.commit()
                    item["status"] = "processing"
                    item["attempts"] += 1
                    return item
                else:
                    conn.rollback()
            except Exception as e:
                conn.rollback()
                logger.error(f"SQLite claiming error: {e}")
            finally:
                conn.close()
            return None

        # FALLBACK 2: Supabase (PostgreSQL) Optimistic Lock claim
        try:
            # Query next pending item
            res = (
                supabase.table("generation_job_items")
                .select("*")
                .eq("status", "pending")
                .lte("updated_at", now_str)
                .order("created_at")
                .limit(1)
                .execute()
            )

            if res.data:
                item = res.data[0]
                # Optimistic concurrency check: set status to processing where status is STILL pending
                claim_res = (
                    supabase.table("generation_job_items")
                    .update(
                        {
                            "status": "processing",
                            "attempts": item["attempts"] + 1,
                            "updated_at": now_str,
                        }
                    )
                    .eq("id", item["id"])
                    .eq("status", "pending")
                    .execute()
                )

                if claim_res.data:
                    return claim_res.data[0]
        except Exception as e:
            logger.error(f"Supabase optimistic claim error: {e}")

        return None

    @classmethod
    def _process_job_item(cls, item: dict[str, Any]):
        """
        Runs context builder, SafeTemplateRenderer, Gemini Service and quality check for the item.
        """
        job_id = item["job_id"]
        lead_id = item["lead_id"]

        # 1. Fetch Job and check if cancelled
        job_res = (
            supabase.table("generation_jobs").select("*").eq("id", job_id).execute()
        )
        if not job_res.data:
            cls._mark_failed(item, "permanent", f"Job {job_id} not found")
            return

        job = job_res.data[0]
        if job["status"] == "cancelled":
            cls._mark_cancelled(item)
            return

        # 2. Fetch Campaign
        camp_res = (
            supabase.table("campaigns")
            .select("*")
            .eq("id", job["campaign_id"])
            .execute()
        )
        if not camp_res.data:
            cls._mark_failed(
                item, "permanent", f"Campaign {job['campaign_id']} not found"
            )
            return
        campaign = camp_res.data[0]

        # 3. Fetch Lead
        lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
        if not lead_res.data:
            cls._mark_failed(item, "permanent", f"Lead {lead_id} not found")
            return
        lead = lead_res.data[0]

        # 4. Fetch prompt version template
        template_text = None
        prompt_ver_id = job.get("prompt_version")
        if prompt_ver_id and prompt_ver_id.strip():
            pv_res = (
                supabase.table("prompt_versions")
                .select("*")
                .eq("id", prompt_ver_id.strip())
                .execute()
            )
            if pv_res.data:
                template_text = pv_res.data[0]["template_text"]

        # Fallback to campaign template_text if prompt_version record is missing
        if not template_text:
            template_text = campaign.get("prompt_template_id") or ""
            # If it's a UUID/ID, query prompt_templates
            if template_text and template_text.strip() and len(template_text) < 50:
                pt_res = (
                    supabase.table("prompt_templates")
                    .select("*")
                    .eq("id", template_text.strip())
                    .execute()
                )
                if pt_res.data:
                    template_text = pt_res.data[0]["template_text"]

        if not template_text or not template_text.strip():
            cls._mark_failed(
                item, "permanent", "No email prompt template configuration found."
            )
            return

        # 5. Fetch sender settings
        set_res = (
            supabase.table("owner_settings")
            .select("*")
            .eq("owner_id", job["user_id"])
            .execute()
        )
        sender_settings = set_res.data[0] if set_res.data else {}

        # 6. Compile trusted context
        try:
            context_data = PersonalizationContextService.compile_context(
                lead=lead, campaign=campaign, sender_settings=sender_settings
            )
        except Exception as e:
            cls._mark_failed(
                item, "permanent", f"Personalization context compilation failed: {e}"
            )
            return

        # 7. Render Template Safely
        try:
            # Map context structure to template paths
            # (e.g. campaign.objective, sender.signature, first_name)
            # Find and construct research details
            research_summary = lead.get("research_summary") or ""

            # Map variables to namespace structure
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
                    "summary": research_summary,
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
                    "step_number": "1",
                    "previous_subject": "",
                },
            }

            rendered_prompt, _, missing_vars = SafeTemplateRenderer.render(
                template_text, renderer_context
            )
            if missing_vars:
                # Treat missing required variables as permanent failure
                cls._mark_failed(
                    item,
                    "permanent",
                    f"Template rendering failed. Missing variables: {', '.join(missing_vars)}",
                )
                return
        except Exception as e:
            cls._mark_failed(item, "permanent", f"Template parsing exception: {e}")
            return

        # 8. Call AI Provider
        try:
            gemini = GeminiService()
            # Enforces fallback list & transient retry logic inside gemini_service
            ai_res = gemini.generate_email_content(
                rendered_prompt, user_id=job["user_id"]
            )

            # Check model usage for fallbacks
            configured_models = gemini.model_list
            used_model = ai_res.get("model_used")
            if (
                used_model
                and len(configured_models) > 0
                and used_model != configured_models[0]
            ):
                logger.warning(
                    f"⚠️ Fallback model trigger event occurred! Primary model failed. "
                    f"Fallback model '{used_model}' was used for item {item['id']}."
                )

            # Validate structural output
            subject = ai_res.get("subject")
            body = ai_res.get("body")
            if not subject or not body:
                cls._mark_failed(
                    item,
                    "permanent",
                    "Malformed AI output structure. Missing subject or body.",
                )
                return

        except Exception as e:
            # Check if error is transient
            err_str = str(e).lower()
            is_transient = (
                "429" in err_str
                or "503" in err_str
                or "timeout" in err_str
                or "rate limit" in err_str
                or "overloaded" in err_str
                or "quota" in err_str
            )

            if is_transient and item["attempts"] < 3:
                # Reschedule with exponential backoff & jitter
                cls._reschedule_transient(item, e)
            else:
                err_type = "transient_exhausted" if is_transient else "permanent"
                cls._mark_failed(item, err_type, f"AI generation failed: {e}")
            return

        # 9. Apply Generic Quality Checks & Save Draft
        try:
            quality_checker = EmailQualityService()
            eval_res = quality_checker.evaluate_draft(
                subject, body, campaign.get("campaign_type") or "website", lead
            )

            # Generate unique draft ID
            draft_id = str(uuid.uuid4())
            draft_payload = {
                "id": draft_id,
                "lead_id": lead_id,
                "user_id": job["user_id"],
                "email_type": campaign.get("campaign_type") or "website",
                "subject": eval_res["subject"],
                "body": eval_res["body"],
                "status": "draft",
                "ai_model": used_model,
                "prompt_version": prompt_ver_id or "default",
                "quality_score": eval_res["scores"]["quality_score"],
                "spam_risk_score": eval_res["scores"]["spam_risk_score"],
                "personalization_score": eval_res["scores"]["personalization_score"],
                "clarity_score": eval_res["scores"]["clarity_score"],
                "warnings": json.dumps(eval_res["warnings"]),
                "campaign_id": campaign["id"],
                "generation_job_id": job_id,
                "created_at": datetime.datetime.utcnow().isoformat(),
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }

            supabase.table("email_drafts").insert(draft_payload).execute()

            # 10. Mark item completed
            supabase.table("generation_job_items").update(
                {
                    "status": "completed",
                    "resulting_draft_id": draft_id,
                    "error_message": None,
                    "error_type": None,
                    "updated_at": datetime.datetime.utcnow().isoformat(),
                }
            ).eq("id", item["id"]).execute()

            logger.info(
                f"Successfully processed item {item['id']} for lead {lead_id} (Draft: {draft_id})"
            )

        except Exception as e:
            cls._mark_failed(
                item, "permanent", f"Failed to run quality checks or save draft: {e}"
            )

        finally:
            GenerationJobService.sync_job_counts(job_id)

    @classmethod
    def _reschedule_transient(cls, item: dict[str, Any], exc: Exception):
        """
        Schedules a retry of a transient failure with exponential backoff & jitter.
        """
        attempts = item["attempts"]
        # delay = 2^attempts + jitter
        delay = (2**attempts) + random.uniform(0.5, 1.5)
        eta = datetime.datetime.utcnow() + datetime.timedelta(seconds=delay)

        supabase.table("generation_job_items").update(
            {
                "status": "pending",
                "error_type": "transient",
                "error_message": f"Transient error: {exc}",
                "updated_at": eta.isoformat(),
            }
        ).eq("id", item["id"]).execute()

        logger.warning(
            f"Transient failure on item {item['id']}, scheduled retry #{attempts} in {delay:.2f}s."
        )

    @classmethod
    def _mark_failed(cls, item: dict[str, Any], error_type: str, error_message: str):
        """
        Marks an item as permanently failed (dead-lettering).
        """
        supabase.table("generation_job_items").update(
            {
                "status": "failed",
                "error_type": error_type,
                "error_message": error_message,
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }
        ).eq("id", item["id"]).execute()

        logger.error(f"Permanent failure on item {item['id']}: {error_message}")
        GenerationJobService.sync_job_counts(item["job_id"])

    @classmethod
    def _mark_cancelled(cls, item: dict[str, Any]):
        """
        Marks an item as cancelled.
        """
        supabase.table("generation_job_items").update(
            {
                "status": "cancelled",
                "updated_at": datetime.datetime.utcnow().isoformat(),
            }
        ).eq("id", item["id"]).execute()

        logger.info(
            f"Item {item['id']} marked as cancelled due to cancelled job header."
        )
        GenerationJobService.sync_job_counts(item["job_id"])
