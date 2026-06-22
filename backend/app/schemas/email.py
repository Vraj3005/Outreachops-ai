from typing import Optional, List, Union
from pydantic import BaseModel, Field
from datetime import datetime
from decimal import Decimal

class EmailDraftBase(BaseModel):
    lead_id: str = Field(..., description="Target lead reference id")
    email_type: str = Field(..., description="Copy category: website, erp, or follow_up")
    subject: Optional[str] = Field(None, description="Email subject line text")
    body: Optional[str] = Field(None, description="Email body copy")
    status: str = Field("draft", description="Send pipeline status: draft, approved, sent, failed, or rejected")
    ai_model: Optional[str] = Field(None, description="Gemini model description")
    prompt_version: Optional[str] = Field(None, description="Prompt version tracking info")
    quality_score: Optional[float] = Field(None, description="AI model general readability evaluation")
    spam_risk_score: Optional[float] = Field(None, description="Spam words evaluation index")
    personalization_score: Optional[float] = Field(None, description="Lead detail density evaluation")
    clarity_score: Optional[float] = Field(None, description="Email target layout clarity evaluation")
    warnings: Optional[List[str]] = Field(default=[], description="List of quality warning strings")

class EmailDraftCreate(EmailDraftBase):
    user_id: str = Field(..., description="User owner reference id")

class EmailDraftUpdate(BaseModel):
    subject: Optional[str] = None
    body: Optional[str] = None
    status: Optional[str] = None
    ai_model: Optional[str] = None
    prompt_version: Optional[str] = None
    quality_score: Optional[float] = None
    spam_risk_score: Optional[float] = None
    personalization_score: Optional[float] = None
    clarity_score: Optional[float] = None
    warnings: Optional[List[str]] = None
    approved_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None

class EmailDraft(EmailDraftBase):
    id: str
    user_id: str
    generated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }

