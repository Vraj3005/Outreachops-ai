from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.models.constants import LeadStatus


class LeadBase(BaseModel):
    first_name: Optional[str] = Field(None, description="The prospect first name")
    last_name: Optional[str] = Field(None, description="The prospect last name")
    full_name: Optional[str] = Field(None, description="The prospect full name")
    company_name: Optional[str] = Field(None, description="The prospect company name")
    job_title: Optional[str] = Field(None, description="Business job title/role")
    website: str = Field(..., description="Target business URL")
    industry: Optional[str] = Field(None, description="Business vertical/sector")
    country: Optional[str] = Field(None, description="Target company country")
    city: Optional[str] = Field(None, description="Target company city")
    contact_email: Optional[str] = Field(None, description="Contact email address")
    phone: Optional[str] = Field(None, description="Business phone number")
    website_pain_points: Optional[str] = Field(None, description="Legacy paint points")
    erp_approach: Optional[str] = Field(None, description="Legacy erp recommendation pitch")
    lead_status: LeadStatus = Field(LeadStatus.PENDING, description="Ingestion pipeline status")
    
    # V2 Generic Outreach additions
    tags: List[str] = Field(default_factory=list, description="Categorization tags")
    custom_fields: Dict[str, Any] = Field(default_factory=dict, description="Arbitrary custom key-value metadata")
    research_summary: Optional[str] = Field(None, description="AI/Manual research summarization")
    research_status: str = Field("unchecked", description="Enrichment research progress state")
    personalization_context: Optional[str] = Field(None, description="Personalized outreach snippet triggers")
    fit_score: Optional[int] = Field(None, description="Company/Lead fit score alignment")
    fit_score_reasons: List[str] = Field(default_factory=list, description="Explainable scoring rules justifications")
    email_validation_status: str = Field("unchecked", description="Email deliverability state status")
    
    source_sheet_name: Optional[str] = Field(None, description="Origin sheet title")
    source_row_number: Optional[str] = Field(None, description="Origin row index")
    source_id: Optional[str] = Field(None, description="Reference to import source")


class LeadCreate(LeadBase):
    user_id: str = Field(..., description="User owner reference id")


class LeadUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    job_title: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    website_pain_points: Optional[str] = None
    erp_approach: Optional[str] = None
    lead_status: Optional[LeadStatus] = None
    
    tags: Optional[List[str]] = None
    custom_fields: Optional[Dict[str, Any]] = None
    research_summary: Optional[str] = None
    research_status: Optional[str] = None
    personalization_context: Optional[str] = None
    fit_score: Optional[int] = None
    fit_score_reasons: Optional[List[str]] = None
    email_validation_status: Optional[str] = None
    
    source_sheet_name: Optional[str] = None
    source_row_number: Optional[str] = None
    source_id: Optional[str] = None


class Lead(LeadBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
