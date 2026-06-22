from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class CampaignBase(BaseModel):
    name: str = Field(..., description="The outbound campaign name identifier")
    campaign_type: str = Field("mixed", description="Pitch type boundaries: website, erp, or mixed")
    status: str = Field("active", description="Campaign run status: active, paused, or completed")
    daily_send_limit: int = Field(50, description="Maximum emails dispatched per 24 hours")
    delay_seconds: int = Field(5, description="Inter-send pause interval")

class CampaignCreate(CampaignBase):
    user_id: str = Field(..., description="User owner reference id")

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    campaign_type: Optional[str] = None
    status: Optional[str] = None
    daily_send_limit: Optional[int] = None
    delay_seconds: Optional[int] = None

class Campaign(CampaignBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }
