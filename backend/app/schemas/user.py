from typing import Optional
from pydantic import BaseModel, EmailStr, Field
from datetime import datetime

class UserBase(BaseModel):
    email: str = Field(..., description="User unique email address")
    full_name: Optional[str] = Field(None, description="User full name")

class UserCreate(UserBase):
    pass

class User(UserBase):
    id: str
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
