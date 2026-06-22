import time
import logging
from typing import List, Dict, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException, status
from app.database import supabase
from app.services.gmail_service import GmailService
from app.services.rate_limit_service import RateLimitService
from app.config import settings

logger = logging.getLogger("outreachops.routes.emails")

router = APIRouter(prefix="/emails", tags=["emails"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

gmail_service = GmailService()
rate_limit_service = RateLimitService()

def process_approved_queue(user_id: str):
    """
    Loops through the database approved queue, validates daily caps,
    respects campaign limits, delays, and filters, and dispatches via Gmail.
    Checks campaign status in real-time to allow pausing.
    """
    if not supabase:
        logger.error("Supabase client is offline. Approved queue aborted.")
        return

    # 1. Fetch active campaign parameters
    campaign = None
    daily_limit = 50
    delay_seconds = 5
    camp_type = "mixed"

    try:
        camp_res = supabase.table("campaigns").select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .limit(1) \
            .execute()
        if camp_res.data:
            campaign = camp_res.data[0]
            daily_limit = campaign.get("daily_send_limit", 50)
            delay_seconds = campaign.get("delay_seconds", 5)
            camp_type = campaign.get("campaign_type", "mixed")
            logger.info(f"Using campaign settings: '{campaign['name']}' (Limit: {daily_limit}, Delay: {delay_seconds}s, Type: {camp_type})")
        else:
            logger.info("No active campaign found. Running with default limits.")
    except Exception as e:
        logger.error(f"Failed to fetch active campaign details: {e}")

    # 2. Fetch approved drafts
    try:
        query = supabase.table("email_drafts").select("id, lead_id, email_type") \
            .eq("user_id", user_id) \
            .eq("status", "approved")
        
        # Apply campaign type boundaries if not mixed
        if camp_type != "mixed":
            query = query.eq("email_type", camp_type)
            
        res = query.execute()
        drafts = res.data or []
    except Exception as e:
        logger.error(f"Failed to fetch approved drafts from Supabase: {e}")
        return

    if not drafts:
        logger.info("No approved email drafts found matching campaign constraints in queue.")
        return

    logger.info(f"Starting batch dispatch of {len(drafts)} approved email drafts...")

    for idx, draft in enumerate(drafts):
        draft_id = draft["id"]
        lead_id = draft["lead_id"]

        # 3. Check Campaign Run Status (in real-time to support Pause triggers)
        if campaign:
            try:
                camp_check = supabase.table("campaigns").select("status").eq("id", campaign["id"]).execute()
                if not camp_check.data or camp_check.data[0]["status"] != "active":
                    logger.info(f"Campaign '{campaign['name']}' is no longer active. Halting background dispatches.")
                    break
            except Exception as e:
                logger.error(f"Failed to verify campaign run status: {e}")

        # 4. Check Daily Send Limit
        if not rate_limit_service.check_daily_limit(user_id=user_id, cap=daily_limit):
            logger.warning("Daily send limit cap hit. Stopping background queue dispatcher.")
            break

        # 5. Check Double Send Limit (no multiple emails to same lead in a single day)
        if not rate_limit_service.check_double_email_limit(lead_id=lead_id):
            logger.info(f"Skipping draft {draft_id}: Lead {lead_id} was already emailed today.")
            continue

        # 6. Send approved email via Gmail
        try:
            logger.info(f"Processing send for draft {draft_id}...")
            send_res = gmail_service.send_approved_email(draft_id=draft_id, user_id=user_id)
            logger.info(f"Send outcome for draft {draft_id}: {send_res}")
        except Exception as e:
            logger.error(f"Failed to dispatch draft {draft_id} inside background thread: {e}")

        # 7. Delay between emails
        if idx < len(drafts) - 1:
            logger.info(f"Sleeping for {delay_seconds} seconds between messages...")
            time.sleep(delay_seconds)

    logger.info("Finished processing approved queue batch.")

@router.post("/send-approved", status_code=status.HTTP_202_ACCEPTED)
async def trigger_send_approved_emails(background_tasks: BackgroundTasks):
    """
    Triggers the sending of all approved drafts in the database.
    Runs asynchronously in the background.
    """
    background_tasks.add_task(process_approved_queue, user_id=DEMO_USER_ID)
    return {"message": "Background mail dispatcher started."}

