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


class CreateJobRequest(BaseModel):
    lead_ids: Optional[list[str]] = None
    sample_only: bool = False
    regenerate: bool = False
    prompt_version_id: Optional[str] = None
    model_override_config: Optional[dict[str, Any]] = None


@router.post("/{id}/jobs")
async def trigger_campaign_generation_job(
    id: str,
    payload: CreateJobRequest,
    owner: dict = Depends(require_owner)
):
    """
    Spawns an asynchronous batch generation job for target leads in the campaign.
    """
    from app.services.generation_job_service import GenerationJobService
    try:
        job = GenerationJobService.create_generation_job(
            campaign_id=id,
            user_id=owner["id"],
            lead_ids=payload.lead_ids,
            sample_only=payload.sample_only,
            regenerate=payload.regenerate,
            prompt_version_id=payload.prompt_version_id,
            model_config=payload.model_override_config
        )
        return job
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to spawn job: {e}")


@router.get("/{id}/jobs")
async def list_campaign_generation_jobs(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Lists historical generation jobs spawned for this campaign.
    """
    res = supabase.table("generation_jobs").select("*").eq("campaign_id", id).eq("user_id", owner["id"]).order("created_at", desc=True).execute()
    return res.data or []


@router.get("/jobs/{job_id}")
async def get_job_details(
    job_id: str,
    owner: dict = Depends(require_owner)
):
    """
    Retrieves status counts and configuration snapshots for a specific job.
    """
    # Force sync before returning status
    from app.services.generation_job_service import GenerationJobService
    try:
        GenerationJobService.sync_job_counts(job_id)
    except Exception:
        pass

    res = supabase.table("generation_jobs").select("*").eq("id", job_id).eq("user_id", owner["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Job not found")
    return res.data[0]


@router.get("/jobs/{job_id}/items")
async def list_job_items(
    job_id: str,
    status: Optional[str] = None,
    owner: dict = Depends(require_owner)
):
    """
    Retrieves individual execution items queued under the job.
    """
    # Verify owner has access to job
    job_res = supabase.table("generation_jobs").select("id").eq("id", job_id).eq("user_id", owner["id"]).execute()
    if not job_res.data:
        raise HTTPException(status_code=404, detail="Job not found")

    query = supabase.table("generation_job_items").select("*").eq("job_id", job_id)
    if status:
        query = query.eq("status", status)
    
    res = query.order("created_at").execute()
    return res.data or []


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(
    job_id: str,
    owner: dict = Depends(require_owner)
):
    """
    Cancels pending items queued in the job.
    """
    from app.services.generation_job_service import GenerationJobService
    try:
        return GenerationJobService.cancel_generation_job(job_id, owner["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/jobs/{job_id}/retry")
async def retry_failed_items(
    job_id: str,
    owner: dict = Depends(require_owner)
):
    """
    Retries failed or cancelled items within the job.
    """
    from app.services.generation_job_service import GenerationJobService
    try:
        return GenerationJobService.retry_job_failures(job_id, owner["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/jobs/{job_id}/resume")
async def resume_stalled_job(
    job_id: str,
    owner: dict = Depends(require_owner)
):
    """
    Resumes stalled items in processing/pending state.
    """
    from app.services.generation_job_service import GenerationJobService
    try:
        return GenerationJobService.resume_job(job_id, owner["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


from pydantic import BaseModel
import uuid

class SequenceStepSave(BaseModel):
    name: str
    step_number: int
    delay_amount: int
    delay_unit: str
    body_template_version_id: Optional[str] = None
    subject_template_version_id: Optional[str] = None
    custom_instructions: Optional[str] = None
    require_manual_approval: bool = True

class SaveSequenceStepsRequest(BaseModel):
    steps: list[SequenceStepSave]

class EnrollLeadsRequest(BaseModel):
    lead_ids: list[str]


@router.get("/{id}/sequence")
async def get_campaign_sequence(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Returns sequence steps details for the campaign.
    """
    from app.services.sequence_service import SequenceService
    try:
        seq_id = SequenceService.get_or_create_default_sequence(id, owner["id"])
        seq_res = supabase.table("sequences").select("*").eq("id", seq_id).execute()
        steps_res = supabase.table("sequence_steps").select("*").eq("sequence_id", seq_id).order("step_number").execute()
        return {
            "sequence": seq_res.data[0] if seq_res.data else {},
            "steps": steps_res.data or []
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/sequence/steps")
async def save_campaign_sequence_steps(
    id: str,
    payload: SaveSequenceStepsRequest,
    owner: dict = Depends(require_owner)
):
    """
    Updates the sequence steps for the campaign.
    """
    from app.services.sequence_service import SequenceService
    try:
        seq_id = SequenceService.get_or_create_default_sequence(id, owner["id"])
        
        # Delete old steps
        supabase.table("sequence_steps").delete().eq("sequence_id", seq_id).execute()
        
        # Insert new steps
        insert_payloads = []
        for step in payload.steps:
            insert_payloads.append({
                "id": str(uuid.uuid4()),
                "sequence_id": seq_id,
                "step_number": step.step_number,
                "name": step.name,
                "delay_amount": step.delay_amount,
                "delay_unit": step.delay_unit,
                "body_template_version_id": step.body_template_version_id,
                "subject_template_version_id": step.subject_template_version_id,
                "custom_instructions": step.custom_instructions,
                "require_manual_approval": 1 if step.require_manual_approval else 0
            })
        
        if insert_payloads:
            supabase.table("sequence_steps").insert(insert_payloads).execute()
            
        return {"status": "success", "steps_count": len(insert_payloads)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{id}/timeline")
async def get_campaign_leads_timeline(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Returns progress stats of all leads enrolled in the campaign.
    """
    try:
        leads_res = supabase.table("campaign_leads").select("*").eq("campaign_id", id).execute()
        return leads_res.data or []
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/leads/enroll")
async def enroll_leads_in_sequence(
    id: str,
    payload: EnrollLeadsRequest,
    owner: dict = Depends(require_owner)
):
    """
    Enrolls a list of lead IDs in the campaign sequence.
    """
    from app.services.sequence_service import SequenceService
    results = []
    for lead_id in payload.lead_ids:
        try:
            res = SequenceService.enroll_lead(id, lead_id, owner["id"])
            results.append({"lead_id": lead_id, "status": "success", "result": res})
        except Exception as e:
            results.append({"lead_id": lead_id, "status": "error", "message": str(e)})
    return results


@router.post("/{id}/leads/pause")
async def pause_sequence_processing(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Pauses campaign sequence processing by transitioning running states to paused stop status.
    """
    try:
        # Update campaign lead statuses to stopped
        supabase.table("campaign_leads").update({
            "status": "stopped",
            "stopped_reason": "Campaign paused"
        }).eq("campaign_id", id).in_("status", ["awaiting_generation", "awaiting_approval", "scheduled", "waiting"]).execute()
        
        return {"status": "success", "message": "Campaign leads sequence paused"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/leads/resume")
async def resume_sequence_processing(
    id: str,
    owner: dict = Depends(require_owner)
):
    """
    Resumes sequence processing for paused campaign leads.
    """
    from app.services.sequence_service import SequenceService
    try:
        SequenceService.recalculate_paused_campaign_leads(id)
        return {"status": "success", "message": "Resumed sequence calculations successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


