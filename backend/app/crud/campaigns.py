import logging
from typing import List, Dict, Any, Optional
from app.database import supabase
from app.schemas.campaign import CampaignCreate, CampaignUpdate

logger = logging.getLogger("outreachops.crud.campaigns")

def get_campaigns(user_id: str) -> List[Dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        res = supabase.table("campaigns").select("*").eq("user_id", user_id).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching campaigns: {e}")
        return []

def get_campaign(campaign_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching campaign {campaign_id}: {e}")
        return None

def create_campaign(campaign_in: CampaignCreate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = campaign_in.model_dump()
        res = supabase.table("campaigns").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        return None

def update_campaign(campaign_id: str, campaign_in: CampaignUpdate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = campaign_in.model_dump(exclude_unset=True)
        res = supabase.table("campaigns").update(payload).eq("id", campaign_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error updating campaign {campaign_id}: {e}")
        return None

def delete_campaign(campaign_id: str) -> bool:
    if not supabase:
        return False
    try:
        res = supabase.table("campaigns").delete().eq("id", campaign_id).execute()
        return len(res.data) > 0
    except Exception as e:
        logger.error(f"Error deleting campaign {campaign_id}: {e}")
        return False
