import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path

from app.crud.campaigns import (
    create_campaign,
    delete_campaign,
    get_campaigns,
    update_campaign,
)
from app.database import supabase
from app.schemas.campaign import Campaign, CampaignBase, CampaignCreate, CampaignUpdate
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.campaigns")

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


@router.get("", response_model=list[Campaign])
async def read_campaigns(owner: dict = Depends(require_owner)):
    """
    Get all campaigns.
    """
    return get_campaigns(owner["id"])


@router.get("/active", response_model=Optional[Campaign])
async def read_active_campaign(owner: dict = Depends(require_owner)):
    """
    Fetch the currently active campaign configuration.
    """
    if not supabase:
        return None
    try:
        res = (
            supabase.table("campaigns")
            .select("*")
            .eq("user_id", owner["id"])
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if res.data:
            return Campaign(**res.data[0])

        # Fallback: get any paused or default campaign if none is active
        res_any = (
            supabase.table("campaigns")
            .select("*")
            .eq("user_id", owner["id"])
            .limit(1)
            .execute()
        )
        if res_any.data:
            return Campaign(**res_any.data[0])

        return None
    except Exception as e:
        logger.error(f"Error fetching active campaign: {e}")
        return None


@router.post("", response_model=Campaign)
async def create_campaign_endpoint(
    payload_in: CampaignBase, owner: dict = Depends(require_owner)
):
    """
    Create a new outreach campaign.
    """
    payload = CampaignCreate(**payload_in.model_dump(), user_id=owner["id"])
    # Deactivate existing active campaigns to keep only one active
    if payload.status == "active" and supabase:
        try:
            supabase.table("campaigns").update({"status": "paused"}).eq(
                "user_id", owner["id"]
            ).eq("status", "active").execute()
        except Exception as e:
            logger.error(f"Failed to pause other campaigns on create: {e}")

    res = create_campaign(payload)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to create campaign")
    return Campaign(**res)


@router.patch("/{id}", response_model=Campaign)
async def update_campaign_endpoint(
    id: str = Path(..., description="Campaign UUID"),
    payload: CampaignUpdate = None,
    owner: dict = Depends(require_owner),
):
    """
    Update campaign operational settings.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required")

    # If activating this campaign, deactivate other campaigns
    if payload.status == "active" and supabase:
        try:
            supabase.table("campaigns").update({"status": "paused"}).eq(
                "user_id", owner["id"]
            ).eq("status", "active").neq("id", id).execute()
        except Exception as e:
            logger.error(f"Failed to pause other campaigns on update: {e}")

    res = update_campaign(id, payload)
    if not res:
        raise HTTPException(status_code=404, detail=f"Campaign '{id}' not found")
    return Campaign(**res)


@router.delete("/{id}")
async def delete_campaign_endpoint(
    id: str = Path(..., description="Campaign UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Delete a campaign.
    """
    success = delete_campaign(id)
    if not success:
        raise HTTPException(
            status_code=404, detail="Campaign not found or deletion failed"
        )
    return {"message": "Campaign deleted successfully"}


@router.post("/{id}/pause", response_model=Campaign)
async def pause_campaign(
    id: str = Path(..., description="Campaign UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Pause campaign queue sends.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    try:
        res = (
            supabase.table("campaigns")
            .update({"status": "paused"})
            .eq("id", id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return Campaign(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to pause campaign {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/resume", response_model=Campaign)
async def resume_campaign(
    id: str = Path(..., description="Campaign UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Resume campaign queue sends.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    try:
        # Pause all other active campaigns first
        supabase.table("campaigns").update({"status": "paused"}).eq(
            "user_id", owner["id"]
        ).eq("status", "active").neq("id", id).execute()

        res = (
            supabase.table("campaigns")
            .update({"status": "active"})
            .eq("id", id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return Campaign(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to resume campaign {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/archive", response_model=Campaign)
async def archive_campaign(
    id: str = Path(..., description="Campaign UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Archive a campaign by setting status to completed or archived.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline")
    try:
        res = (
            supabase.table("campaigns")
            .update({"status": "archived"})
            .eq("id", id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not res.data:
            raise HTTPException(status_code=404, detail="Campaign not found")
        return Campaign(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to archive campaign {id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/presets", response_model=Campaign)
async def create_preset_endpoint(
    payload_in: CampaignBase, owner: dict = Depends(require_owner)
):
    """
    Save a campaign configuration as a preset template.
    """
    payload = CampaignCreate(**payload_in.model_dump(), user_id=owner["id"])
    payload.status = "paused"
    res = create_campaign(payload)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to create preset campaign")
    return Campaign(**res)


@router.post("/{id}/clone", response_model=Campaign)
async def clone_campaign(
    id: str = Path(..., description="Campaign UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Clone a campaign and its associated sequence/steps.
    """
    import uuid
    import json
    from app.routes.settings import get_owner_settings_sync

    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")

    # 1. Fetch original campaign
    original_res = supabase.table("campaigns").select("*").eq("id", id).eq("user_id", owner["id"]).execute()
    if not original_res.data:
        raise HTTPException(status_code=404, detail="Campaign not found")
    orig = original_res.data[0]

    # 2. Get owner settings snapshot for reproducibility
    owner_settings = get_owner_settings_sync(owner["id"])
    sender_snapshot = {
        "sender_name": owner_settings.get("sender_name"),
        "sender_email": owner_settings.get("sender_email"),
        "default_signature": owner_settings.get("default_signature")
    }
    prompt_snapshot = {
        "brand_voice": owner_settings.get("brand_voice"),
        "offer_description": owner_settings.get("offer_description"),
        "default_tone": owner_settings.get("default_tone")
    }

    # 3. Create cloned campaign dictionary
    cloned_id = str(uuid.uuid4())
    cloned_campaign = dict(orig)
    
    # Strip audit/primary columns
    for k in ["id", "created_at", "updated_at"]:
        if k in cloned_campaign:
            del cloned_campaign[k]

    cloned_campaign["id"] = cloned_id
    cloned_campaign["name"] = f"Copy of {orig['name']}"
    cloned_campaign["cloned_from_id"] = id
    cloned_campaign["status"] = "paused"
    cloned_campaign["sender_profile_snapshot"] = json.dumps(sender_snapshot)
    cloned_campaign["prompt_config_snapshot"] = json.dumps(prompt_snapshot)

    # 4. Clone associated sequence steps if present
    seq_id = orig.get("sequence_id")
    if seq_id:
        try:
            seq_res = supabase.table("sequences").select("*").eq("id", seq_id).execute()
            if seq_res.data:
                orig_seq = seq_res.data[0]
                cloned_seq_id = str(uuid.uuid4())
                cloned_seq = dict(orig_seq)
                for k in ["id", "created_at", "updated_at"]:
                    if k in cloned_seq:
                        del cloned_seq[k]
                cloned_seq["id"] = cloned_seq_id
                cloned_seq["name"] = f"Sequence for Copy of {orig['name']}"
                
                # Insert sequence
                supabase.table("sequences").insert(cloned_seq).execute()
                cloned_campaign["sequence_id"] = cloned_seq_id

                # Fetch steps
                steps_res = supabase.table("sequence_steps").select("*").eq("sequence_id", seq_id).execute()
                cloned_steps = []
                for step in (steps_res.data or []):
                    cloned_step = dict(step)
                    for k in ["id", "created_at", "updated_at"]:
                        if k in cloned_step:
                            del cloned_step[k]
                    cloned_step["id"] = str(uuid.uuid4())
                    cloned_step["sequence_id"] = cloned_seq_id
                    cloned_steps.append(cloned_step)
                
                if cloned_steps:
                    supabase.table("sequence_steps").insert(cloned_steps).execute()
        except Exception as e:
            logger.error(f"Failed to clone associated campaign sequence: {e}")

    # 5. Save cloned campaign
    try:
        ins_res = supabase.table("campaigns").insert(cloned_campaign).execute()
        if not ins_res.data:
            raise HTTPException(status_code=500, detail="Failed to save cloned campaign record")
        return Campaign(**ins_res.data[0])
    except Exception as e:
        logger.error(f"Cloning insert failed: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone campaign: {str(e)}")


from typing import Optional
from pydantic import BaseModel
class CampaignPreviewRequest(BaseModel):
    objective: Optional[str] = None
    offer: Optional[str] = None
    value_proposition: Optional[str] = None
    tone: str = "professional"
    email_length: str = "medium"
    CTA: Optional[str] = None
    banned_content: list[str] = []

class PreviewDraftResponse(BaseModel):
    subject: str
    body: str

@router.post("/preview-drafts", response_model=list[PreviewDraftResponse])
async def preview_campaign_drafts(
    payload: CampaignPreviewRequest, owner: dict = Depends(require_owner)
):
    """
    Generates 3 mock email draft previews for given campaign parameters.
    """
    try:
        res = supabase.table("leads").select("*").eq("user_id", owner["id"]).limit(3).execute()
        leads_data = res.data or []
    except Exception:
        leads_data = []

    if not leads_data:
        leads_data = [
            {"company_name": "Acme Builders", "website": "https://acmebuilders.com", "first_name": "Alice", "job_title": "Project Manager"},
            {"company_name": "Apex Roofing", "website": "https://apexroofing.com", "first_name": "Bob", "job_title": "Owner"},
            {"company_name": "Summit Electric", "website": "https://summitelectric.com", "first_name": "Charlie", "job_title": "Operations Lead"}
        ]

    previews = []
    for lead in leads_data:
        company = lead.get("company_name") or "Company"
        first_name = lead.get("first_name") or "Team"
        
        objective_desc = payload.objective or "introduce our services"
        offer_desc = payload.offer or "custom operational improvements"
        cta_desc = payload.CTA or "Would you be open to a brief chat next week?"
        
        subject = f"Improving operational workflows for {company}"
        body = (
            f"Hello {first_name},\n\n"
            f"I noticed {company} manages project coordination directly. "
            f"We recently designed a workflow system that helps operators align tasks. "
            f"Our objective with this campaign is to {objective_desc} specifically through our offer of {offer_desc}.\n\n"
            f"Based on your profile as a {lead.get('job_title') or 'leader'}, we believe this is highly relevant.\n\n"
            f"{cta_desc}\n\n"
            f"Best Regards,\n"
            f"{owner.get('email') or 'Sender'}"
        )
        previews.append(PreviewDraftResponse(subject=subject, body=body))
    return previews

