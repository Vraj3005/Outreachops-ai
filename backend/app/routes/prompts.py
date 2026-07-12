import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import settings
from app.crud.leads import get_lead
from app.crud.prompt_templates import (
    create_prompt_template,
    get_active_template,
    get_prompt_templates,
    update_prompt_template,
)
from app.schemas.prompt_template import (
    PromptTemplate,
    PromptTemplateCreate,
    PromptTemplateUpdate,
)
from app.services.email_quality_service import EmailQualityService
from app.services.gemini_service import GeminiService
from app.services.prompt_service import PromptService
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.prompts")

router = APIRouter(prefix="/prompts", tags=["prompts"])
gemini_service = GeminiService()
prompt_service = PromptService()
quality_service = EmailQualityService()


class PromptTestRequest(BaseModel):
    lead_id: str = Field(..., description="Target lead ID to run test simulation on")
    email_type: str = Field("erp", description="website or erp")
    tone: str = Field(
        ...,
        description="Tone selection: founder-style, direct, friendly, premium-simple",
    )
    length: str = Field(..., description="Length setting: short, medium")
    cta: str = Field(..., description="CTA selection: soft, direct, suggestion-first")
    template_text: str = Field(..., description="Custom template text guidelines")


class PromptTemplateSaveRequest(BaseModel):
    name: str = Field(..., description="Template display name")
    email_type: str = Field("erp", description="website or erp")
    template_text: str = Field(..., description="Prompt template content guidelines")
    version: str = Field("1.0.0", description="Version string")


class PromptGenerateRequest(BaseModel):
    instruction: str = Field(..., description="User instruction on prompt features")
    email_type: str = Field("erp", description="website or erp")


@router.get("", response_model=list[PromptTemplate])
async def read_prompt_templates(owner: dict = Depends(require_owner)):
    """
    Get all prompt templates.
    """
    return get_prompt_templates(owner["id"])


@router.get("/active", response_model=Optional[PromptTemplate])
async def read_active_template(
    email_type: str = Query(
        "erp", description="Filter active template by type: website or erp"
    ),
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
    payload: PromptTemplateSaveRequest, owner: dict = Depends(require_owner)
):
    """
    Save or update prompt template guidelines.
    Deactivates other templates of the same email_type, setting this template as active.
    """
    # Check if there is an active template we should replace/deactivate
    existing_active = get_active_template(owner["id"], payload.email_type.lower())

    if existing_active:
        # Deactivate existing active
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
        raise HTTPException(
            status_code=500, detail="Failed to create/save prompt template."
        )
    return PromptTemplate(**res)


@router.post("/test")
async def test_prompt_simulation(
    payload: PromptTestRequest, owner: dict = Depends(require_owner)
):
    """
    Simulates email generation using custom templates, tone, and CTA styles on a target lead.
    Does not save drafts to database.
    """
    # 1. Fetch Lead
    lead = get_lead(payload.lead_id)
    if not lead or lead.get("user_id") != owner["id"]:
        # Fallback lead if a mock ID was passed or lead belongs to another user
        lead = {
            "company_name": "Apex Roofing Solutions",
            "website": "apex-roofing-mock.com",
            "erp_approach": "centralized job scheduling, subcontractor tracking",
        }

    # Signature structure from database settings
    from app.routes.settings import get_owner_settings_sync
    owner_settings = get_owner_settings_sync(owner["id"])
    sender_name = owner_settings.get("sender_name") or settings.YOUR_NAME
    agency = owner_settings.get("business_name") or settings.YOUR_AGENCY_NAME
    site = owner_settings.get("website") or settings.YOUR_WEBSITE
    phone = owner_settings.get("sender_phone") or settings.YOUR_PHONE
    
    if owner_settings.get("default_signature"):
        signature_str = owner_settings["default_signature"]
    else:
        sig_parts = [sender_name, agency, site]
        if phone and phone.strip():
            sig_parts.append(phone.strip())
        signature_str = " | ".join(sig_parts)

    # 2. Build template text replacements
    website = lead.get("website") or ""
    company = lead.get("company_name") or website.split(".")[0].capitalize()

    compiled_text = (
        payload.template_text.replace("{website}", website)
        .replace("{erp_approach}", lead.get("erp_approach") or "")
        .replace("{YOUR_AGENCY_NAME}", agency)
        .replace("{signature}", signature_str)
    )

    # 3. Add instructions based on tone, length, CTA
    tone_inst = ""
    if payload.tone == "founder-style":
        tone_inst = (
            "Write like an experienced builder providing a realistic workflow critique."
        )
    elif payload.tone == "direct":
        tone_inst = "Write in a direct, practical operational tone."
    elif payload.tone == "friendly":
        tone_inst = "Write in a warm, consultative operational efficiency tone."
    else:
        tone_inst = "Write in a clean, minimal, high-end software agency founder tone."

    word_bounds = "60-90 words" if payload.length == "short" else "80-120 words"

    cta_inst = ""
    if payload.cta == "suggestion-first":
        cta_inst = "End with a short suggestion-first call to action (e.g. asking if they want to review a workflow draft)."
    elif payload.cta == "direct":
        cta_inst = "End with a direct call to action for a brief chat."
    else:
        cta_inst = "End with a soft call to action asking if they are looking into scheduling upgrades."

    banned_inst = prompt_service.get_banned_phrases_instruction()

    prompt = f"""
{tone_inst}

TASK DIRECTIVES:
{compiled_text}

COMPLIANCE RULES:
- Length: STRICTLY {word_bounds} only.
- Length bounds: Max 3 paragraphs.
- No generic sales openings or email fluff.
{cta_inst}
{banned_inst}

Signature (copy exactly at the end):
{signature_str}

RETURN FORMAT:
You must output exactly this format with nothing else:
SUBJECT: [Clean 3-5 word subject line, no quotes]
BODY:
[Email content paragraphs]
[Signature]
""".strip()

    # 4. Generate content via Gemini
    try:
        res = gemini_service.generate_email_content(prompt, user_id=owner["id"])
        subject = res["subject"]
        body = res["body"]
        model_used = res["model_used"]
    except Exception as e:
        logger.error(f"Test Gemini generation failed: {e}")
        # Fallback mock template content
        subject = f"Operational efficiency suggestions for {company}"
        body = f"Hello Team,\n\nManaging construction spreadsheets manually can cause duplication. For {company}, we recommend custom modules like job costing ledgers and subcontractor tracking portals.\n\nBest Regards,\n{signature_str}"
        model_used = "fallback-static"

    # 5. Evaluate and clean with Quality Service
    eval_res = quality_service.evaluate_draft(subject, body, "erp", lead)

    return {
        "subject": eval_res["subject"],
        "body": eval_res["body"],
        "model_used": model_used,
        "warnings": eval_res["warnings"],
        "scores": eval_res["scores"],
    }


@router.post("/generate-template")
async def generate_prompt_template_endpoint(
    payload: PromptGenerateRequest, owner: dict = Depends(require_owner)
):
    """
    Generate a prompt template using Gemini AI based on user guidelines.
    """
    prompt = f"""
You are an expert prompt engineer. The user wants to write a template prompt for a cold email campaign.
The campaign type is 'erp' (custom ERP software proposals based on website and ERP approach).

The prompt template MUST use the following variables exactly:
- `{{website}}` for the lead's website
- `{{erp_approach}}` for the ERP approach modules (ERP painpoints)
- `{{YOUR_AGENCY_NAME}}` for the agency name
- `{{signature}}` for the signature block

User Instruction: {payload.instruction}

Write a clean, direct prompt template that can be used directly as a prompt for Gemini to write the actual emails.
Do not output anything else. Just the raw template content.
"""
    try:
        generated_template = gemini_service.generate_prompt_text(prompt)
        return {"template_text": generated_template}
    except Exception as e:
        logger.error(f"Failed to generate prompt template: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to generate prompt template: {e}"
        )
