import logging
from typing import Any

from app.database import supabase
from app.schemas.log import ErrorLogCreate, SendLogCreate

logger = logging.getLogger("outreachops.crud.logs")


def get_send_logs(user_id: str, limit: int = 100) -> list[dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        res = (
            supabase.table("send_logs")
            .select("*")
            .eq("user_id", user_id)
            .order("sent_at", desc=True)
            .limit(limit)
            .execute()
        )
        return res.data
    except Exception as e:
        logger.error(f"Error fetching send logs: {e}")
        return []


def create_send_log(log_in: SendLogCreate) -> dict[str, Any] | None:
    if not supabase:
        return None
    try:
        payload = log_in.model_dump()
        res = supabase.table("send_logs").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating send log: {e}")
        return None


def get_error_logs(
    user_id: str | None = None, limit: int = 100
) -> list[dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        query = supabase.table("error_logs").select("*")
        if user_id:
            query = query.eq("user_id", user_id)
        res = query.order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching error logs: {e}")
        return []


def create_error_log(log_in: ErrorLogCreate) -> dict[str, Any] | None:
    if not supabase:
        return None
    try:
        payload = log_in.model_dump()
        res = supabase.table("error_logs").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating error log: {e}")
        return None
