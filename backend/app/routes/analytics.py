import logging
from datetime import datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException

from app.database import supabase
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.analytics")

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary")
async def get_analytics_summary(owner: dict = Depends(require_owner)):
    """
    Get aggregated campaign performance stats.
    Returns: total_leads, total_drafts, pending_drafts, approved_drafts,
             sent_today, failed_today, website_emails_sent, erp_emails_sent,
             daily_limit, remaining_today, approval_rate, failure_rate.
    """
    stats = {
        "total_leads": 0,
        "total_drafts": 0,
        "pending_drafts": 0,
        "approved_drafts": 0,
        "sent_today": 0,
        "failed_today": 0,
        "website_emails_sent": 0,
        "erp_emails_sent": 0,
        "daily_limit": 50,
        "remaining_today": 50,
        "approval_rate": 0.0,
        "failure_rate": 0.0,
    }

    if not supabase:
        logger.warning("Database client is not initialized. Returning default metrics.")
        return stats

    try:
        # 1. Total Leads count
        leads_res = (
            supabase.table("leads")
            .select("id", count="exact")
            .eq("user_id", owner["id"])
            .execute()
        )
        stats["total_leads"] = (
            leads_res.count if leads_res.count is not None else len(leads_res.data)
        )

        # 2. Email drafts metrics
        drafts_res = (
            supabase.table("email_drafts")
            .select("status")
            .eq("user_id", owner["id"])
            .execute()
        )
        draft_list = drafts_res.data or []

        stats["total_drafts"] = len(draft_list)
        stats["pending_drafts"] = sum(
            1 for d in draft_list if d.get("status") == "draft"
        )
        stats["approved_drafts"] = sum(
            1 for d in draft_list if d.get("status") == "approved"
        )

        approved_and_sent = sum(
            1 for d in draft_list if d.get("status") in ["approved", "sent"]
        )
        stats["approval_rate"] = (
            round((approved_and_sent / len(draft_list)) * 100, 1) if draft_list else 0.0
        )

        # 3. Active Campaign limit
        daily_limit = 50
        camp_res = (
            supabase.table("campaigns")
            .select("daily_send_limit")
            .eq("user_id", owner["id"])
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if camp_res.data:
            daily_limit = camp_res.data[0].get("daily_send_limit", 50)
        stats["daily_limit"] = daily_limit

        # 4. Sent / Failed today
        today_start = datetime.combine(datetime.now().date(), time.min).isoformat()

        logs_res = (
            supabase.table("send_logs")
            .select("status, email_type, sent_at")
            .eq("user_id", owner["id"])
            .execute()
        )
        logs = logs_res.data or []

        sent_today = 0
        failed_today = 0
        website_emails_sent = 0
        erp_emails_sent = 0

        # All time dispatches for rates
        all_sent = 0
        all_failed = 0

        for log in logs:
            status_val = log.get("status")
            e_type = log.get("email_type")
            sent_at_str = log.get("sent_at")

            if status_val == "sent":
                all_sent += 1
                if e_type == "website":
                    website_emails_sent += 1
                elif e_type == "erp":
                    erp_emails_sent += 1
            elif status_val == "failed":
                all_failed += 1

            # Check if it was sent today
            if sent_at_str and sent_at_str >= today_start:
                if status_val == "sent":
                    sent_today += 1
                elif status_val == "failed":
                    failed_today += 1

        stats["sent_today"] = sent_today
        stats["failed_today"] = failed_today
        stats["website_emails_sent"] = website_emails_sent
        stats["erp_emails_sent"] = erp_emails_sent
        stats["remaining_today"] = max(0, daily_limit - sent_today)

        total_sends = all_sent + all_failed
        stats["failure_rate"] = (
            round((all_failed / total_sends) * 100, 1) if total_sends > 0 else 0.0
        )

    except Exception as e:
        logger.error(f"Error compiling analytics summary: {e}")

    return stats


@router.get("/sent-by-day")
async def get_sent_by_day(owner: dict = Depends(require_owner)):
    """
    Returns counts of sent emails grouped by day for the last 7 calendar days.
    """
    if not supabase:
        return []
    try:
        # Get past 7 days dates
        today = datetime.now().date()
        date_list = [today - timedelta(days=i) for i in range(6, -1, -1)]

        logs_res = (
            supabase.table("send_logs")
            .select("sent_at")
            .eq("user_id", owner["id"])
            .eq("status", "sent")
            .gte("sent_at", datetime.combine(date_list[0], time.min).isoformat())
            .execute()
        )

        sent_dates = []
        for log in logs_res.data or []:
            try:
                date_str = log["sent_at"].split("T")[0]
                sent_dates.append(date_str)
            except Exception:
                pass

        result = []
        for d in date_list:
            d_str = d.isoformat()
            count = sent_dates.count(d_str)
            # format as short weekday for charts (Mon, Tue...)
            result.append(
                {"date": d_str, "label": d.strftime("%a"), "sent_count": count}
            )

        return result
    except Exception as e:
        logger.error(f"Error compiling sent-by-day metrics: {e}")
        return []


@router.get("/failures")
async def get_failures_list(limit: int = 50, owner: dict = Depends(require_owner)):
    """
    Get list of failed send attempts.
    """
    if not supabase:
        return []
    try:
        # Fetch logs joined with leads
        res = (
            supabase.table("send_logs")
            .select("*, leads(company_name, website)")
            .eq("user_id", owner["id"])
            .eq("status", "failed")
            .order("sent_at", desc=True)
            .limit(limit)
            .execute()
        )

        failures = []
        for row in res.data or []:
            lead = row.get("leads") or {}
            failures.append(
                {
                    "id": row.get("id"),
                    "sent_at": row.get("sent_at"),
                    "recipient_email": row.get("recipient_email"),
                    "subject": row.get("subject"),
                    "email_type": row.get("email_type"),
                    "error_message": row.get("error_message")
                    or "Unknown connection timeout",
                    "company_name": lead.get("company_name")
                    or lead.get("website")
                    or "Prospect",
                }
            )
        return failures
    except Exception as e:
        logger.error(f"Error fetching failures: {e}")
        return []


@router.get("/quota")
async def get_quota_details(owner: dict = Depends(require_owner)):
    """
    Returns daily quota limits and Gmail remaining capacities.
    """
    summary = await get_analytics_summary(owner=owner)
    sent_today = summary.get("sent_today", 0)
    daily_limit = summary.get("daily_limit", 50)

    # Standard Gmail limit for free/trial accounts is 500 emails/day
    gmail_capacity = 500

    return {
        "daily_limit": daily_limit,
        "sent_today": sent_today,
        "remaining_today": max(0, daily_limit - sent_today),
        "gmail_capacity_remaining": max(0, gmail_capacity - sent_today),
    }


@router.get("/replies")
async def get_reply_events(owner: dict = Depends(require_owner)):
    """
    Returns list of all received reply events.
    """
    try:
        res = supabase.table("reply_events")\
            .select("*")\
            .eq("user_id", owner["id"])\
            .order("replied_at", desc=True)\
            .execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/replies/{id}/override")
async def override_reply_classification(
    id: str,
    payload: dict,
    owner: dict = Depends(require_owner)
):
    """
    Manually overrides the AI/rule classification category of a received email.
    """
    category = payload.get("category")
    if not category:
        raise HTTPException(status_code=400, detail="Category parameter is required")
    try:
        rep_res = supabase.table("reply_events").select("*").eq("id", id).execute()
        if not rep_res.data:
            raise HTTPException(status_code=404, detail="Reply event not found")
        rep = rep_res.data[0]

        supabase.table("reply_events").update({
            "category": category,
            "manual_override": 1,
            "rule_model_used": "manual_override"
        }).eq("id", id).execute()

        from app.services.reply_classification_service import ReplyClassificationService
        ReplyClassificationService._apply_sequence_stopping(
            user_id=owner["id"],
            campaign_id=rep["campaign_id"],
            lead_id=rep["lead_id"],
            category=category
        )

        return {"status": "success", "message": "Reply category overridden successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync-replies")
async def trigger_manual_reply_sync(owner: dict = Depends(require_owner)):
    """
    Triggers manual sync pull of Gmail inbox history events.
    """
    from app.services.rate_limit_service import RateLimitService
    limiter = RateLimitService()
    limit_key = f"rate_limit:sync_replies:{owner['id']}"
    if limiter.is_rate_limited(limit_key, max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=429,
            detail="Too many reply sync requests. Please try again later.",
        )

    from app.services.gmail_sync_service import GmailSyncService
    try:
        GmailSyncService.sync_user_replies(owner["id"])
        return {"status": "success", "message": "Gmail reply sync completed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funnel")
async def get_conversion_funnel(
    campaign_id: str = None,
    owner: dict = Depends(require_owner)
):
    """
    Returns conversion funnel stats.
    """
    from app.services.analytics_service import AnalyticsService
    return AnalyticsService.get_funnel_metrics(user_id=owner["id"], campaign_id=campaign_id)


@router.get("/experiments")
async def list_experiments(owner: dict = Depends(require_owner)):
    """
    Lists all experiments.
    """
    try:
        res = supabase.table("experiments").select("*").eq("user_id", owner["id"]).execute()
        return res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/experiments")
async def create_experiment(
    payload: dict,
    owner: dict = Depends(require_owner)
):
    """
    Creates a new A/B Experiment and its variants.
    """
    import uuid
    name = payload.get("name")
    campaign_id = payload.get("campaign_id")
    primary_metric = payload.get("primary_metric", "reply_rate")
    variants = payload.get("variants", []) # list of {"name": "A", "prompt_template_version_id": "v1", "weight": 0.5}

    if not name or not campaign_id or not variants:
        raise HTTPException(status_code=400, detail="Missing required parameters")

    try:
        exp_id = str(uuid.uuid4())
        
        # Insert experiment
        supabase.table("experiments").insert({
            "id": exp_id,
            "user_id": owner["id"],
            "name": name,
            "description": payload.get("description", ""),
            "status": "active"
        }).execute()

        # Insert variants
        for idx, var in enumerate(variants):
            supabase.table("experiment_variants").insert({
                "id": str(uuid.uuid4()),
                "experiment_id": exp_id,
                "campaign_id": campaign_id,
                "name": var["name"],
                "description": f"Variant {var['name']}",
                "weight": var.get("weight", 0.5),
                "prompt_template_version_id": var.get("prompt_template_version_id")
            }).execute()

        return {"status": "success", "experiment_id": exp_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/experiments/{id}")
async def get_experiment_details(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Returns detailed statistical analysis report for an experiment.
    """
    from app.services.analytics_service import AnalyticsService
    return AnalyticsService.get_experiment_report(user_id=owner["id"], experiment_id=id)


@router.post("/experiments/{id}/stop")
async def stop_experiment(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Completes and stops an active experiment.
    """
    try:
        supabase.table("experiments").update({
            "status": "completed"
        }).eq("id", id).execute()
        return {"status": "success", "message": "Experiment stopped successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
