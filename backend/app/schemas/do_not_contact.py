from datetime import datetime

from pydantic import BaseModel, Field


class DNCBase(BaseModel):
    email: str = Field(..., description="Opt-out email address to filter out")
    reason: str | None = Field(None, description="Suppression cause details")


class DNCCreate(DNCBase):
    user_id: str = Field(..., description="User owner reference id")


class DNC(DNCBase):
    id: str
    user_id: str
    created_at: datetime

    model_config = {"from_attributes": True}
