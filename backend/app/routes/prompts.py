import difflib
import logging
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.config import settings
from app.crud.leads import get_lead
from app.crud.prompt_templates import (
    create_prompt_template,
    get_active_template,
    get_prompt_templates,
    update_prompt_template,
)
from app.database import supabase
from app.schemas.prompt_template import (
    PromptTemplate,
    PromptTemplateCreate,
    PromptTemplateUpdate,
    PromptValidationResponse,
    PromptVersion,
    PromptVersionCompareResponse,
)
from app.services.email_quality_service import EmailQualityService
from app.services.gemini_service import GeminiService
from app.services.template_renderer import SafeTemplateRenderer
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.prompts")

router = APIRouter(prefix="/prompts", tags=["prompts"])
gemini_service = GeminiService()
quality_service = EmailQualityService()

# --- Request Schemas ---


class PromptValidateRequest(BaseModel):
    template_text: str = Field(
        ..., description="The raw prompt template text to validate"
    )
    email_type: str = Field("generic", description="Classification of template copy")


class PromptVersionCreateRequest(BaseModel):
    version: str = Field(..., description="Semantic version string, e.g. 1.1.0")
    template_text: str = Field(..., description="Template body contents")
    status: str = Field("published", description="Draft or published state")
    description: str | None = Field(None, description="Optional brief description")
    changelog: str | None = Field(None, description="Changelog notes")


class PromptTestRequest(BaseModel):
    lead_id: str = Field(..., description="Target lead ID to run test simulation on")
    campaign_id: str | None = Field(
        None, description="Campaign ID to pull objective parameters from"
    )
    template_text: str = Field(
        ..., description="Template guidelines to compile and execute"
    )
    tone: str | None = Field("casual", description="Outreach copy tone")
    length: str | None = Field("medium", description="Length limit: short/medium")
    cta: str | None = Field("soft", description="Call to action format choice")


class PromptGenerateRequest(BaseModel):
    instruction: str = Field(
        ..., description="Guidelines describing the desired email copy"
    )
    email_type: str = Field("generic", description="Campaign classification bounds")


# --- Endpoints ---


@router.get("", response_model=list[PromptTemplate])
async def read_prompt_templates(owner: dict = Depends(require_owner)):
    """
    Get all prompt templates.
    """
    return get_prompt_templates(owner["id"])


@router.get("/active", response_model=Optional[PromptTemplate])
async def read_active_template(
    email_type: str = Query("generic", description="Filter active template by type"),
    owner: dict = Depends(require_owner),
):
    """
    Get the active prompt template by email type.
    """
    template = get_active_template(owner["id"], email_type.lower())
    if not template:
        return None
    return PromptTemplate(**template)


@router.post("", response_model=PromptTemplate)
async def save_prompt_template(
    payload: PromptTemplateCreate, owner: dict = Depends(require_owner)
):
    """
    Save or update a prompt template. Deactivates other templates of same type.
    """
    # Deactivate existing active
    existing_active = get_active_template(owner["id"], payload.email_type.lower())
    if existing_active:
        update_prompt_template(
            existing_active["id"], PromptTemplateUpdate(is_active=False)
        )

    create_payload = PromptTemplateCreate(
        user_id=owner["id"],
        name=payload.name,
        email_type=payload.email_type.lower(),
        template_text=payload.template_text,
        version=payload.version,
        is_active=True,
    )

    res = create_prompt_template(create_payload)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to create prompt template.")

    # Automatically create the first version record
    v_id = str(uuid.uuid4())
    version_payload = {
        "id": v_id,
        "template_id": res["id"],
        "version": payload.version,
        "template_text": payload.template_text,
        "status": "published",
        "description": "Initial version",
        "changelog": "Initial template creation",
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
    }
    try:
        supabase.table("prompt_versions").insert(version_payload).execute()
    except Exception as e:
        logger.error(f"Failed to create initial prompt version record: {e}")

    return PromptTemplate(**res)


@router.post("/validate", response_model=PromptValidationResponse)
async def validate_prompt_template_endpoint(
    payload: PromptValidateRequest, owner: dict = Depends(require_owner)
):
    """
    Validates template syntax braces, variables namespaces correctness, and shows compile preview.
    """
    is_valid, errors, detected, unknown = SafeTemplateRenderer.validate_syntax(
        payload.template_text
    )

    # Build a standard mock context to render a preview
    mock_context = _build_mock_context(owner["id"])
    preview_text, _, _ = SafeTemplateRenderer.render(
        payload.template_text, mock_context
    )

    return PromptValidationResponse(
        is_valid=is_valid,
        errors=errors,
        detected_variables=list(detected),
        unknown_variables=list(unknown),
        preview_text=preview_text,
    )


# --- Versioning Endpoints ---


@router.get("/{template_id}/versions", response_model=list[PromptVersion])
async def list_template_versions(
    template_id: str, owner: dict = Depends(require_owner)
):
    """
    List all versions of a prompt template.
    """
    # Verify template ownership
    try:
        tmpl_res = (
            supabase.table("prompt_templates")
            .select("id")
            .eq("id", template_id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not tmpl_res.data:
            raise HTTPException(status_code=404, detail="Template not found")
    except Exception as e:
        logger.error(f"Failed to check template ownership: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch template status")

    try:
        res = (
            supabase.table("prompt_versions")
            .select("*")
            .eq("template_id", template_id)
            .execute()
        )
        versions = res.data or []
        # Parse dates and map
        parsed_versions = []
        for v in versions:
            # Map sqlite datetime strings to standard schema formats
            v_dict = dict(v)
            if "created_at" in v_dict and isinstance(v_dict["created_at"], str):
                try:
                    # Parse sqlite timestamp e.g. "2026-07-12 12:00:00"
                    if " " in v_dict["created_at"] and "T" not in v_dict["created_at"]:
                        v_dict["created_at"] = v_dict["created_at"].replace(" ", "T")
                except Exception:
                    pass
            parsed_versions.append(PromptVersion(**v_dict))
        return parsed_versions
    except Exception as e:
        logger.error(f"Failed to fetch prompt versions: {e}")
        raise HTTPException(status_code=500, detail="Failed to load version records")


@router.post("/{template_id}/versions", response_model=PromptVersion)
async def create_template_version(
    template_id: str,
    payload: PromptVersionCreateRequest,
    owner: dict = Depends(require_owner),
):
    """
    Saves an immutable version of a prompt template.
    """
    # Verify template ownership
    try:
        tmpl_res = (
            supabase.table("prompt_templates")
            .select("*")
            .eq("id", template_id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not tmpl_res.data:
            raise HTTPException(status_code=404, detail="Template not found")
        template = tmpl_res.data[0]
    except Exception as e:
        logger.error(f"Ownership check failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to check template records")

    # Check validation before saving
    is_valid, errors, _, _ = SafeTemplateRenderer.validate_syntax(payload.template_text)
    if not is_valid:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot save version: Malformed template. Errors: {', '.join(errors)}",
        )

    version_id = str(uuid.uuid4())
    version_payload = {
        "id": version_id,
        "template_id": template_id,
        "version": payload.version,
        "template_text": payload.template_text,
        "status": payload.status,
        "description": payload.description,
        "changelog": payload.changelog,
        "is_active": False,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }

    try:
        res = supabase.table("prompt_versions").insert(version_payload).execute()
        if not res.data:
            raise HTTPException(
                status_code=500, detail="Failed to insert version record"
            )

        # If status is published and active, propagate to main template
        if payload.status == "published":
            # Deactivate other active versions
            supabase.table("prompt_versions").update({"is_active": False}).eq(
                "template_id", template_id
            ).execute()
            # Set this active
            supabase.table("prompt_versions").update({"is_active": True}).eq(
                "id", version_id
            ).execute()
            # Update main template
            supabase.table("prompt_templates").update(
                {"template_text": payload.template_text, "version": payload.version}
            ).eq("id", template_id).execute()

        return PromptVersion(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to create version: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post(
    "/{template_id}/versions/{version_id}/activate", response_model=PromptVersion
)
async def activate_template_version(
    template_id: str, version_id: str, owner: dict = Depends(require_owner)
):
    """
    Activates a specific prompt template version, propagating it to the parent template text.
    """
    try:
        # Check ownership
        tmpl_res = (
            supabase.table("prompt_templates")
            .select("id")
            .eq("id", template_id)
            .eq("user_id", owner["id"])
            .execute()
        )
        if not tmpl_res.data:
            raise HTTPException(status_code=404, detail="Template not found")

        # Check version existence
        v_res = (
            supabase.table("prompt_versions")
            .select("*")
            .eq("id", version_id)
            .eq("template_id", template_id)
            .execute()
        )
        if not v_res.data:
            raise HTTPException(status_code=404, detail="Version not found")
        version = v_res.data[0]

        # Deactivate all others for this template
        supabase.table("prompt_versions").update({"is_active": False}).eq(
            "template_id", template_id
        ).execute()
        # Set selected as active
        res = (
            supabase.table("prompt_versions")
            .update({"is_active": True, "status": "published"})
            .eq("id", version_id)
            .execute()
        )

        # Propagate changes to parent template
        supabase.table("prompt_templates").update(
            {"template_text": version["template_text"], "version": version["version"]}
        ).eq("id", template_id).execute()

        return PromptVersion(**res.data[0])
    except Exception as e:
        logger.error(f"Failed to activate version: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/compare", response_model=PromptVersionCompareResponse)
async def compare_template_versions(
    v1: str = Query(..., description="First version ID to compare"),
    v2: str = Query(..., description="Second version ID to compare"),
    owner: dict = Depends(require_owner),
):
    """
    Compares two template versions and returns a line-by-line inline diff list.
    """
    try:
        res1 = supabase.table("prompt_versions").select("*").eq("id", v1).execute()
        res2 = supabase.table("prompt_versions").select("*").eq("id", v2).execute()
        if not res1.data or not res2.data:
            raise HTTPException(
                status_code=404, detail="One or both versions not found"
            )

        v1_data = res1.data[0]
        v2_data = res2.data[0]

        # Verify template ownership
        t_res1 = (
            supabase.table("prompt_templates")
            .select("user_id")
            .eq("id", v1_data["template_id"])
            .execute()
        )
        if not t_res1.data or t_res1.data[0]["user_id"] != owner["id"]:
            raise HTTPException(status_code=403, detail="Access denied")

        lines1 = v1_data["template_text"].splitlines()
        lines2 = v2_data["template_text"].splitlines()
        diff = list(difflib.ndiff(lines1, lines2))

        return PromptVersionCompareResponse(
            version1=v1_data["version"], version2=v2_data["version"], diff_lines=diff
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Version compare failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Simulation testing Endpoints ---


@router.post("/test")
async def test_prompt_simulation(
    payload: PromptTestRequest, owner: dict = Depends(require_owner)
):
    """
    Simulates variable context compile rendering and Gemini structured output generation on a lead.
    Does not save generated drafts into DB.
    """
    from app.services.rate_limit_service import RateLimitService

    limiter = RateLimitService()
    limit_key = f"rate_limit:prompts_test:{owner['id']}"
    if limiter.is_rate_limited(limit_key, max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many prompt simulation test requests. Please try again later.",
        )

    # 1. Fetch target Lead
    lead = get_lead(payload.lead_id)
    if not lead or lead.get("user_id") != owner["id"]:
        # Use a fallback mock lead if not found or unauthorized
        lead = {
            "id": payload.lead_id,
            "first_name": "David",
            "last_name": "Manager",
            "full_name": "David Manager",
            "company_name": "Delta Roofing",
            "job_title": "General Manager",
            "contact_email": "david@deltaroofing.com",
            "website": "deltaroofing.com",
            "industry": "Construction",
            "country": "United States",
            "city": "Boston",
            "custom_fields": {"pain_points": "scheduling subcontractors conflicts"},
        }

    # 2. Fetch owner's settings
    from app.routes.settings import get_owner_settings_sync

    owner_settings = get_owner_settings_sync(owner["id"])
    sender_name = owner_settings.get("sender_name") or settings.YOUR_NAME
    sender_company = owner_settings.get("business_name") or settings.YOUR_AGENCY_NAME
    sender_website = owner_settings.get("website") or settings.YOUR_WEBSITE
    sender_phone = owner_settings.get("sender_phone") or settings.YOUR_PHONE
    sender_signature = (
        owner_settings.get("default_signature") or f"{sender_name} | {sender_company}"
    )

    # 3. Campaign parameters
    campaign_name = "Standard Simulation"
    campaign_objective = "Introduce operational agency automation modules"
    campaign_offer = "Free workflows analysis audit"
    campaign_val_prop = "Remove spread-sheets manual bottlenecks"
    campaign_audience = "Operations managers"
    campaign_cta = "Are you available for a 5-minute call next Tuesday?"

    if payload.campaign_id:
        try:
            c_res = (
                supabase.table("campaigns")
                .select("*")
                .eq("id", payload.campaign_id)
                .eq("user_id", owner["id"])
                .execute()
            )
            if c_res.data:
                camp = c_res.data[0]
                campaign_name = camp.get("name") or campaign_name
                campaign_objective = camp.get("objective") or campaign_objective
                campaign_offer = camp.get("offer") or campaign_offer
                campaign_val_prop = camp.get("value_proposition") or campaign_val_prop
                campaign_audience = camp.get("target_audience") or campaign_audience
                campaign_cta = camp.get("CTA") or campaign_cta
        except Exception as e:
            logger.warning(f"Failed to fetch campaign parameters: {e}")

    # Build the full variables context dictionary
    context = {
        "first_name": lead.get("first_name"),
        "last_name": lead.get("last_name"),
        "full_name": lead.get("full_name")
        or f"{lead.get('first_name', '')} {lead.get('last_name', '')}".strip(),
        "company_name": lead.get("company_name"),
        "job_title": lead.get("job_title"),
        "contact_email": lead.get("contact_email"),
        "website": lead.get("website"),
        "industry": lead.get("industry"),
        "country": lead.get("country"),
        "city": lead.get("city"),
        "custom": lead.get("custom_fields") or {},
        "campaign": {
            "name": campaign_name,
            "objective": campaign_objective,
            "offer": campaign_offer,
            "value_proposition": campaign_val_prop,
            "target_audience": campaign_audience,
            "cta": campaign_cta,
        },
        "research": {
            "summary": lead.get("research_summary")
            or f"{lead.get('company_name')} manages construction workflows.",
            "services": "scheduling subcontractors dispatch",
            "observations": "manual sheets coordination conflicts",
            "sources": f"{lead.get('website')}/about",
        },
        "sender": {
            "name": sender_name,
            "company": sender_company,
            "website": sender_website,
            "phone": sender_phone,
            "signature": sender_signature,
        },
        "sequence": {"step_number": 1, "previous_subject": None},
    }

    # Render template body guidelines
    rendered_directives, _, _ = SafeTemplateRenderer.render(
        payload.template_text, context
    )

    # Compile the final Gemini prompt
    word_bounds = "60-90 words" if payload.length == "short" else "80-120 words"
    tone_instruction = f"Write in a {payload.tone} tone."
    cta_instruction = f"End with this call-to-action: {campaign_cta}"

    banned_instruction = ""
    if owner_settings.get("banned_phrases"):
        # Split by comma or lines
        phrases = [
            p.strip()
            for p in owner_settings["banned_phrases"].replace("\n", ",").split(",")
            if p.strip()
        ]
        if phrases:
            banned_instruction = f"BANNED PHRASES: Do not include any of these phrases: {', '.join(phrases)}."

    prompt = f"""
{tone_instruction}

TASK DIRECTIVES:
{rendered_directives}

COMPLIANCE RULES:
- Length: STRICTLY {word_bounds} only.
- Format: Max 3 paragraphs.
- Openings: Do not use generic sales openers or corporate email fluff.
{cta_instruction}
{banned_instruction}

Signature block (append exactly at the end of the email body):
{sender_signature}
""".strip()

    # Call Structured AI email generator
    try:
        gen_res = gemini_service.generate_structured_email(prompt, user_id=owner["id"])
        subject = gen_res["subject"]
        body = gen_res["body"]
        reasoning = gen_res["reasoning"]
        model_used = gen_res["model_used"]
        warnings = gen_res.get("warnings") or []
    except Exception as e:
        logger.error(f"Gemini structured generation failed: {e}")
        subject = f"Improving {lead.get('company_name')} workflows"
        body = f"Hello {lead.get('first_name')},\n\nWe noticed spreadsheet bottlenecks. We suggest automating coordination.\n\nBest,\n{sender_signature}"
        reasoning = f"Fallback error: {e}"
        model_used = "fallback-static"
        warnings = ["Fallback generated due to network error"]

    # Evaluate the preview via quality scoring checks
    eval_res = quality_service.evaluate_draft(subject, body, "generic", lead)
    # Append any model warnings
    warnings.extend(eval_res.get("warnings") or [])

    # Estimate token usages
    # Telemetry heuristic: character length divided by 4 as a fallback representation
    char_len = len(prompt) + len(subject) + len(body)
    token_estimate = char_len // 4

    return {
        "subject": eval_res["subject"],
        "body": eval_res["body"],
        "reasoning": reasoning,
        "model_used": model_used,
        "warnings": warnings,
        "scores": eval_res["scores"],
        "token_estimate": token_estimate,
    }


@router.post("/generate-template")
async def generate_prompt_template_endpoint(
    payload: PromptGenerateRequest, owner: dict = Depends(require_owner)
):
    """
    Generate a generic prompt template based on owner requirements using available variables.
    """
    prompt = f"""
You are an expert prompt engineer. The user wants to write a generic template prompt for a cold email campaign.
Do not hardcode any specific ERP or construction vertical terminology unless explicitly instructed by the user.

The prompt template MUST use the standard double-braces variable placeholders:
- `{{{{first_name}}}}` for lead's first name
- `{{{{company_name}}}}` for lead's company
- `{{{{job_title}}}}` for lead's job title
- `{{{{campaign.objective}}}}` for the outreach objective
- `{{{{campaign.offer}}}}` for target offer
- `{{{{campaign.value_proposition}}}}` for key value prop
- `{{{{campaign.cta}}}}` for the call to action
- `{{{{sender.signature}}}}` for the signature block

User Instruction: {payload.instruction}

Write a clean, direct, robust template prompt block that instructs a language model on how to write the email copy.
Do not include raw python code. Return only the raw guidelines prompt template content.
"""
    try:
        generated_template = gemini_service.generate_prompt_text(prompt)
        return {"template_text": generated_template}
    except Exception as e:
        logger.error(f"Failed to generate prompt template: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate prompt template: {e}"
        )


def _build_mock_context(owner_id: str) -> dict[str, Any]:
    return {
        "first_name": "Alice",
        "last_name": "Smith",
        "full_name": "Alice Smith",
        "company_name": "Acme Corp",
        "job_title": "Director of Operations",
        "contact_email": "alice@acme.com",
        "website": "acme.com",
        "industry": "Software",
        "country": "United States",
        "city": "Boston",
        "custom": {"pain_points": "manual scheduling errors"},
        "campaign": {
            "name": "Acme Outreach Campaign",
            "objective": "Introduce workflow scheduling automation",
            "offer": "Free coordination analysis portal",
            "value_proposition": "Remove spreadsheets delays",
            "target_audience": "Operations Directors",
            "cta": "Are you available for a 5 minute chat next Tuesday?",
        },
        "research": {
            "summary": "Acme Corp designs construction workflows manually.",
            "services": "Scheduling tools, task assigners, cost sheets",
            "observations": " spreadsheets are slow and prone to errors",
            "sources": "acme.com/about",
        },
        "sender": {
            "name": "Yash",
            "company": "OutreachOps",
            "website": "outreachops.ai",
            "phone": "+1-555-0199",
            "signature": "Best, Yash | OutreachOps",
        },
        "sequence": {"step_number": 1, "previous_subject": None},
    }
