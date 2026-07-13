from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator

from app.models.constants import LeadStatus


class LeadBase(BaseModel):
    first_name: str | None = Field(
        None, max_length=250, description="The prospect first name"
    )
    last_name: str | None = Field(
        None, max_length=250, description="The prospect last name"
    )
    full_name: str | None = Field(
        None, max_length=250, description="The prospect full name"
    )
    company_name: str | None = Field(
        None, max_length=250, description="The prospect company name"
    )
    job_title: str | None = Field(
        None, max_length=250, description="Business job title/role"
    )
    website: str = Field(..., max_length=500, description="Target business URL")
    industry: str | None = Field(
        None, max_length=250, description="Business vertical/sector"
    )
    country: str | None = Field(
        None, max_length=250, description="Target company country"
    )
    city: str | None = Field(None, max_length=250, description="Target company city")
    contact_email: str | None = Field(
        None, max_length=250, description="Contact email address"
    )
    phone: str | None = Field(None, max_length=250, description="Business phone number")
    website_pain_points: str | None = Field(
        None, max_length=5000, description="Legacy paint points"
    )
    erp_approach: str | None = Field(
        None, max_length=5000, description="Legacy erp recommendation pitch"
    )
    lead_status: LeadStatus = Field(
        LeadStatus.PENDING, description="Ingestion pipeline status"
    )

    # V2 Generic Outreach additions
    tags: list[str] = Field(default_factory=list, description="Categorization tags")
    custom_fields: dict[str, Any] = Field(
        default_factory=dict, description="Arbitrary custom key-value metadata"
    )
    research_summary: str | None = Field(
        None, max_length=5000, description="AI/Manual research summarization"
    )
    research_status: str = Field(
        "unchecked", max_length=100, description="Enrichment research progress state"
    )
    personalization_context: str | None = Field(
        None, max_length=5000, description="Personalized outreach snippet triggers"
    )
    fit_score: int | None = Field(None, description="Company/Lead fit score alignment")
    fit_score_reasons: list[str] = Field(
        default_factory=list, description="Explainable scoring rules justifications"
    )
    email_validation_status: str = Field(
        "unchecked", max_length=100, description="Email deliverability state status"
    )

    source_sheet_name: str | None = Field(
        None, max_length=250, description="Origin sheet title"
    )
    source_row_number: str | None = Field(
        None, max_length=100, description="Origin row index"
    )
    source_id: str | None = Field(
        None, max_length=250, description="Reference to import source"
    )

    @field_validator("custom_fields")
    @classmethod
    def validate_custom_fields(cls, v: dict[str, Any]) -> dict[str, Any]:
        if not v:
            return v
        if len(v) > 50:
            raise ValueError("Maximum of 50 custom fields allowed")

        def check_depth_and_sizes(d: Any, current_depth: int):
            if current_depth > 2:
                raise ValueError("Nesting depth of custom fields cannot exceed 2")
            if isinstance(d, dict):
                for k, val in d.items():
                    if not isinstance(k, str) or len(k) > 100:
                        raise ValueError(
                            "Custom field key length cannot exceed 100 characters"
                        )
                    if isinstance(val, (dict, list)):
                        check_depth_and_sizes(val, current_depth + 1)
                    elif isinstance(val, str) and len(val) > 5000:
                        raise ValueError(
                            "Custom field string value length cannot exceed 5000 characters"
                        )
            elif isinstance(d, list):
                for val in d:
                    if isinstance(val, (dict, list)):
                        check_depth_and_sizes(val, current_depth + 1)
                    elif isinstance(val, str) and len(val) > 5000:
                        raise ValueError(
                            "Custom field string value length cannot exceed 5000 characters"
                        )

        check_depth_and_sizes(v, 1)
        return v


class LeadCreate(LeadBase):
    user_id: str = Field(..., max_length=250, description="User owner reference id")


class LeadUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=250)
    last_name: str | None = Field(None, max_length=250)
    full_name: str | None = Field(None, max_length=250)
    company_name: str | None = Field(None, max_length=250)
    job_title: str | None = Field(None, max_length=250)
    website: str | None = Field(None, max_length=500)
    industry: str | None = Field(None, max_length=250)
    country: str | None = Field(None, max_length=250)
    city: str | None = Field(None, max_length=250)
    contact_email: str | None = Field(None, max_length=250)
    phone: str | None = Field(None, max_length=250)
    website_pain_points: str | None = Field(None, max_length=5000)
    erp_approach: str | None = Field(None, max_length=5000)
    lead_status: LeadStatus | None = None

    tags: list[str] | None = None
    custom_fields: dict[str, Any] | None = None
    research_summary: str | None = Field(None, max_length=5000)
    research_status: str | None = Field(None, max_length=100)
    personalization_context: str | None = Field(None, max_length=5000)
    fit_score: int | None = None
    fit_score_reasons: list[str] | None = None
    email_validation_status: str | None = Field(None, max_length=100)

    source_sheet_name: str | None = Field(None, max_length=250)
    source_row_number: str | None = Field(None, max_length=100)
    source_id: str | None = Field(None, max_length=250)

    @field_validator("custom_fields")
    @classmethod
    def validate_custom_fields(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is None:
            return v
        return LeadBase.validate_custom_fields(v)


class Lead(LeadBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
