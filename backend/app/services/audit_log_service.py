import logging
import uuid
import datetime
from typing import Any, Optional
from fastapi import Request

from app.database import supabase

logger = logging.getLogger("outreachops.services.audit_log")


class AuditLogService:
    @staticmethod
    def log_event(
        user_id: str,
        action: str,
        details: Optional[str] = None,
        request: Optional[Request] = None
    ) -> bool:
        """
        Persists security-relevant events to the audit trail database.
        """
        if not supabase:
            logger.warning("Supabase client is not available; cannot record audit log.")
            return False

        ip_address = None
        if request and request.client:
            ip_address = request.client.host

        payload = {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "action": action,
            "details": details,
            "ip_address": ip_address,
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat()
        }

        try:
            supabase.table("security_audit_logs").insert(payload).execute()
            logger.info(f"Audit log recorded: {action} (User: {user_id})")
            return True
        except Exception as e:
            logger.error(f"Failed to write security audit log event: {e}")
            return False
