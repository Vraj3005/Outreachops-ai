from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, model_validator

from app.models.constants import CampaignStatus


class CampaignBase(BaseModel):
    name: str = Field(..., description="The outbound campaign name identifier")
    campaign_type: str = Field(
        "generic", description="Pitch type boundaries: legacy or generic"
    )
    status: CampaignStatus = Field(
        CampaignStatus.ACTIVE,
        description="Campaign run status: active, paused, or completed",
    )
    daily_send_limit: int = Field(
        50, description="Maximum emails dispatched per 24 hours"
    )
    delay_seconds: int = Field(5, description="Inter-send pause interval")

    # Generic campaign configurations
    preset: str | None = None
    objective: str | None = None
    description: str | None = None
    offer: str | None = None
    value_proposition: str | None = None
    proof_points: str | None = None
    required_facts: str | None = None
    prohibited_claims: str | None = None
    target_industry: str | None = None
    target_roles: str | None = None
    countries: str | None = None
    tags: list[str] = Field(default_factory=list)
    min_lead_fit_score: int = 0
    selected_leads: list[str] = Field(default_factory=list)
    tone: str | None = None
    email_length: str = "medium"
    language: str = "en"
    CTA: str | None = None
    required_content: list[str] = Field(default_factory=list)
    banned_content: list[str] = Field(default_factory=list)
    prompt_template_id: str | None = None
    sequence_id: str | None = None
    timezone: str = "UTC"
    send_spacing_seconds: int = 60
    sending_window_start: str = "09:00"
    sending_window_end: str = "17:00"
    start_date: str | None = None
    approval_mode: str = "manual"
    sender_profile_snapshot: dict[str, Any] = Field(default_factory=dict)
    prompt_config_snapshot: dict[str, Any] = Field(default_factory=dict)
    cloned_from_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def parse_json_strings(cls, data: Any) -> Any:
        if isinstance(data, dict):
            import json

            for key in ["tags", "selected_leads", "required_content", "banned_content"]:
                val = data.get(key)
                if isinstance(val, str):
                    try:
                        data[key] = json.loads(val)
                    except Exception:
                        data[key] = []
            for key in ["sender_profile_snapshot", "prompt_config_snapshot"]:
                val = data.get(key)
                if isinstance(val, str):
                    try:
                        data[key] = json.loads(val)
                    except Exception:
                        data[key] = {}
        return data


class CampaignCreate(CampaignBase):
    user_id: str = Field(..., description="User owner reference id")


class CampaignUpdate(BaseModel):
    name: str | None = None
    campaign_type: str | None = None
    status: CampaignStatus | None = None
    daily_send_limit: int | None = None
    delay_seconds: int | None = None

    preset: str | None = None
    objective: str | None = None
    description: str | None = None
    offer: str | None = None
    value_proposition: str | None = None
    proof_points: str | None = None
    required_facts: str | None = None
    prohibited_claims: str | None = None
    target_industry: str | None = None
    target_roles: str | None = None
    countries: str | None = None
    tags: list[str] | None = None
    min_lead_fit_score: int | None = None
    selected_leads: list[str] | None = None
    tone: str | None = None
    email_length: str | None = None
    language: str | None = None
    CTA: str | None = None
    required_content: list[str] | None = None
    banned_content: list[str] | None = None
    prompt_template_id: str | None = None
    sequence_id: str | None = None
    timezone: str | None = None
    send_spacing_seconds: int | None = None
    sending_window_start: str | None = None
    sending_window_end: str | None = None
    start_date: str | None = None
    approval_mode: str | None = None
    sender_profile_snapshot: dict[str, Any] | None = None
    prompt_config_snapshot: dict[str, Any] | None = None
    cloned_from_id: str | None = None


class Campaign(CampaignBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
