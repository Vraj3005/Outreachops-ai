from datetime import datetime

from pydantic import BaseModel, Field

from app.models.constants import DraftStatus


class EmailDraftBase(BaseModel):
    lead_id: str = Field(..., description="Target lead reference id")
    email_type: str = Field(
        ..., description="Copy category: website, erp, or follow_up"
    )
    subject: str | None = Field(None, description="Email subject line text")
    body: str | None = Field(None, description="Email body copy")
    status: DraftStatus = Field(
        DraftStatus.DRAFT,
        description="Send pipeline status: draft, approved, sent, failed, or rejected",
    )
    ai_model: str | None = Field(None, description="Gemini model description")
    prompt_version: str | None = Field(None, description="Prompt version tracking info")
    quality_score: float | None = Field(
        None, description="AI model general readability evaluation"
    )
    spam_risk_score: float | None = Field(
        None, description="Spam words evaluation index"
    )
    personalization_score: float | None = Field(
        None, description="Lead detail density evaluation"
    )
    clarity_score: float | None = Field(
        None, description="Email target layout clarity evaluation"
    )
    warnings: list[str] | None = Field(
        default=[], description="List of quality warning strings"
    )


class EmailDraftCreate(EmailDraftBase):
    user_id: str = Field(..., description="User owner reference id")


class EmailDraftUpdate(BaseModel):
    subject: str | None = None
    body: str | None = None
    status: DraftStatus | None = None
    ai_model: str | None = None
    prompt_version: str | None = None
    quality_score: float | None = None
    spam_risk_score: float | None = None
    personalization_score: float | None = None
    clarity_score: float | None = None
    warnings: list[str] | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None


class EmailDraft(EmailDraftBase):
    id: str
    user_id: str
    generated_at: datetime | None = None
    approved_at: datetime | None = None
    sent_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
