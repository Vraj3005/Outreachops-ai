import logging
import os
from datetime import datetime, time

from app.config import settings
from app.database import supabase

logger = logging.getLogger("outreachops.services.ratelimit")


class RateLimitService:
    """
    Service to enforce daily campaign caps and prevent email double-sends on the same day.
    """

    def __init__(self):
        self.daily_send_limit = (
            int(os.getenv("DAILY_SEND_LIMIT", "50")) if "os" in globals() else 50
        )
        # Check settings limits as primary threshold values
        self.limit = getattr(settings, "DAILY_SEND_LIMIT", 50)

    def check_daily_limit(self, user_id: str, cap: int = None) -> bool:
        """
        Returns True if the user has sent fewer than the cap limit today, False otherwise.
        """
        if not supabase:
            return True

        max_emails = cap or self.limit

        # Calculate today's starting timestamp
        today_start = datetime.combine(datetime.now().date(), time.min).isoformat()

        try:
            res = (
                supabase.table("send_logs")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("status", "sent")
                .gte("sent_at", today_start)
                .execute()
            )

            sent_today = res.count if res.count is not None else len(res.data)
            logger.info(
                f"User {user_id} has sent {sent_today}/{max_emails} emails today."
            )

            return sent_today < max_emails
        except Exception as e:
            logger.error(f"Failed to check daily limits: {e}")
            return True

    def check_double_email_limit(self, lead_id: str) -> bool:
        """
        Returns True if no email has been sent to this lead today (preventing double outreach).
        """
        if not supabase:
            return True

        today_start = datetime.combine(datetime.now().date(), time.min).isoformat()

        try:
            res = (
                supabase.table("send_logs")
                .select("id", count="exact")
                .eq("lead_id", lead_id)
                .eq("status", "sent")
                .gte("sent_at", today_start)
                .execute()
            )

            sent_today = res.count if res.count is not None else len(res.data)

            # If we already sent an email to this lead today, return False (limit exceeded)
            return sent_today == 0
        except Exception as e:
            logger.error(
                f"Failed to check double outreach limits for lead {lead_id}: {e}"
            )
            return True
