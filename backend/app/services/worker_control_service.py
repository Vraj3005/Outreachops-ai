import logging
from typing import Any, Dict

from app.database import supabase
from app.routes.settings import get_owner_settings_sync

logger = logging.getLogger("outreachops.services.worker_control")


class WorkerControlService:
    """
    Centralized controller managing worker pause/resume and queue draining states.
    Reads from owner_settings to support persistent operational states.
    """

    @classmethod
    def get_controls(cls, user_id: str) -> Dict[str, bool]:
        """
        Retrieves the current worker controls.
        """
        try:
            settings = get_owner_settings_sync(user_id)
            return {
                "generation_worker_paused": bool(settings.get("generation_worker_paused", False)),
                "sending_worker_paused": bool(settings.get("sending_worker_paused", False)),
                "queue_drain_enabled": bool(settings.get("queue_drain_enabled", False)),
            }
        except Exception as e:
            logger.error(f"Failed to fetch worker controls for {user_id}: {e}")
            return {
                "generation_worker_paused": False,
                "sending_worker_paused": False,
                "queue_drain_enabled": False,
            }

    @classmethod
    def is_generation_worker_paused(cls, user_id: str) -> bool:
        return cls.get_controls(user_id)["generation_worker_paused"]

    @classmethod
    def is_sending_worker_paused(cls, user_id: str) -> bool:
        return cls.get_controls(user_id)["sending_worker_paused"]

    @classmethod
    def is_queue_drain_enabled(cls, user_id: str) -> bool:
        return cls.get_controls(user_id)["queue_drain_enabled"]

    @classmethod
    def update_controls(
        cls,
        user_id: str,
        generation_worker_paused: bool | None = None,
        sending_worker_paused: bool | None = None,
        queue_drain_enabled: bool | None = None,
    ) -> Dict[str, Any]:
        """
        Updates worker control flags in the database.
        """
        payload: Dict[str, Any] = {}
        if generation_worker_paused is not None:
            payload["generation_worker_paused"] = 1 if generation_worker_paused else 0
        if sending_worker_paused is not None:
            payload["sending_worker_paused"] = 1 if sending_worker_paused else 0
        if queue_drain_enabled is not None:
            payload["queue_drain_enabled"] = 1 if queue_drain_enabled else 0

        if not payload:
            return cls.get_controls(user_id)

        try:
            # Check if settings record exists first
            res = (
                supabase.table("owner_settings")
                .select("*")
                .eq("owner_id", user_id)
                .execute()
            )
            
            if res.data:
                # Update
                supabase.table("owner_settings").update(payload).eq("owner_id", user_id).execute()
            else:
                # Insert defaults plus updates
                from app.routes.settings import get_default_owner_settings
                full_payload = get_default_owner_settings(user_id)
                for k, v in payload.items():
                    full_payload[k] = v
                # SQLite serialization compat check
                if not hasattr(supabase, "table_name") and "banned_phrases" in full_payload:
                    import json
                    full_payload["banned_phrases"] = json.dumps(full_payload["banned_phrases"])
                supabase.table("owner_settings").insert(full_payload).execute()

            logger.info(f"Updated worker controls for {user_id}: {payload}")
            return cls.get_controls(user_id)
        except Exception as e:
            logger.error(f"Failed to update worker controls for {user_id}: {e}")
            raise e
