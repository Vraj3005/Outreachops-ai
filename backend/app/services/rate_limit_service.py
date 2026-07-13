import logging
import os
import datetime
from typing import Any

from app.config import settings
from app.database import supabase

logger = logging.getLogger("outreachops.services.ratelimit")


class RateLimitService:
    """
    Service to enforce daily campaign caps, double-send prevention, and generic endpoint rate limits.
    Implements a Redis-based rate limiter with a local/Supabase database fallback and a fail-closed policy.
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
        today_start = datetime.datetime.combine(datetime.datetime.now().date(), datetime.time.min).isoformat()

        try:
            res = (
                supabase.table("send_events")
                .select("id", count="exact")
                .eq("user_id", user_id)
                .eq("event_type", "sent")
                .gte("occurred_at", today_start)
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

        today_start = datetime.datetime.combine(datetime.datetime.now().date(), datetime.time.min).isoformat()

        try:
            res = (
                supabase.table("send_events")
                .select("id", count="exact")
                .eq("lead_id", lead_id)
                .eq("event_type", "sent")
                .gte("occurred_at", today_start)
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

    def is_rate_limited(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Generic rate limiter using Redis (if configured) with DB-backed fallback.
        In production, if database and redis both fail, it fails closed (returns True, representing rate limited).
        """
        # 1. Attempt Redis if configured
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                import redis
                r = redis.Redis.from_url(redis_url, socket_timeout=2)
                current = r.incr(key)
                if current == 1:
                    r.expire(key, window_seconds)
                if current > max_requests:
                    return True
                return False
            except Exception as ree:
                logger.error(f"Redis rate limiting failed: {ree}")
                # Fallback to DB check

        # 2. Database Fallback (Supabase / SQLite)
        if not supabase:
            return settings.ENV.lower() == "production"

        now = datetime.datetime.now(datetime.UTC)
        now_str = now.isoformat()

        try:
            # A. Clean up expired keys
            supabase.table("rate_limits").delete().lt("expires_at", now_str).execute()

            # B. Check if key exists
            res = supabase.table("rate_limits").select("*").eq("key", key).execute()
            if res.data:
                row = res.data[0]
                val = int(row["value"])
                if val >= max_requests:
                    if row["expires_at"] < now_str:
                        # Reset expired key
                        expires_at = (now + datetime.timedelta(seconds=window_seconds)).isoformat()
                        supabase.table("rate_limits").update({
                            "value": 1,
                            "expires_at": expires_at
                        }).eq("id", row["id"]).execute()
                        return False
                    return True
                else:
                    supabase.table("rate_limits").update({
                        "value": val + 1
                    }).eq("id", row["id"]).execute()
                    return False
            else:
                expires_at = (now + datetime.timedelta(seconds=window_seconds)).isoformat()
                import uuid
                payload = {
                    "id": str(uuid.uuid4()),
                    "key": key,
                    "value": 1,
                    "expires_at": expires_at
                }
                supabase.table("rate_limits").insert(payload).execute()
                return False
        except Exception as e:
            logger.error(f"Fallback DB rate limiting exception: {e}")
            if settings.ENV.lower() == "production":
                return True
            return False
