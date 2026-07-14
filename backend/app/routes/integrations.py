import json
import logging

import gspread
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from google import genai
from google.oauth2.service_account import Credentials
from pydantic import BaseModel, Field

from app.config import settings
from app.database import supabase
from app.services.gemini_service import GeminiService
from app.services.gmail_service import GmailService
from app.services.sheets_service import SheetsService
from app.utils.auth import require_owner
from app.utils.crypto import decrypt_val, encrypt_val

logger = logging.getLogger("outreachops.routes.integrations")

router = APIRouter(prefix="/integrations", tags=["integrations"])

sheets_service = SheetsService()
gmail_service = GmailService()
gemini_service = GeminiService()


class SheetsConfigRequest(BaseModel):
    service_account_json: str = Field(
        ..., description="Service account credentials JSON string"
    )


class GeminiConfigRequest(BaseModel):
    api_key: str = Field(..., description="Gemini API Key")
    allowed_model: str = Field(
        "gemini-2.5-flash-lite", description="Allowed Gemini Model"
    )
    fallback_models: list[str] = Field(default_factory=lambda: ["gemini-2.5-flash"])


@router.get("/gmail/status")
async def get_gmail_status(owner: dict = Depends(require_owner)):
    """
    Verify Gmail OAuth connection status.
    Returns whether the session is connected, expired, or disconnected.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        return {
            "status": "connected" if settings.DEMO_SENDING_ENABLED else "disconnected",
            "details": "Demo mode active status.",
            "connected_account": "demo-owner@pitbull.com",
            "scopes": ["https://www.googleapis.com/auth/gmail.send"],
        }

    try:
        res = gmail_service.check_connection_status(user_id)
        if res["status"] == "connected":
            # Extract email if cached in database
            email = "Connected Owner Account"
            db_res = (
                supabase.table("integration_connections")
                .select("encrypted_credentials")
                .eq("user_id", user_id)
                .eq("provider", "gmail")
                .execute()
            )
            if db_res.data:
                try:
                    dec = decrypt_val(db_res.data[0]["encrypted_credentials"])
                    info = json.loads(dec)
                    email = info.get("email", "Connected Owner Account")
                except Exception:
                    pass
            return {
                "status": "connected",
                "details": "Active OAuth session initialized.",
                "connected_account": email,
                "scopes": ["https://www.googleapis.com/auth/gmail.send"],
            }
        return res
    except Exception as e:
        return {"status": "failed", "details": str(e)}


@router.post("/gmail/connect")
async def connect_gmail_account(request: Request, owner: dict = Depends(require_owner)):
    """
    Start Gmail OAuth connection flow by returning the Google authorization URL.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        return {"status": "success", "message": "Demo mode connection active."}

    redirect_uri = f"{settings.BACKEND_URL}/api/v1/integrations/oauth2callback"
    try:
        auth_url, state = gmail_service.get_authorization_url(user_id, redirect_uri)
        return {
            "status": "redirect",
            "url": auth_url,
            "message": "Redirect user to authorization URL.",
        }
    except Exception as e:
        logger.error(f"Failed to generate Google OAuth URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )


@router.get("/oauth2callback")
async def gmail_oauth_callback(code: str = None, state: str = None, error: str = None):
    """
    Handles Google OAuth redirect callback.
    Exchanges authorization code for tokens, caches them in database,
    and redirects the owner back to the frontend integration settings page.
    """
    frontend_redirect_url = settings.FRONTEND_URL.rstrip("/") + "/integrations"

    if error:
        logger.error(f"Gmail OAuth callback error: {error}")
        return RedirectResponse(url=f"{frontend_redirect_url}?error={error}")

    if not code or not state:
        logger.error("Gmail OAuth callback missing code or state parameters.")
        return RedirectResponse(url=f"{frontend_redirect_url}?error=missing_parameters")

    try:
        parts = state.split(":", 1)
        user_id = parts[0]
    except Exception as e:
        logger.error(f"Invalid state format in OAuth callback: {e}")
        return RedirectResponse(url=f"{frontend_redirect_url}?error=invalid_state")

    redirect_uri = f"{settings.BACKEND_URL}/api/v1/integrations/oauth2callback"
    try:
        res = gmail_service.exchange_callback_code(user_id, code, redirect_uri)
        if res.get("status") == "failed":
            error_msg = res.get("error", "OAuth exchange failed")
            return RedirectResponse(url=f"{frontend_redirect_url}?error={error_msg}")

        # Authenticate email and merge into DB
        try:
            client = gmail_service._get_gmail_client(user_id)
            profile = client.users().getProfile(userId="me").execute()
            email_addr = profile.get("emailAddress", "Connected Owner Account")

            # Merge email back into integration_connections credentials
            db_res = (
                supabase.table("integration_connections")
                .select("*")
                .eq("user_id", user_id)
                .eq("provider", "gmail")
                .execute()
            )
            if db_res.data:
                dec = decrypt_val(db_res.data[0]["encrypted_credentials"])
                info = json.loads(dec)
                info["email"] = email_addr
                encrypted = encrypt_val(json.dumps(info))
                supabase.table("integration_connections").update(
                    {"encrypted_credentials": encrypted}
                ).eq("id", db_res.data[0]["id"]).execute()
        except Exception as e:
            logger.warning(f"Could not retrieve Gmail profile details: {e}")

        return RedirectResponse(url=f"{frontend_redirect_url}?success=true")
    except Exception as e:
        logger.error(f"Failed to complete OAuth callback flow: {e}")
        return RedirectResponse(url=f"{frontend_redirect_url}?error={str(e)}")


@router.post("/gmail/disconnect")
async def disconnect_gmail_account(owner: dict = Depends(require_owner)):
    """
    Disconnect Gmail integration.
    """
    if settings.DEMO_MODE:
        return {"status": "success", "message": "Demo mode connection cleared."}
    return gmail_service.revoke_connection(owner["id"])


@router.get("/sheets/status")
async def get_sheets_status(owner: dict = Depends(require_owner)):
    """
    Verify Google Sheets connection status and retrieve available sheets.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        return {
            "status": "connected",
            "details": "Demo Mode active. Simulated sheets data.",
            "available_spreadsheets": [
                settings.GOOGLE_SHEET_NAME,
                "Demo Campaign Sheets",
                "Sales Leads 2026",
            ],
        }

    try:
        client = sheets_service._get_client(user_id)
        # Fetch spreadsheet files
        files = client.list_spreadsheet_files()
        spreadsheets = [f["name"] for f in files[:10]]
        return {
            "status": "connected",
            "details": "Active session initialized.",
            "available_spreadsheets": spreadsheets,
        }
    except Exception as e:
        return {
            "status": "unconfigured",
            "details": f"Connection check failed: {e}",
            "available_spreadsheets": [],
        }


@router.post("/sheets/config")
async def configure_google_sheets(
    payload: SheetsConfigRequest, owner: dict = Depends(require_owner)
):
    """
    Saves Service Account JSON credentials encrypted.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        return {"status": "success", "message": "Demo mode configuration bypass."}

    try:
        # Validate json format
        info = json.loads(payload.service_account_json)
        # Test connection immediately
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds = Credentials.from_service_account_info(info, scopes=scopes)
        gspread.authorize(creds)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid service account key JSON or authentication test failed: {e}",
        )

    # Store encrypted credentials
    try:
        encrypted = encrypt_val(payload.service_account_json)
        db_payload = {
            "user_id": user_id,
            "provider": "google_sheets",
            "connection_status": "connected",
            "encrypted_credentials": encrypted,
        }

        # Check existing connection record
        res = (
            supabase.table("integration_connections")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", "google_sheets")
            .execute()
        )
        if res.data:
            supabase.table("integration_connections").update(db_payload).eq(
                "id", res.data[0]["id"]
            ).execute()
        else:
            import uuid

            db_payload["id"] = str(uuid.uuid4())
            supabase.table("integration_connections").insert(db_payload).execute()

        return {
            "status": "success",
            "message": "Google Sheets service account configured successfully.",
        }
    except Exception as e:
        logger.error(f"Error configuring sheets credentials: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failure: {e}",
        )


@router.post("/sheets/disconnect")
async def disconnect_google_sheets(owner: dict = Depends(require_owner)):
    """
    Disconnect Google Sheets connection.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        return {"status": "success", "message": "Demo mode connection cleared."}
    try:
        supabase.table("integration_connections").delete().eq("user_id", user_id).eq(
            "provider", "google_sheets"
        ).execute()
        return {
            "status": "success",
            "message": "Google Sheets connection disconnected.",
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear sheets configuration: {e}",
        )


@router.get("/gemini/status")
async def get_gemini_status(owner: dict = Depends(require_owner)):
    """
    Verify Gemini API availability and returns models fallback list.
    """
    user_id = owner["id"]
    if settings.DEMO_MODE:
        # Load from DB if present
        cfg = gemini_service._get_db_config(user_id)
        return {
            "status": "connected",
            "details": "Active session initialized.",
            "allowed_model": cfg.get("allowed_model", "gemini-2.5-flash-lite"),
            "fallback_models": cfg.get("fallback_models", ["gemini-2.5-flash"]),
        }

    try:
        cfg = gemini_service._get_db_config(user_id)
        # Try listing models to confirm connectivity
        client = gemini_service._get_client(user_id)
        client.models.list()

        return {
            "status": "connected",
            "details": "Active session initialized.",
            "allowed_model": cfg.get("allowed_model", "gemini-2.5-flash-lite"),
            "fallback_models": cfg.get("fallback_models", ["gemini-2.5-flash"]),
        }
    except Exception as e:
        return {
            "status": "unconfigured",
            "details": f"Connection check failed: {e}",
            "allowed_model": "gemini-2.5-flash-lite",
            "fallback_models": ["gemini-2.5-flash"],
        }


@router.post("/gemini/config")
async def configure_gemini(
    payload: GeminiConfigRequest, owner: dict = Depends(require_owner)
):
    """
    Saves Gemini API custom key and model settings encrypted.
    """
    user_id = owner["id"]

    # Test connection immediately
    try:
        client = genai.Client(api_key=payload.api_key)
        client.models.list()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gemini connection test failed: {e}",
        )

    try:
        creds_info = {
            "api_key": payload.api_key,
            "allowed_model": payload.allowed_model,
            "fallback_models": payload.fallback_models,
        }
        encrypted = encrypt_val(json.dumps(creds_info))

        db_payload = {
            "user_id": user_id,
            "provider": "gemini",
            "connection_status": "connected",
            "encrypted_credentials": encrypted,
        }

        # Check existing connection record
        res = (
            supabase.table("integration_connections")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", "gemini")
            .execute()
        )
        if res.data:
            supabase.table("integration_connections").update(db_payload).eq(
                "id", res.data[0]["id"]
            ).execute()
        else:
            import uuid

            db_payload["id"] = str(uuid.uuid4())
            supabase.table("integration_connections").insert(db_payload).execute()

        return {
            "status": "success",
            "message": "Gemini connection settings saved successfully.",
        }
    except Exception as e:
        logger.error(f"Error configuring Gemini connection: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Database update failure: {e}",
        )


@router.post("/gemini/disconnect")
async def disconnect_gemini(owner: dict = Depends(require_owner)):
    """
    Disconnect Gemini connection.
    """
    user_id = owner["id"]
    try:
        supabase.table("integration_connections").delete().eq("user_id", user_id).eq(
            "provider", "gemini"
        ).execute()
        return {"status": "success", "message": "Gemini connection disconnected."}
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear Gemini configuration: {e}",
        )
