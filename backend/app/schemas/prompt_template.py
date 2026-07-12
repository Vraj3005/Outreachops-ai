from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class PromptTemplateBase(BaseModel):
    name: str = Field(..., description="Unique template name")
    email_type: str = Field(
        ..., description="Target email copy classification (website/erp)"
    )
    template_text: str = Field(
        ..., description="Prompt guidelines with variable placeholder keys"
    )
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

    model_config = {"from_attributes": True}


# --- Prompt Versioning Schemas ---

class PromptVersionBase(BaseModel):
    template_id: str = Field(..., description="Reference template ID")
    version: str = Field("1.0.0", description="Semantic version string")
    template_text: str = Field(..., description="The raw prompt template text")
    status: str = Field("published", description="Draft or published status")
    description: Optional[str] = Field(None, description="Optional version title/notes")
    changelog: Optional[str] = Field(None, description="Optional release description")
    is_active: bool = Field(True, description="Whether this version is active")


class PromptVersionCreate(PromptVersionBase):
    pass


class PromptVersionUpdate(BaseModel):
    status: Optional[str] = None
    description: Optional[str] = None
    changelog: Optional[str] = None
    is_active: Optional[bool] = None


class PromptVersion(PromptVersionBase):
    id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# --- Prompt Studio Studio Schemas ---

class PromptValidationResponse(BaseModel):
    is_valid: bool = Field(..., description="True if no unbalanced braces or unknown keys exist")
    errors: List[str] = Field(default_factory=list, description="Syntactic verification errors")
    detected_variables: List[str] = Field(default_factory=list, description="Variables parsed in template text")
    unknown_variables: List[str] = Field(default_factory=list, description="Variables not matching namespaces whitelist")
    preview_text: str = Field(..., description="Sample context compilation preview")


class PromptVersionCompareResponse(BaseModel):
    version1: str = Field(..., description="Source version ID or string")
    version2: str = Field(..., description="Target comparison version ID or string")
    diff_lines: List[str] = Field(..., description="Detailed list of diff change lines")
