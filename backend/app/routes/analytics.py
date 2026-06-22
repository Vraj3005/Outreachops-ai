import logging
from datetime import datetime, time, timedelta
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from app.database import supabase
from app.config import settings

logger = logging.getLogger("outreachops.routes.analytics")

router = APIRouter(prefix="/analytics", tags=["analytics"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

@router.get("/summary")
async def get_analytics_summary():
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
        "failure_rate": 0.0
    }
    
    if not supabase:
        logger.warning("Database client is not initialized. Returning default metrics.")
        return stats

    try:
        # 1. Total Leads count
        leads_res = supabase.table("leads").select("id", count="exact").eq("user_id", DEMO_USER_ID).execute()
        stats["total_leads"] = leads_res.count if leads_res.count is not None else len(leads_res.data)

        # 2. Email drafts metrics
        drafts_res = supabase.table("email_drafts").select("status").eq("user_id", DEMO_USER_ID).execute()
        draft_list = drafts_res.data or []
        
        stats["total_drafts"] = len(draft_list)
        stats["pending_drafts"] = sum(1 for d in draft_list if d.get("status") == "draft")
        stats["approved_drafts"] = sum(1 for d in draft_list if d.get("status") == "approved")
        
        approved_and_sent = sum(1 for d in draft_list if d.get("status") in ["approved", "sent"])
        stats["approval_rate"] = round((approved_and_sent / len(draft_list)) * 100, 1) if draft_list else 0.0

        # 3. Active Campaign limit
        daily_limit = 50
        camp_res = supabase.table("campaigns").select("daily_send_limit").eq("user_id", DEMO_USER_ID).eq("status", "active").limit(1).execute()
        if camp_res.data:
            daily_limit = camp_res.data[0].get("daily_send_limit", 50)
        stats["daily_limit"] = daily_limit

        # 4. Sent / Failed today
        today_start = datetime.combine(datetime.now().date(), time.min).isoformat()
        
        logs_res = supabase.table("send_logs").select("status, email_type, sent_at").eq("user_id", DEMO_USER_ID).execute()
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
        stats["failure_rate"] = round((all_failed / total_sends) * 100, 1) if total_sends > 0 else 0.0

    except Exception as e:
        logger.error(f"Error compiling analytics summary: {e}")
        
    return stats

@router.get("/sent-by-day")
async def get_sent_by_day():
    """
    Returns counts of sent emails grouped by day for the last 7 calendar days.
    """
    if not supabase:
        return []
    try:
        # Get past 7 days dates
        today = datetime.now().date()
        date_list = [today - timedelta(days=i) for i in range(6, -1, -1)]
        
        logs_res = supabase.table("send_logs").select("sent_at") \
            .eq("user_id", DEMO_USER_ID) \
            .eq("status", "sent") \
            .gte("sent_at", datetime.combine(date_list[0], time.min).isoformat()) \
            .execute()
        
        sent_dates = []
        for log in (logs_res.data or []):
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
            result.append({
                "date": d_str,
                "label": d.strftime("%a"),
                "sent_count": count
            })
            
        return result
    except Exception as e:
        logger.error(f"Error compiling sent-by-day metrics: {e}")
        return []

@router.get("/failures")
async def get_failures_list(limit: int = 50):
    """
    Get list of failed send attempts.
    """
    if not supabase:
        return []
    try:
        # Fetch logs joined with leads
        res = supabase.table("send_logs") \
            .select("*, leads(company_name, website)") \
            .eq("user_id", DEMO_USER_ID) \
            .eq("status", "failed") \
            .order("sent_at", desc=True) \
            .limit(limit) \
            .execute()
            
        failures = []
        for row in (res.data or []):
            lead = row.get("leads") or {}
            failures.append({
                "id": row.get("id"),
                "sent_at": row.get("sent_at"),
                "recipient_email": row.get("recipient_email"),
                "subject": row.get("subject"),
                "email_type": row.get("email_type"),
                "error_message": row.get("error_message") or "Unknown connection timeout",
                "company_name": lead.get("company_name") or lead.get("website") or "Prospect"
            })
        return failures
    except Exception as e:
        logger.error(f"Error fetching failures: {e}")
        return []

@router.get("/quota")
async def get_quota_details():
    """
    Returns daily quota limits and Gmail remaining capacities.
    """
    summary = await get_analytics_summary()
    sent_today = summary.get("sent_today", 0)
    daily_limit = summary.get("daily_limit", 50)
    
    # Standard Gmail limit for free/trial accounts is 500 emails/day
    gmail_capacity = 500
    
    return {
        "daily_limit": daily_limit,
        "sent_today": sent_today,
        "remaining_today": max(0, daily_limit - sent_today),
        "gmail_capacity_remaining": max(0, gmail_capacity - sent_today)
    }
