from datetime import datetime

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
    name: str | None = None
    email_type: str | None = None
    template_text: str | None = None
    version: str | None = None
    is_active: bool | None = None


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
    description: str | None = Field(None, description="Optional version title/notes")
    changelog: str | None = Field(None, description="Optional release description")
    is_active: bool = Field(True, description="Whether this version is active")


class PromptVersionCreate(PromptVersionBase):
    pass


class PromptVersionUpdate(BaseModel):
    status: str | None = None
    description: str | None = None
    changelog: str | None = None
    is_active: bool | None = None


class PromptVersion(PromptVersionBase):
    id: str
    created_at: datetime
    updated_at: datetime | None = None

    model_config = {"from_attributes": True}


# --- Prompt Studio Studio Schemas ---


class PromptValidationResponse(BaseModel):
    is_valid: bool = Field(
        ..., description="True if no unbalanced braces or unknown keys exist"
    )
    errors: list[str] = Field(
        default_factory=list, description="Syntactic verification errors"
    )
    detected_variables: list[str] = Field(
        default_factory=list, description="Variables parsed in template text"
    )
    unknown_variables: list[str] = Field(
        default_factory=list, description="Variables not matching namespaces whitelist"
    )
    preview_text: str = Field(..., description="Sample context compilation preview")


class PromptVersionCompareResponse(BaseModel):
    version1: str = Field(..., description="Source version ID or string")
    version2: str = Field(..., description="Target comparison version ID or string")
    diff_lines: list[str] = Field(..., description="Detailed list of diff change lines")
