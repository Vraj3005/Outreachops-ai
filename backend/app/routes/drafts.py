import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Path, Query, status
from pydantic import BaseModel, Field

from app.config import settings
from app.schemas.email import EmailDraft, EmailDraftCreate, EmailDraftUpdate
from app.crud.drafts import get_drafts, get_draft, update_draft, approve_draft, reject_draft, check_existing_draft, create_draft
from app.crud.leads import get_lead
from app.crud.prompt_templates import get_active_template
from app.services.gemini_service import GeminiService
from app.services.prompt_service import PromptService
from app.services.email_quality_service import EmailQualityService

logger = logging.getLogger("outreachops.routes.drafts")

router = APIRouter(prefix="/drafts", tags=["drafts"])
gemini_service = GeminiService()
prompt_service = PromptService()
quality_service = EmailQualityService()

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

class DraftGenerateRequest(BaseModel):
    lead_id: str = Field(..., description="The unique UUID of the target lead")
    email_type: str = Field(..., description="Copy category to generate: 'website', 'erp', or 'both'")
    regenerate: bool = Field(False, description="Set to True to overwrite existing drafts")

class DraftRefineRequest(BaseModel):
    action: str = Field(..., description="Refinement action: 'make_shorter', 'make_direct', 'less_salesy', 'change_cta'")
    instructions: Optional[str] = Field(None, description="Custom instruction text if any")

@router.get("", response_model=List[EmailDraft])
async def read_drafts(
    status: Optional[str] = Query(None, description="Filter drafts by status (draft, approved, sent, failed, rejected)"),
    email_type: Optional[str] = Query(None, description="Filter drafts by email type (website, erp, follow_up)"),
    limit: int = Query(100, description="Max drafts to return")
):
    """
    Get email drafts queue with optional filters.
    """
    return get_drafts(user_id=DEMO_USER_ID, status=status, email_type=email_type, limit=limit)

@router.post("/generate", response_model=List[EmailDraft], status_code=status.HTTP_201_CREATED)
async def generate_drafts(payload: DraftGenerateRequest):
    """
    Generate ERP email drafts for a lead using Gemini API.
    """
    lead_id = payload.lead_id
    regenerate = payload.regenerate

    # 1. Fetch Lead Details
    lead = get_lead(lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead '{lead_id}' not found.")

    # 2. Check for Contact Email
    contact_email = lead.get("contact_email") or ""
    if not contact_email.strip():
        raise HTTPException(
            status_code=400,
            detail="Cannot generate drafts. Recipient contact_email is missing on the lead record."
        )

    # 3. Check for ERP parameters (ERP painpoints)
    erp_approach = lead.get("erp_approach") or ""
    if not erp_approach.strip():
        raise HTTPException(
            status_code=400,
            detail="Cannot generate ERP email: ERP painpoints are not available on the lead record."
        )

    # 4. Check Duplicates (only erp type)
    existing = check_existing_draft(lead_id, "erp")
    if existing and not regenerate:
        logger.info(f"ERP Draft already exists for lead {lead_id}. Skipping since regenerate=False.")
        return [EmailDraft(**existing)]

    generated_drafts = []

    # Signature structure from settings
    sender_name = settings.YOUR_NAME
    agency = settings.YOUR_AGENCY_NAME
    site = settings.YOUR_WEBSITE
    phone = settings.YOUR_PHONE
    sig_parts = [sender_name, agency, site]
    if phone and phone.strip():
        sig_parts.append(phone.strip())
    signature_str = " | ".join(sig_parts)

    website = lead.get("website") or ""
    company = lead.get("company_name") or website.split(".")[0].capitalize()
    
    # Load active template if exists
    active_template = get_active_template(user_id=DEMO_USER_ID, email_type="erp")
    
    if active_template:
        template_text = active_template["template_text"]
        compiled_text = template_text.replace("{website}", website)\
                                     .replace("{erp_approach}", erp_approach)\
                                     .replace("{YOUR_AGENCY_NAME}", agency)\
                                     .replace("{signature}", signature_str)
        
        banned_inst = prompt_service.get_banned_phrases_instruction()
        word_bounds = "60-90 words"
        
        prompt = f"""
{compiled_text}

COMPLIANCE RULES:
- Length: STRICTLY {word_bounds} only.
- Length bounds: Max 3 paragraphs.
- No generic opener (never use "I hope you are well", etc.).
- Never over-explain or make fake claims.
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
        prompt_ver = active_template.get("version") or "1.0.0"
    else:
        prompt = prompt_service.build_erp_prompt(
            website=website,
            erp_approach=erp_approach,
            tone="premium-simple",
            length="short",
            cta="suggestion-first",
            signature=signature_str
        )
        prompt_ver = "1.0.0"

    subject = f"Operational efficiency suggestions for {company}"
    body = f"Hello {company} team,\n\nWe analyzed your operations..."
    model_used = settings.gemini_models[0] if settings.gemini_models else "gemini-3.1-flash-lite"

    # Call Gemini API
    try:
        res = gemini_service.generate_email_content(prompt)
        subject = res["subject"]
        body = res["body"]
        model_used = res["model_used"]
    except Exception as e:
        logger.error(f"Gemini API generation failed, falling back to static draft: {e}")
        subject = f"Operational efficiency suggestions for {company}"
        body = f"Hello Team,\n\nManaging construction spreadsheets manually can cause duplication. For {company}, we recommend custom modules like job costing ledgers and subcontractor tracking portals.\n\nBest Regards,\n{signature_str}"

    # Evaluate copy quality & clean up using EmailQualityService
    eval_res = quality_service.evaluate_draft(subject, body, "erp", lead)
    cleaned_sub = eval_res["subject"]
    cleaned_body = eval_res["body"]
    warnings_list = eval_res["warnings"]
    scores = eval_res["scores"]

    # Create/Update Payload
    draft_payload = {
        "lead_id": lead_id,
        "user_id": DEMO_USER_ID,
        "email_type": "erp",
        "subject": cleaned_sub,
        "body": cleaned_body,
        "status": "draft",
        "ai_model": model_used,
        "prompt_version": prompt_ver,
        "quality_score": scores["quality_score"],
        "spam_risk_score": scores["spam_risk_score"],
        "personalization_score": scores["personalization_score"],
        "clarity_score": scores["clarity_score"],
        "warnings": warnings_list
    }

    if existing and regenerate:
        update_payload = EmailDraftUpdate(**draft_payload)
        res = update_draft(existing["id"], update_payload)
        if res:
            generated_drafts.append(EmailDraft(**res))
    else:
        create_payload = EmailDraftCreate(**draft_payload)
        res = create_draft(create_payload)
        if res:
            generated_drafts.append(EmailDraft(**res))

    return generated_drafts

@router.patch("/{id}", response_model=EmailDraft)
async def update_draft_endpoint(
    id: str = Path(..., description="The unique UUID of the email draft"),
    payload: EmailDraftUpdate = None
):
    """
    Update email draft details manually.
    Recalculates quality scores and warnings on the updated copy.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required")
        
    draft = get_draft(id)
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft '{id}' not found.")
        
    # Recalculate quality metrics if subject or body is updated
    if payload.subject is not None or payload.body is not None:
        lead = get_lead(draft["lead_id"])
        if lead:
            sub = payload.subject if payload.subject is not None else draft["subject"]
            body = payload.body if payload.body is not None else draft["body"]
            
            eval_res = quality_service.evaluate_draft(sub, body, draft["email_type"], lead)
            
            payload.subject = eval_res["subject"]
            payload.body = eval_res["body"]
            payload.quality_score = eval_res["scores"]["quality_score"]
            payload.spam_risk_score = eval_res["scores"]["spam_risk_score"]
            payload.personalization_score = eval_res["scores"]["personalization_score"]
            payload.clarity_score = eval_res["scores"]["clarity_score"]
            payload.warnings = eval_res["warnings"]
            
    res = update_draft(id, payload)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to update email draft.")
    return EmailDraft(**res)

@router.post("/approve-all", status_code=200)
async def approve_all_drafts_endpoint():
    """
    Approve all pending email drafts in the queue.
    """
    if not supabase:
        raise HTTPException(status_code=500, detail="Database client is offline.")
    try:
        # Fetch all drafts that are pending/draft status
        res = supabase.table("email_drafts").select("id").eq("user_id", DEMO_USER_ID).eq("status", "draft").execute()
        draft_ids = [d["id"] for d in res.data] if res.data else []
        
        count = 0
        for draft_id in draft_ids:
            approve_draft(draft_id)
            count += 1
            
        return {"approved_count": count, "message": f"Successfully approved {count} drafts."}
    except Exception as e:
        logger.error(f"Error approving all drafts: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{id}/approve", response_model=EmailDraft)
async def approve_draft_endpoint(
    id: str = Path(..., description="The unique UUID of the email draft to approve")
):
    """
    Approve an email draft.
    """
    res = approve_draft(id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Draft '{id}' not found or approval failed.")
    return EmailDraft(**res)

@router.post("/{id}/reject", response_model=EmailDraft)
async def reject_draft_endpoint(
    id: str = Path(..., description="The unique UUID of the email draft to reject")
):
    """
    Reject an email draft.
    """
    res = reject_draft(id)
    if not res:
        raise HTTPException(status_code=404, detail=f"Draft '{id}' not found or reject failed.")
    return EmailDraft(**res)

@router.post("/{id}/refine", response_model=EmailDraft)
async def refine_draft_endpoint(
    id: str = Path(..., description="The unique UUID of the target email draft"),
    payload: DraftRefineRequest = None
):
    """
    Refine an existing email draft using Gemini API based on a specific action.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="Payload is required")
        
    # 1. Fetch Draft Details
    draft = get_draft(id)
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft '{id}' not found.")
        
    # 2. Fetch Lead Details
    lead = get_lead(draft["lead_id"])
    if not lead:
        raise HTTPException(status_code=404, detail=f"Lead '{draft['lead_id']}' not found.")

    # 3. Create instruction modifier based on action
    action = payload.action.lower()
    custom_inst = payload.instructions or ""
    
    action_prompt = ""
    if action == "make_shorter":
        action_prompt = "Rewrite the email to make it shorter and more concise (reduce word count by 15-20 words). Ensure it remains extremely punchy."
    elif action == "make_direct":
        action_prompt = "Make the tone extremely direct, brief, and punchy. Remove any polite padding or generic introductions. Get straight to the business improvement suggestion."
    elif action == "less_salesy":
        action_prompt = "Make the email sound less salesy/pitchy. Write like a real person, a technical builder offering a suggestion rather than a marketing agency pitching a service."
    elif action == "change_cta":
        action_prompt = "Change the call to action (CTA) at the end. Use a soft, suggestion-first CTA asking if they'd be open to reviewing a custom mockup or a brief analysis."
    else:
        raise HTTPException(status_code=400, detail=f"Invalid action '{action}'. Select 'make_shorter', 'make_direct', 'less_salesy', or 'change_cta'.")

    if custom_inst.strip():
        action_prompt += f"\nAdditional custom instruction: {custom_inst}"

    # 4. Construct refinement prompt
    prompt = f"""
You are a senior outreach copywriter. Your task is to rewrite/refine the following cold email draft.

CURRENT EMAIL DETAILS:
Subject: {draft.get("subject")}
Body:
{draft.get("body")}

REFINEMENT INSTRUCTIONS:
{action_prompt}

COMPLIANCE RULES:
- Do NOT use any banned phrases (e.g. "I hope you are well", "friction", "bottleneck", "streamline").
- Keep the signature exactly as it is.
- Ensure formatting remains clean.

RETURN FORMAT:
You must output exactly this format with nothing else:
SUBJECT: [Refined subject]
BODY:
[Refined email body paragraphs]
[Signature]
""".strip()

    # 5. Call Gemini API
    model_used = draft.get("ai_model") or "gemini-3.1-flash-lite"
    try:
        res = gemini_service.generate_email_content(prompt)
        refined_subject = res["subject"]
        refined_body = res["body"]
        model_used = res["model_used"]
    except Exception as e:
        logger.error(f"Gemini refinement failed: {e}")
        raise HTTPException(
            status_code=502,
            detail=f"Gemini API failed to refine draft: {str(e)}"
        )

    # 6. Evaluate and clean the refined copy
    eval_res = quality_service.evaluate_draft(refined_subject, refined_body, draft["email_type"], lead)
    
    # 7. Update draft in database
    update_payload = EmailDraftUpdate(
        subject=eval_res["subject"],
        body=eval_res["body"],
        ai_model=model_used,
        quality_score=eval_res["scores"]["quality_score"],
        spam_risk_score=eval_res["scores"]["spam_risk_score"],
        personalization_score=eval_res["scores"]["personalization_score"],
        clarity_score=eval_res["scores"]["clarity_score"],
        warnings=eval_res["warnings"]
    )
    
    updated = update_draft(id, update_payload)
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to save refined draft in database.")
        
    return EmailDraft(**updated)

@router.post("/{id}/send", response_model=EmailDraft)
async def send_draft_endpoint(
    id: str = Path(..., description="The unique UUID of the email draft to send immediately")
):
    """
    Sends an individual email draft immediately via Gmail API.
    Enforces DNC list, daily send limit, valid recipient email, and approved status constraints.
    """
    from app.services.gmail_service import GmailService
    from app.services.rate_limit_service import RateLimitService
    from app.database import supabase
    
    gmail_service = GmailService()
    rate_limit_service = RateLimitService()

    # 1. Fetch Draft Details
    draft = get_draft(id)
    if not draft:
        raise HTTPException(status_code=404, detail=f"Draft '{id}' not found.")
        
    # 2. Safety Rule: Only approved drafts can be sent.
    if draft.get("status") != "approved":
        raise HTTPException(
            status_code=400,
            detail=f"Only approved drafts can be sent. Current status is '{draft.get('status')}'."
        )
        
    # 3. Fetch Lead Details
    lead = get_lead(draft["lead_id"])
    if not lead:
        raise HTTPException(status_code=404, detail="Associated lead not found.")
        
    recipient_email = lead.get("contact_email") or ""
    if not recipient_email.strip() or not gmail_service.is_valid_email(recipient_email):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot send email. Recipient contact email '{recipient_email}' is missing or invalid."
        )

    # 4. Check Do Not Contact List
    if supabase:
        dnc_check = supabase.table("do_not_contact").select("id") \
            .eq("user_id", DEMO_USER_ID) \
            .eq("email", recipient_email.strip().lower()) \
            .execute()
        if dnc_check.data:
            # Move draft back to rejected status because they're on DNC list
            update_draft(id, EmailDraftUpdate(status="rejected", last_error="Blocked by Do Not Contact (DNC) list"))
            raise HTTPException(
                status_code=400,
                detail="Cannot send email. Recipient email is listed on the Do Not Contact (DNC) list."
            )

    # 5. Check Daily Limit
    if not rate_limit_service.check_daily_limit(user_id=DEMO_USER_ID):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Daily campaign send limit cap has been hit."
        )

    # 6. Check Double Outreach Limit
    if not rate_limit_service.check_double_email_limit(lead_id=draft["lead_id"]):
        raise HTTPException(
            status_code=400,
            detail="An email was already sent to this lead today. Double outreach is blocked by default."
        )

    # 7. Dispatch email via Gmail
    res = gmail_service.send_approved_email(draft_id=id, user_id=DEMO_USER_ID)
    if res.get("status") == "success":
        # Refetch sent draft to return
        sent_draft = get_draft(id)
        if sent_draft:
            return EmailDraft(**sent_draft)
        raise HTTPException(status_code=500, detail="Send succeeded but draft details could not be retrieved.")
    else:
        err_msg = res.get("error") or "Unknown dispatch error"
        raise HTTPException(
            status_code=500,
            detail=f"Gmail API transmission failed: {err_msg}"
        )

