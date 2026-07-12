import csv
import io
import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, HTTPException, Path, UploadFile, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.database import supabase
from app.crud.leads import get_leads
from app.schemas.lead import Lead, LeadBase, LeadCreate, LeadUpdate
from app.utils.auth import require_owner
from app.services.lead_quality_service import LeadQualityService

logger = logging.getLogger("outreachops.routes.leads")

router = APIRouter(prefix="/leads", tags=["leads"])
quality_service = LeadQualityService()

class BulkActionRequest(BaseModel):
    lead_ids: List[str] = Field(..., description="List of target lead UUIDs")
    action: str = Field(..., description="Action to perform: add_tags, remove_tags, enroll_campaign, disenroll_campaign, revalidate, research, archive")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Additional parameters (e.g. tag list, campaign_id)")

@router.get("", response_model=list[Lead])
async def read_leads(
    limit: int = 100,
    offset: int = 0,
    search: Optional[str] = Query(None, description="Search term for company name, website, or email"),
    lead_status: Optional[str] = Query(None, description="Filter by lead status"),
    industry: Optional[str] = Query(None, description="Filter by industry"),
    country: Optional[str] = Query(None, description="Filter by country"),
    email_validation_status: Optional[str] = Query(None, description="Filter by validation status"),
    owner: dict = Depends(require_owner)
):
    """
    Get all leads with advanced filtering, searching, and pagination.
    """
    try:
        # Route query through get_leads for SQLite/Supabase/mocker compatibility
        data = get_leads(user_id=owner["id"], limit=1000) or []
        
        # Apply filters
        if lead_status:
            data = [l for l in data if l.get("lead_status") == lead_status]
        if industry:
            data = [l for l in data if l.get("industry") == industry]
        if country:
            data = [l for l in data if l.get("country") == country]
        if email_validation_status:
            data = [l for l in data if l.get("email_validation_status") == email_validation_status]
            
        # Local search mapping filter if search specified
        if search:
            s_clean = search.strip().lower()
            data = [
                l for l in data if 
                s_clean in (l.get("company_name") or "").lower() or
                s_clean in (l.get("website") or "").lower() or
                s_clean in (l.get("contact_email") or "").lower()
            ]

        # Apply offset and limit pagination manually on the filtered results
        paginated_data = data[offset : offset + limit]
        return paginated_data

    except Exception as e:
        logger.error(f"Error reading leads list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error reading leads records"
        )

@router.post("", response_model=Lead, status_code=status.HTTP_201_CREATED)
async def add_lead(
    lead_in: LeadBase,
    duplicate_strategy: str = Query("skip", description="Duplicate strategy: skip, merge, overwrite, keep_both"),
    owner: dict = Depends(require_owner)
):
    """
    Creates a new lead using normalizations, verification checks, duplicate strategies, and fit scoring calculations.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")

    # 1. Normalize data
    raw_payload = lead_in.model_dump()
    normalized = quality_service.normalize_lead_data(raw_payload)
    normalized["user_id"] = owner["id"]

    # 2. Check for duplicate matches
    if duplicate_strategy != "keep_both":
        existing = quality_service.find_existing_duplicate(normalized, owner["id"])
        if existing:
            action, resolved_data = quality_service.resolve_duplicate_conflict(normalized, existing, duplicate_strategy)
            if action == "skipped":
                return existing
            
            # Persist update
            res = supabase.table("leads").update(resolved_data).eq("id", existing["id"]).execute()
            if not res.data:
                raise HTTPException(status_code=500, detail="Failed to resolve duplicate conflict update")
            return res.data[0]

    # 3. Email Verification
    email = normalized.get("contact_email")
    if email:
        verification = quality_service.verify_email(email)
        normalized["email_validation_status"] = verification["status"]
    else:
        normalized["email_validation_status"] = "unchecked"

    # 4. Fit Scoring (Default mock criteria)
    campaign_criteria = {
        "target_industries": ["construction", "hvac", "roofing", "masonry", "manufacturing"],
        "target_locations": ["usa", "canada"],
        "target_roles": ["sales", "owner", "partner", "founder", "manager"]
    }
    score, reasons = quality_service.calculate_fit_score(normalized, campaign_criteria)
    normalized["fit_score"] = score
    normalized["fit_score_reasons"] = reasons

    # 5. Insert Record
    try:
        res = supabase.table("leads").insert(normalized).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to insert lead record")
        return res.data[0]
    except Exception as e:
        logger.error(f"Error creating lead: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.patch("/{id}", response_model=Lead)
async def modify_lead(
    id: str = Path(..., description="Lead UUID"),
    lead_in: LeadUpdate = None,
    owner: dict = Depends(require_owner),
):
    """
    Updates lead details, re-running normalizations, validations, and fit scores if fields are updated.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")
    if not lead_in:
        raise HTTPException(status_code=400, detail="Request payload cannot be empty")

    existing = supabase.table("leads").select("*").eq("id", id).eq("user_id", owner["id"]).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    current_record = existing.data[0]

    # Overlay changes
    update_data = lead_in.model_dump(exclude_unset=True)
    merged_data = {**current_record, **update_data}

    # Normalize overlay
    normalized = quality_service.normalize_lead_data(merged_data)

    # Re-verify and re-score if emails/websites changed
    if update_data.get("contact_email") or update_data.get("website"):
        email = normalized.get("contact_email")
        if email:
            verification = quality_service.verify_email(email)
            normalized["email_validation_status"] = verification["status"]
            
        campaign_criteria = {
            "target_industries": ["construction", "hvac", "roofing", "masonry", "manufacturing"],
            "target_locations": ["usa", "canada"],
            "target_roles": ["sales", "owner", "partner", "founder", "manager"]
        }
        score, reasons = quality_service.calculate_fit_score(normalized, campaign_criteria)
        normalized["fit_score"] = score
        normalized["fit_score_reasons"] = reasons

    # Clean non-updatable audit fields
    for k in ["id", "user_id", "created_at", "updated_at"]:
        if k in normalized:
            del normalized[k]

    try:
        res = supabase.table("leads").update(normalized).eq("id", id).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to update lead record")
        return res.data[0]
    except Exception as e:
        logger.error(f"Error updating lead {id}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def remove_lead(
    id: str = Path(..., description="Lead UUID"),
    owner: dict = Depends(require_owner),
):
    """
    Deletes lead.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")

    existing = supabase.table("leads").select("id").eq("id", id).eq("user_id", owner["id"]).execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Lead not found")

    try:
        supabase.table("leads").delete().eq("id", id).execute()
        return {"message": "Lead deleted successfully", "id": id}
    except Exception as e:
        logger.error(f"Error deleting lead {id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete lead")

class ExportLeadsRequest(BaseModel):
    lead_ids: Optional[List[str]] = Field(default=None, description="Optional list of lead IDs to export. If null/empty, exports all leads.")

@router.post("/export")
async def export_leads(
    payload: Optional[ExportLeadsRequest] = None,
    owner: dict = Depends(require_owner)
):
    """
    Exports leads as a downloadable CSV stream.
    Supports exporting selected lead_ids or all leads.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")

    lead_ids = payload.lead_ids if payload else None

    try:
        # Fetch leads
        query = supabase.table("leads").select("*").eq("user_id", owner["id"])
        if lead_ids:
            query = query.in_("id", lead_ids)
        res = query.execute()
        leads_data = res.data or []

        # Generate CSV in memory
        output = io.StringIO()
        writer = csv.writer(output)

        headers = [
            "id", "first_name", "last_name", "full_name", "company_name", 
            "job_title", "website", "industry", "country", "city", 
            "contact_email", "phone", "lead_status", "tags", 
            "custom_fields", "research_status", "research_summary", 
            "personalization_context", "fit_score", "email_validation_status", 
            "created_at"
        ]
        writer.writerow(headers)

        for l in leads_data:
            tags_str = ", ".join(l.get("tags") or [])
            cf_str = json.dumps(l.get("custom_fields") or {})
            writer.writerow([
                l.get("id"),
                l.get("first_name"),
                l.get("last_name"),
                l.get("full_name"),
                l.get("company_name"),
                l.get("job_title"),
                l.get("website"),
                l.get("industry"),
                l.get("country"),
                l.get("city"),
                l.get("contact_email"),
                l.get("phone"),
                l.get("lead_status"),
                tags_str,
                cf_str,
                l.get("research_status"),
                l.get("research_summary"),
                l.get("personalization_context"),
                l.get("fit_score"),
                l.get("email_validation_status"),
                l.get("created_at")
            ])

        output.seek(0)
        return StreamingResponse(
            io.BytesIO(output.getvalue().encode("utf-8")),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads_export.csv"}
        )
    except Exception as e:
        logger.error(f"Failed to export leads: {e}")
        raise HTTPException(status_code=500, detail=f"Export failed: {str(e)}")

@router.post("/bulk-action", status_code=status.HTTP_200_OK)
async def perform_bulk_action(payload: BulkActionRequest, owner: dict = Depends(require_owner)):
    """
    Applies bulk actions across a selection collection list of leads.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client offline")
    if not payload.lead_ids:
        return {"modified_count": 0, "message": "No leads specified"}

    action = payload.action
    lead_ids = payload.lead_ids
    params = payload.params or {}

    modified_count = 0

    try:
        if action == "add_tags":
            tags_to_add = [t.strip().lower() for t in params.get("tags", []) if str(t).strip()]
            if tags_to_add:
                # Fetch target leads
                res = supabase.table("leads").select("id", "tags").eq("user_id", owner["id"]).in_("id", lead_ids).execute()
                for item in res.data:
                    current_tags = item.get("tags") or []
                    updated_tags = sorted(list(set(current_tags + tags_to_add)))
                    supabase.table("leads").update({"tags": updated_tags}).eq("id", item["id"]).execute()
                    modified_count += 1

        elif action == "remove_tags":
            tags_to_remove = [t.strip().lower() for t in params.get("tags", []) if str(t).strip()]
            if tags_to_remove:
                res = supabase.table("leads").select("id", "tags").eq("user_id", owner["id"]).in_("id", lead_ids).execute()
                for item in res.data:
                    current_tags = item.get("tags") or []
                    updated_tags = sorted([t for t in current_tags if t not in tags_to_remove])
                    supabase.table("leads").update({"tags": updated_tags}).eq("id", item["id"]).execute()
                    modified_count += 1

        elif action == "enroll_campaign":
            campaign_id = params.get("campaign_id")
            if not campaign_id:
                raise HTTPException(status_code=400, detail="Missing campaign_id parameter")
            
            # Enrolls in campaign_leads mapping table
            for lid in lead_ids:
                try:
                    enroll_payload = {
                        "campaign_id": campaign_id,
                        "lead_id": lid,
                        "status": "enrolled",
                        "current_sequence_step": 1
                    }
                    supabase.table("campaign_leads").insert(enroll_payload).execute()
                    modified_count += 1
                except Exception:
                    # Ignore duplicates or existing enrollments
                    pass

        elif action == "disenroll_campaign":
            campaign_id = params.get("campaign_id")
            if not campaign_id:
                raise HTTPException(status_code=400, detail="Missing campaign_id parameter")
            
            res = supabase.table("campaign_leads").delete().eq("campaign_id", campaign_id).in_("lead_id", lead_ids).execute()
            modified_count = len(res.data or [])

        elif action == "revalidate":
            res = supabase.table("leads").select("id", "contact_email").eq("user_id", owner["id"]).in_("id", lead_ids).execute()
            for item in res.data:
                email = item.get("contact_email")
                if email:
                    verification = quality_service.verify_email(email)
                    supabase.table("leads").update({"email_validation_status": verification["status"]}).eq("id", item["id"]).execute()
                    modified_count += 1

        elif action == "research":
            # Performs a mock research enrichment, updating status
            res = supabase.table("leads").select("id", "company_name", "website").eq("user_id", owner["id"]).in_("id", lead_ids).execute()
            for item in res.data:
                company = item.get("company_name") or "Business"
                summary = f"Identified outreach triggers for {company} based on digital presence and market position."
                context = f"Hello, noticed {company} has strong reviews but could improve their landing page conversion flow."
                
                supabase.table("leads").update({
                    "research_status": "completed",
                    "research_summary": summary,
                    "personalization_context": context
                }).eq("id", item["id"]).execute()
                modified_count += 1

        elif action == "archive":
            for lid in lead_ids:
                supabase.table("leads").update({"lead_status": "Archived"}).eq("id", lid).execute()
                modified_count += 1

        return {
            "modified_count": modified_count,
            "message": f"Successfully performed bulk action '{action}' across {modified_count} leads."
        }

    except Exception as e:
        logger.error(f"Failed bulk action request: {e}")
        raise HTTPException(status_code=500, detail=f"Bulk action failed: {str(e)}")
