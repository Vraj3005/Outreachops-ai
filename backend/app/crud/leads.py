import logging
from typing import List, Dict, Any, Optional
from app.database import supabase
from app.schemas.lead import LeadCreate, LeadUpdate

logger = logging.getLogger("outreachops.crud.leads")

def get_leads(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        res = supabase.table("leads").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(limit).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching leads: {e}")
        return []

def get_lead(lead_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("leads").select("*").eq("id", lead_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching lead {lead_id}: {e}")
        return None

def create_lead(lead_in: LeadCreate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = lead_in.model_dump()
        res = supabase.table("leads").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating lead: {e}")
        return None

def update_lead(lead_id: str, lead_in: LeadUpdate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = lead_in.model_dump(exclude_unset=True)
        res = supabase.table("leads").update(payload).eq("id", lead_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error updating lead {lead_id}: {e}")
        return None

def delete_lead(lead_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = supabase.table("leads").delete().eq("id", lead_id).execute()
        return len(res.data) > 0
    except Exception as e:
        logger.error(f"Error deleting lead {lead_id}: {e}")
        return False
