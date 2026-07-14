import datetime
import logging
import time
from typing import Any

from fastapi import APIRouter, Depends

from app.config import settings
from app.database import supabase
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.health")

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health_check():
    """
    Diagnostic dashboard check verifying API runtime and Supabase connection states.
    Publicly accessible, returning generic indicator without exposing internal errors.
    """
    db_status = "unconfigured"

    if supabase:
        try:
            # Run simple query to check connection
            supabase.table("users").select("count", count="exact").limit(0).execute()
            db_status = "connected"
        except Exception:
            db_status = "failed"

    overall_status = "healthy" if db_status == "connected" else "unhealthy"

    return {
        "status": overall_status,
        "app": "OutreachOps AI API",
        "version": "1.0.0",
        "database": db_status,
    }


@router.get("/diagnostics")
async def diagnostics_check(owner: dict = Depends(require_owner)) -> dict[str, Any]:
    """
    Detailed owner-only diagnostics endpoint showing worker, DB, queues, and API connectivity.
    """
    user_id = owner["id"]

    # 1. DB connection check
    db_status = "unconfigured"
    db_details = None
    if supabase:
        try:
            supabase.table("users").select("count", count="exact").limit(0).execute()
            db_status = "connected"
            db_details = "Verification successful"
        except Exception as e:
            db_status = "failed"
            db_details = str(e)

    # 2. Worker Heartbeats
    from app.services.durable_sending_worker import DurableSendingWorker
    from app.services.generation_worker import GenerationWorker

    sending_worker = DurableSendingWorker.get_health_status()
    generation_worker = GenerationWorker.get_health_status()

    # 3. Gmail Integration Connection State
    from app.services.gmail_service import GmailService

    try:
        gmail_service = GmailService()
        gmail_connection = gmail_service.check_connection_status(user_id)
    except Exception as e:
        gmail_connection = {"status": "error", "details": str(e)}

    # 4. AI Provider (Gemini) Connection Check
    import requests

    from app.services.gemini_service import GeminiService

    ai_status = "unconfigured"
    ai_details = None
    try:
        gemini_svc = GeminiService()
        if gemini_svc.api_key:
            # Quick direct HTTP request to model api to verify connection with 5s timeout
            res = requests.get(
                f"https://generativelanguage.googleapis.com/v1beta/models?key={gemini_svc.api_key}",
                timeout=5.0,
            )
            if res.status_code == 200:
                ai_status = "connected"
                ai_details = "Gemini API verification check succeeded."
            else:
                ai_status = "failed"
                ai_details = f"Gemini API returned status code {res.status_code}"
        else:
            ai_status = "unconfigured"
            ai_details = "API key not set in environment or settings"
    except Exception as e:
        ai_status = "failed"
        ai_details = str(e)

    # 5. Queue depths & stuck jobs
    gen_queue_pending = 0
    gen_queue_processing = 0
    send_queue_pending = 0
    send_queue_processing = 0
    stuck_gen_jobs = 0
    stuck_send_jobs = 0
    retry_count = 0
    dlq_count = 0

    if supabase:
        try:
            # Gen Queue
            res_gen_p = (
                supabase.table("generation_job_items")
                .select("count", count="exact")
                .eq("status", "pending")
                .execute()
            )
            gen_queue_pending = res_gen_p.count or 0

            res_gen_pr = (
                supabase.table("generation_job_items")
                .select("count", count="exact")
                .eq("status", "processing")
                .execute()
            )
            gen_queue_processing = res_gen_pr.count or 0

            # Send Queue
            res_send_p = (
                supabase.table("scheduled_emails")
                .select("count", count="exact")
                .eq("status", "pending")
                .execute()
            )
            send_queue_pending = res_send_p.count or 0

            res_send_pr = (
                supabase.table("scheduled_emails")
                .select("count", count="exact")
                .eq("status", "processing")
                .execute()
            )
            send_queue_processing = res_send_pr.count or 0

            # Stuck jobs (> 1 hour in processing)
            one_hour_ago = (
                datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=1)
            ).isoformat()
            res_stuck_g = (
                supabase.table("generation_job_items")
                .select("count", count="exact")
                .eq("status", "processing")
                .lt("updated_at", one_hour_ago)
                .execute()
            )
            stuck_gen_jobs = res_stuck_g.count or 0

            res_stuck_s = (
                supabase.table("scheduled_emails")
                .select("count", count="exact")
                .eq("status", "processing")
                .lt("updated_at", one_hour_ago)
                .execute()
            )
            stuck_send_jobs = res_stuck_s.count or 0

            # Retries
            res_ret = (
                supabase.table("scheduled_emails")
                .select("count", count="exact")
                .eq("status", "retry")
                .execute()
            )
            retry_count = res_ret.count or 0

            # DLQ (failed sending jobs)
            res_dlq = (
                supabase.table("scheduled_emails")
                .select("count", count="exact")
                .eq("status", "failed")
                .execute()
            )
            dlq_count = res_dlq.count or 0
        except Exception as e:
            logger.error(f"Failed to query diagnostic queue stats: {e}")

    # 6. Worker controls
    from app.services.worker_control_service import WorkerControlService

    controls = WorkerControlService.get_controls(user_id)

    return {
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        "database": {"status": db_status, "details": db_details},
        "workers": {
            "sending_worker": sending_worker,
            "generation_worker": generation_worker,
        },
        "gmail": gmail_connection,
        "gemini": {"status": ai_status, "details": ai_details},
        "queues": {
            "generation_queue_pending": gen_queue_pending,
            "generation_queue_processing": gen_queue_processing,
            "send_queue_pending": send_queue_pending,
            "send_queue_processing": send_queue_processing,
        },
        "stuck_jobs": {
            "generation_stuck_count": stuck_gen_jobs,
            "send_stuck_count": stuck_send_jobs,
        },
        "retries_and_failures": {
            "retry_count": retry_count,
            "dead_letter_count": dlq_count,
        },
        "controls": controls,
        "branding": {
            "agency": settings.YOUR_AGENCY_NAME,
            "website": settings.YOUR_WEBSITE,
        },
    }
