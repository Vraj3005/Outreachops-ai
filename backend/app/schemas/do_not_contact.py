from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class DNCBase(BaseModel):
    email: str = Field(..., description="Opt-out email address to filter out")
    reason: Optional[str] = Field(None, description="Suppression cause details")

class DNCCreate(DNCBase):
    user_id: str = Field(..., description="User owner reference id")

class DNC(DNCBase):
    id: str
    user_id: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
