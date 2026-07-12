from datetime import datetime
from typing import Any, Dict, List, Optional
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
    preset: Optional[str] = None
    objective: Optional[str] = None
    description: Optional[str] = None
    offer: Optional[str] = None
    value_proposition: Optional[str] = None
    proof_points: Optional[str] = None
    required_facts: Optional[str] = None
    prohibited_claims: Optional[str] = None
    target_industry: Optional[str] = None
    target_roles: Optional[str] = None
    countries: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    min_lead_fit_score: int = 0
    selected_leads: List[str] = Field(default_factory=list)
    tone: Optional[str] = None
    email_length: str = "medium"
    language: str = "en"
    CTA: Optional[str] = None
    required_content: List[str] = Field(default_factory=list)
    banned_content: List[str] = Field(default_factory=list)
    prompt_template_id: Optional[str] = None
    sequence_id: Optional[str] = None
    timezone: str = "UTC"
    send_spacing_seconds: int = 60
    sending_window_start: str = "09:00"
    sending_window_end: str = "17:00"
    start_date: Optional[str] = None
    approval_mode: str = "manual"
    sender_profile_snapshot: Dict[str, Any] = Field(default_factory=dict)
    prompt_config_snapshot: Dict[str, Any] = Field(default_factory=dict)
    cloned_from_id: Optional[str] = None

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
    name: Optional[str] = None
    campaign_type: Optional[str] = None
    status: Optional[CampaignStatus] = None
    daily_send_limit: Optional[int] = None
    delay_seconds: Optional[int] = None
    
    preset: Optional[str] = None
    objective: Optional[str] = None
    description: Optional[str] = None
    offer: Optional[str] = None
    value_proposition: Optional[str] = None
    proof_points: Optional[str] = None
    required_facts: Optional[str] = None
    prohibited_claims: Optional[str] = None
    target_industry: Optional[str] = None
    target_roles: Optional[str] = None
    countries: Optional[str] = None
    tags: Optional[List[str]] = None
    min_lead_fit_score: Optional[int] = None
    selected_leads: Optional[List[str]] = None
    tone: Optional[str] = None
    email_length: Optional[str] = None
    language: Optional[str] = None
    CTA: Optional[str] = None
    required_content: Optional[List[str]] = None
    banned_content: Optional[List[str]] = None
    prompt_template_id: Optional[str] = None
    sequence_id: Optional[str] = None
    timezone: Optional[str] = None
    send_spacing_seconds: Optional[int] = None
    sending_window_start: Optional[str] = None
    sending_window_end: Optional[str] = None
    start_date: Optional[str] = None
    approval_mode: Optional[str] = None
    sender_profile_snapshot: Optional[Dict[str, Any]] = None
    prompt_config_snapshot: Optional[Dict[str, Any]] = None
    cloned_from_id: Optional[str] = None


class Campaign(CampaignBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
