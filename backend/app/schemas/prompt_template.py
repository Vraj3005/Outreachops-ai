from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class PromptTemplateBase(BaseModel):
    name: str = Field(..., description="Unique template name")
    email_type: str = Field(..., description="Target email copy classification (website/erp)")
    template_text: str = Field(..., description="Prompt guidelines with variable placeholder keys")
    version: str = Field("1.0.0", description="Semantic version string")
    is_active: bool = Field(True, description="State of template activation")

class PromptTemplateCreate(PromptTemplateBase):
    user_id: str = Field(..., description="User owner reference id")

class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    email_type: Optional[str] = None
    template_text: Optional[str] = None
    version: Optional[str] = None
    is_active: Optional[bool] = None

class PromptTemplate(PromptTemplateBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }
