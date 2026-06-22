import logging
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.database import supabase
from app.schemas.do_not_contact import DNC, DNCCreate

logger = logging.getLogger("outreachops.routes.do_not_contact")

router = APIRouter(prefix="/do-not-contact", tags=["do-not-contact"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

class DNCSaveRequest(BaseModel):
    email: str = Field(..., description="Email to add to do-not-contact list")
    reason: Optional[str] = Field(None, description="Reason for exclusion")

@router.get("", response_model=List[DNC])
async def read_dnc_list():
    """
    Get list of all do-not-contact emails.
    """
    if not supabase:
        return []
    try:
        res = supabase.table("do_not_contact").select("*").eq("user_id", DEMO_USER_ID).execute()
        return res.data or []
    except Exception as e:
        logger.error(f"Error fetching DNC list: {e}")
        return []

@router.post("", response_model=DNC)
async def add_to_dnc_list(payload: DNCSaveRequest):
    """
    Add email to do-not-contact list.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    
    email_clean = payload.email.strip().lower()
    
    # Check if already exists
    try:
        existing = supabase.table("do_not_contact") \
            .select("*") \
            .eq("user_id", DEMO_USER_ID) \
            .eq("email", email_clean) \
            .execute()
        if existing.data:
            return DNC(**existing.data[0])
    except Exception as e:
        logger.error(f"Error checking existing DNC: {e}")

    try:
        insert_payload = {
            "user_id": DEMO_USER_ID,
            "email": email_clean,
            "reason": payload.reason or "Manual exclusion"
        }
        res = supabase.table("do_not_contact").insert(insert_payload).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to add email to do-not-contact list")
        return DNC(**res.data[0])
    except Exception as e:
        logger.error(f"Error adding to DNC list: {e}")
        raise HTTPException(status_code=500, detail=str(e))
