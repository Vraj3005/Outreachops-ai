from fastapi import APIRouter, status, HTTPException
from app.services.sheets_service import SheetsService
from app.services.gmail_service import GmailService
from app.config import settings

router = APIRouter(prefix="/integrations", tags=["integrations"])

# Default mock user ID matching seed.sql
DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

sheets_service = SheetsService()
gmail_service = GmailService()

@router.post("/sheets/import", status_code=status.HTTP_200_OK)
async def import_google_sheets_leads():
    """
    Import leads from the configured Google Sheet main tab.
    Saves new records in Supabase and filters out duplicates.
    """
    res = sheets_service.import_leads(user_id=DEMO_USER_ID)
    return res

@router.get("/sheets/status")
async def get_sheets_status():
    """
    Verify Google Sheets connection status.
    """
    import os
    try:
        if settings.DEMO_MODE:
            return {"status": "connected", "details": "Demo Mode active. Simulated sheets data."}
        if not sheets_service.creds_path or not os.path.exists(sheets_service.creds_path):
            return {"status": "unconfigured", "details": "Google Sheets credentials file is missing."}
        sheets_service._get_client()
        return {"status": "connected", "details": "Active session initialized."}
    except Exception as e:
        return {"status": "failed", "details": str(e)}

@router.get("/gmail/status")
async def get_gmail_status():
    """
    Verify Gmail OAuth connection status.
    Returns whether the session is connected, expired, or disconnected.
    """
    res = gmail_service.check_connection_status()
    return res

@router.post("/gmail/connect")
async def connect_gmail_account():
    """
    Start Gmail OAuth connection flow.
    Launches authentication server locally and caches credentials.
    """
    res = gmail_service.run_oauth_flow()
    if res.get("status") == "failed":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"OAuth connection failed: {res.get('error')}"
        )
    return res

@router.get("/gemini/status")
async def get_gemini_status():
    """
    Verify Gemini API availability.
    """
    if settings.DEMO_MODE and not settings.GEMINI_API_KEY:
        return {"status": "connected", "details": "Demo Mode active. Simulated Gemini content."}
    if not settings.GEMINI_API_KEY:
        return {"status": "unconfigured", "details": "Gemini API key is missing."}
    return {"status": "connected", "details": f"Model: {settings.gemini_models[0]}"}
