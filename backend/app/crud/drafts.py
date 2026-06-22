import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.database import supabase
from app.schemas.email import EmailDraftCreate, EmailDraftUpdate
from app.services.email_quality_service import EmailQualityService
from app.crud.leads import get_lead

logger = logging.getLogger("outreachops.crud.drafts")

_has_warnings_col = None

def has_warnings_column() -> bool:
    global _has_warnings_col
    if _has_warnings_col is not None:
        return _has_warnings_col
    if not supabase:
        return False
    try:
        supabase.table("email_drafts").select("warnings").limit(1).execute()
        _has_warnings_col = True
    except Exception:
        _has_warnings_col = False
    return _has_warnings_col

def augment_draft_warnings(draft: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures a draft has a warnings list, either from DB or computed dynamically."""
    if not draft:
        return draft
    
    # If the column exists in DB and is populated, use it
    if has_warnings_column() and draft.get("warnings") is not None:
        return draft

    # Otherwise, compute dynamically
    lead_id = draft.get("lead_id")
    if lead_id:
        lead = get_lead(lead_id)
        if lead:
            eqs = EmailQualityService()
            eval_res = eqs.evaluate_draft(
                subject=draft.get("subject") or "",
                body=draft.get("body") or "",
                email_type=draft.get("email_type") or "",
                lead=lead
            )
            draft["warnings"] = eval_res.get("warnings") or []
    
    if "warnings" not in draft or draft["warnings"] is None:
        draft["warnings"] = []
    return draft

def get_drafts(
    user_id: str, 
    status: Optional[str] = None, 
    email_type: Optional[str] = None, 
    limit: int = 100
) -> List[Dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        query = supabase.table("email_drafts").select("*").eq("user_id", user_id)
        
        if status:
            query = query.eq("status", status)
        if email_type:
            query = query.eq("email_type", email_type)
            
        res = query.order("created_at", desc=True).limit(limit).execute()
        drafts = res.data or []
        return [augment_draft_warnings(d) for d in drafts]
    except Exception as e:
        logger.error(f"Error fetching email drafts: {e}")
        return []

def get_draft(draft_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("email_drafts").select("*").eq("id", draft_id).execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error fetching email draft {draft_id}: {e}")
        return None

def check_existing_draft(lead_id: str, email_type: str, include_sent: bool = False) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        query = supabase.table("email_drafts").select("*") \
            .eq("lead_id", lead_id) \
            .eq("email_type", email_type)
        if not include_sent:
            query = query.neq("status", "sent")
        res = query.execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error checking existing draft for lead {lead_id}: {e}")
        return None

def create_draft(draft_in: EmailDraftCreate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = draft_in.model_dump()
        # Strip warnings if column does not exist in the DB table
        if not has_warnings_column() and "warnings" in payload:
            payload.pop("warnings")
            
        res = supabase.table("email_drafts").insert(payload).execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error creating email draft: {e}")
        return None

def update_draft(draft_id: str, draft_in: EmailDraftUpdate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = draft_in.model_dump(exclude_unset=True)
        # Strip warnings if column does not exist in the DB table
        if not has_warnings_column() and "warnings" in payload:
            payload.pop("warnings")
            
        for key, val in payload.items():
            if isinstance(val, datetime):
                payload[key] = val.isoformat()
        res = supabase.table("email_drafts").update(payload).eq("id", draft_id).execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error updating email draft {draft_id}: {e}")
        return None

def approve_draft(draft_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("email_drafts").update({
            "status": "approved",
            "approved_at": datetime.now().isoformat()
        }).eq("id", draft_id).execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error approving email draft {draft_id}: {e}")
        return None

def reject_draft(draft_id: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("email_drafts").update({
            "status": "rejected"
        }).eq("id", draft_id).execute()
        if res.data:
            return augment_draft_warnings(res.data[0])
        return None
    except Exception as e:
        logger.error(f"Error rejecting email draft {draft_id}: {e}")
        return None

