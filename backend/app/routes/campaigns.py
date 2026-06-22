import logging
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field

from app.schemas.campaign import Campaign, CampaignCreate, CampaignUpdate
from app.crud.campaigns import get_campaigns, get_campaign, create_campaign, update_campaign, delete_campaign
from app.database import supabase

logger = logging.getLogger("outreachops.routes.campaigns")

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

@router.get("", response_model=List[Campaign])
async def read_campaigns():
    """
    Get all campaigns.
    """
    return get_campaigns(DEMO_USER_ID)

@router.get("/active", response_model=Optional[Campaign])
async def read_active_campaign():
    """
    Fetch the currently active campaign configuration.
    """
    if not supabase:
        return None
    try:
        res = supabase.table("campaigns") \
            .select("*") \
            .eq("user_id", DEMO_USER_ID) \
            .eq("status", "active") \
            .limit(1) \
            .execute()
        if res.data:
            return Campaign(**res.data[0])
        
        # Fallback: get any paused or default campaign if none is active
        res_any = supabase.table("campaigns") \
            .select("*") \
            .eq("user_id", DEMO_USER_ID) \
            .limit(1) \
            .execute()
        if res_any.data:
            return Campaign(**res_any.data[0])
            
        return None
    except Exception as e:
        logger.error(f"Error fetching active campaign: {e}")
        return None

@router.post("", response_model=Campaign)
async def create_campaign_endpoint(payload: CampaignCreate):
    """
    Create a new outreach campaign.
    """
    # Deactivate existing active campaigns to keep only one active
    if payload.status == "active" and supabase:
        try:
            supabase.table("campaigns") \
                .update({"status": "paused"}) \
                .eq("user_id", DEMO_USER_ID) \
                .eq("status", "active") \
                .execute()
        except Exception as e:
            logger.error(f"Failed to pause other campaigns on create: {e}")

    res = create_campaign(payload)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to create campaign")
    return Campaign(**res)

@router.patch("/{id}", response_model=Campaign)
async def update_campaign_endpoint(
    id: str = Path(..., description="Campaign UUID"),
    payload: CampaignUpdate = None
):
    """
    Update campaign operational settings.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required")
        
    # If activating this campaign, deactivate other campaigns
    if payload.status == "active" and supabase:
        try:
            supabase.table("campaigns") \
                .update({"status": "paused"}) \
                .eq("user_id", DEMO_USER_ID) \
                .eq("status", "active") \
                .neq("id", id) \
                .execute()
        except Exception as e:
            logger.error(f"Failed to pause other campaigns on update: {e}")

    res = update_campaign(id, payload)
    if not res:
        raise HTTPException(status_code=404, detail=f"Campaign '{id}' not found")
    return Campaign(**res)

@router.delete("/{id}")
async def delete_campaign_endpoint(id: str = Path(..., description="Campaign UUID")):
    """
    Delete a campaign.
    """
    success = delete_campaign(id)
    if not success:
        raise HTTPException(status_code=404, detail="Campaign not found or deletion failed")
    return {"message": "Campaign deleted successfully"}

@router.post("/{id}/pause", response_model=Campaign)
async def pause_campaign(id: str = Path(..., description="Campaign UUID")):
    """
    Pause campaign queue sends.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    try:
        res = supabase.table("campaigns").update({"status": "paused"}).eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return Campaign(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to pause campaign {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/resume", response_model=Campaign)
async def resume_campaign(id: str = Path(..., description="Campaign UUID")):
    """
    Resume campaign queue sends.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    try:
        # Pause all other active campaigns first
        supabase.table("campaigns") \
            .update({"status": "paused"}) \
            .eq("user_id", DEMO_USER_ID) \
            .eq("status", "active") \
            .neq("id", id) \
            .execute()
            
        res = supabase.table("campaigns").update({"status": "active"}).eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return Campaign(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to resume campaign {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
