import logging
from typing import List, Dict, Any, Optional
from app.database import supabase
from app.schemas.prompt_template import PromptTemplateCreate, PromptTemplateUpdate

logger = logging.getLogger("outreachops.crud.prompt_templates")

def get_prompt_templates(user_id: str) -> List[Dict[str, Any]]:
    if not supabase:
        logger.warning("Supabase client is not initialized")
        return []
    try:
        res = supabase.table("prompt_templates").select("*").eq("user_id", user_id).execute()
        return res.data
    except Exception as e:
        logger.error(f"Error fetching prompt templates: {e}")
        return []

def get_active_template(user_id: str, email_type: str) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        res = supabase.table("prompt_templates").select("*") \
            .eq("user_id", user_id) \
            .eq("email_type", email_type) \
            .eq("is_active", True) \
            .execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error fetching active prompt template for {email_type}: {e}")
        return None

def create_prompt_template(template_in: PromptTemplateCreate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = template_in.model_dump()
        res = supabase.table("prompt_templates").insert(payload).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error creating prompt template: {e}")
        return None

def update_prompt_template(template_id: str, template_in: PromptTemplateUpdate) -> Optional[Dict[str, Any]]:
    if not supabase:
        return None
    try:
        payload = template_in.model_dump(exclude_unset=True)
        res = supabase.table("prompt_templates").update(payload).eq("id", template_id).execute()
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"Error updating prompt template {template_id}: {e}")
        return None
