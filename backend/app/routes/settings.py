import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.config import settings
from app.database import supabase
from app.schemas.settings import OwnerSettingsResponse, OwnerSettingsUpdate
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.settings")

router = APIRouter(prefix="/settings", tags=["settings"])


def get_default_owner_settings(owner_id: str) -> dict[str, Any]:
    return {
        "owner_id": owner_id,
        "business_name": settings.YOUR_AGENCY_NAME,
        "website": settings.YOUR_WEBSITE,
        "sender_name": settings.YOUR_NAME,
        "sender_email": settings.OWNER_EMAIL,
        "sender_phone": settings.YOUR_PHONE,
        "default_signature": f"Best regards,\n{settings.YOUR_NAME}\n{settings.YOUR_AGENCY_NAME}",
        "brand_voice": "Professional, direct, and outcome-oriented.",
        "offer_description": "Customized B2B systems integration.",
        "default_target_audience": "B2B service businesses and agencies",
        "default_tone": "professional",
        "default_cta": "Are you available for a brief call next Tuesday?",
        "default_language": "en",
        "timezone": "UTC",
        "daily_send_limit": 50,
        "minimum_send_spacing_seconds": 60,
        "allowed_send_start": "09:00",
        "allowed_send_end": "17:00",
        "required_footer": "To opt-out, please reply to this email requesting removal.",
        "banned_phrases": [],
        "generation_worker_paused": False,
        "sending_worker_paused": False,
        "queue_drain_enabled": False,
    }


def get_owner_settings_sync(owner_id: str) -> dict[str, Any]:
    try:
        res = (
            supabase.table("owner_settings")
            .select("*")
            .eq("owner_id", owner_id)
            .execute()
        )
        if res.data and len(res.data) > 0:
            row = res.data[0]
            if isinstance(row.get("banned_phrases"), str):
                try:
                    row["banned_phrases"] = json.loads(row["banned_phrases"])
                except Exception:
                    row["banned_phrases"] = []
            return row
    except Exception as e:
        logger.warning(f"Error fetching owner settings sync: {e}")
    return get_default_owner_settings(owner_id)


@router.get("", response_model=OwnerSettingsResponse)
async def get_settings(owner: dict = Depends(require_owner)):
    """
    Retrieve stored owner settings configuration, fallback to defaults if not created.
    """
    owner_id = owner["id"]
    try:
        res = (
            supabase.table("owner_settings")
            .select("*")
            .eq("owner_id", owner_id)
            .execute()
        )
        if res.data and len(res.data) > 0:
            row = res.data[0]
            # Convert banned_phrases from string representation if SQLite
            if isinstance(row.get("banned_phrases"), str):
                try:
                    row["banned_phrases"] = json.loads(row["banned_phrases"])
                except Exception:
                    row["banned_phrases"] = []
            return row

        # Auto-create settings record with defaults
        defaults = get_default_owner_settings(owner_id)

        # Format banned_phrases for SQLite
        db_payload = dict(defaults)
        if not hasattr(supabase, "table_name"):  # SQLite client check
            db_payload["banned_phrases"] = json.dumps(defaults["banned_phrases"])

        supabase.table("owner_settings").insert(db_payload).execute()
        return defaults

    except Exception as e:
        logger.error(f"Error fetching owner settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error retrieving owner settings",
        )


@router.patch("", response_model=OwnerSettingsResponse)
async def update_settings(
    payload: OwnerSettingsUpdate, owner: dict = Depends(require_owner)
):
    """
    Update owner settings configuration.
    """
    owner_id = owner["id"]
    try:
        # Check if record exists
        res = (
            supabase.table("owner_settings")
            .select("*")
            .eq("owner_id", owner_id)
            .execute()
        )
        if not res.data:
            # Auto-create defaults first
            defaults = get_default_owner_settings(owner_id)
            db_defaults = dict(defaults)
            if not hasattr(supabase, "table_name"):
                db_defaults["banned_phrases"] = json.dumps(defaults["banned_phrases"])
            supabase.table("owner_settings").insert(db_defaults).execute()

        # Update fields
        update_data = payload.model_dump(exclude_unset=True)

        # Serialize list fields for SQLite compatibility
        if not hasattr(supabase, "table_name") and "banned_phrases" in update_data:
            update_data["banned_phrases"] = json.dumps(update_data["banned_phrases"])

        res_update = (
            supabase.table("owner_settings")
            .update(update_data)
            .eq("owner_id", owner_id)
            .execute()
        )

        if res_update.data and len(res_update.data) > 0:
            updated_row = res_update.data[0]
            if isinstance(updated_row.get("banned_phrases"), str):
                try:
                    updated_row["banned_phrases"] = json.loads(
                        updated_row["banned_phrases"]
                    )
                except Exception:
                    updated_row["banned_phrases"] = []
            return updated_row

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Owner settings record not found to update",
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating owner settings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating owner settings",
        )
