import logging

from fastapi import APIRouter, Depends, status

from app.database import supabase
from app.services.gmail_service import GmailService
from app.services.rate_limit_service import RateLimitService
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.emails")

router = APIRouter(prefix="/emails", tags=["emails"])

gmail_service = GmailService()
rate_limit_service = RateLimitService()


import datetime
import uuid

from fastapi import HTTPException


@router.post("/send-approved", status_code=status.HTTP_202_ACCEPTED)
async def trigger_send_approved_emails(owner: dict = Depends(require_owner)):
    """
    Finds all approved drafts and schedules them immediately in the durable scheduled queue.
    """
    user_id = owner["id"]
    try:
        drafts_res = (
            supabase.table("email_drafts")
            .select("*")
            .eq("user_id", user_id)
            .eq("status", "approved")
            .execute()
        )
        drafts = drafts_res.data or []

        scheduled_count = 0
        for draft in drafts:
            exist_check = (
                supabase.table("scheduled_emails")
                .select("id")
                .eq("draft_id", draft["id"])
                .execute()
            )
            if exist_check.data:
                continue

            sched_id = str(uuid.uuid4())
            now_str = datetime.datetime.now(datetime.UTC).isoformat()
            idempotency_key = f"send_draft_{draft['id']}"

            campaign_id = draft.get("campaign_id") or "default-campaign"
            lead_id = draft.get("lead_id")

            cl_res = (
                supabase.table("campaign_leads")
                .select("current_sequence_step")
                .eq("campaign_id", campaign_id)
                .eq("lead_id", lead_id)
                .execute()
            )
            step_num = cl_res.data[0]["current_sequence_step"] if cl_res.data else 1

            supabase.table("scheduled_emails").insert(
                {
                    "id": sched_id,
                    "user_id": user_id,
                    "draft_id": draft["id"],
                    "campaign_id": campaign_id,
                    "lead_id": lead_id,
                    "sequence_step_id": str(step_num),
                    "scheduled_at": now_str,
                    "scheduled_for": now_str,
                    "status": "pending",
                    "idempotency_key": idempotency_key,
                    "attempts": 0,
                }
            ).execute()
            scheduled_count += 1

        return {
            "status": "success",
            "message": f"Successfully queued {scheduled_count} approved emails.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/queue")
async def get_scheduled_emails_queue(owner: dict = Depends(require_owner)):
    """
    Returns list of all scheduled, processing, sent, and failed items in the queue.
    """
    try:
        res = (
            supabase.table("scheduled_emails")
            .select("*")
            .eq("user_id", owner["id"])
            .order("created_at", desc=True)
            .execute()
        )
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/queue/{id}/retry")
async def retry_scheduled_email(id: str, owner: dict = Depends(require_owner)):
    """
    Resets failed outbox items back to pending status.
    """
    try:
        # Check job and verify ownership
        job_res = (
            supabase.table("scheduled_emails")
            .select("*")
            .eq("id", id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not job_res.data:
            raise HTTPException(status_code=404, detail="Scheduled email job not found")
        job = job_res.data[0]

        now_str = datetime.datetime.now(datetime.UTC).isoformat()

        # Reset scheduled email
        supabase.table("scheduled_emails").update(
            {
                "status": "pending",
                "attempts": 0,
                "last_error": None,
                "scheduled_for": now_str,
                "updated_at": now_str,
            }
        ).eq("id", id).execute()

        # Re-enable campaign lead
        supabase.table("campaign_leads").update(
            {
                "status": "scheduled",
                "next_step_scheduled_at": now_str,
                "last_error": None,
            }
        ).eq("campaign_id", job["campaign_id"]).eq("lead_id", job["lead_id"]).execute()

        return {"status": "success", "message": "Email job reset to pending."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/queue/{id}/cancel")
async def cancel_scheduled_email(id: str, owner: dict = Depends(require_owner)):
    """
    Cancels a scheduled or pending email.
    """
    try:
        # Check job and verify ownership
        job_res = (
            supabase.table("scheduled_emails")
            .select("*")
            .eq("id", id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not job_res.data:
            raise HTTPException(status_code=404, detail="Scheduled email job not found")

        supabase.table("scheduled_emails").update(
            {
                "status": "cancelled",
                "updated_at": datetime.datetime.now(datetime.UTC).isoformat(),
            }
        ).eq("id", id).execute()
        return {"status": "success", "message": "Scheduled email cancelled."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/worker-health")
async def get_sending_worker_health(owner: dict = Depends(require_owner)):
    """
    Returns worker heartbeat health diagnostics status metrics.
    """
    from app.services.durable_sending_worker import DurableSendingWorker

    return DurableSendingWorker.get_health_status()
