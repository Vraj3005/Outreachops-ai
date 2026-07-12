from datetime import datetime

from pydantic import BaseModel, Field


class UserBase(BaseModel):
    email: str = Field(..., description="User unique email address")
    full_name: str | None = Field(None, description="User full name")


class UserCreate(UserBase):
    pass


class User(UserBase):
    id: str
    created_at: datetime

    model_config = {"from_attributes": True}
