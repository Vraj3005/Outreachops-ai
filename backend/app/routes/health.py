from fastapi import APIRouter
from app.config import settings
from app.database import supabase

router = APIRouter(prefix="/health", tags=["health"])

@router.get("")
async def health_check():
    """
    Diagnostic dashboard check verifying API runtime and Supabase connection states.
    """
    db_status = "unconfigured"
    db_details = None

    if supabase:
        try:
            # Run simple query to check connection
            res = supabase.table("users").select("count", count="exact").limit(0).execute()
            db_status = "connected"
            db_details = f"Successful ping. Table count retrieved."
        except Exception as e:
            db_status = "failed"
            db_details = str(e)
            
    return {
        "status": "healthy",
        "app": "OutreachOps AI API",
        "version": "1.0.0",
        "database": {
            "status": db_status,
            "details": db_details
        },
        "branding": {
            "agency": settings.YOUR_AGENCY_NAME,
            "website": settings.YOUR_WEBSITE
        }
    }
