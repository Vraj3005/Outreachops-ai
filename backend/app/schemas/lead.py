from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

class LeadBase(BaseModel):
    company_name: Optional[str] = Field(None, description="The prospect company name")
    website: str = Field(..., description="Target business URL")
    industry: Optional[str] = Field(None, description="Business vertical/sector")
    country: Optional[str] = Field(None, description="Target company country")
    city: Optional[str] = Field(None, description="Target company city")
    contact_email: Optional[str] = Field(None, description="Contact email address")
    phone: Optional[str] = Field(None, description="Business phone number")
    website_pain_points: Optional[str] = Field(None, description="Identified website errors/pain points")
    erp_approach: Optional[str] = Field(None, description="ERP module custom recommendation pitch")
    lead_status: str = Field("Pending", description="Ingestion pipeline state")
    source_sheet_name: Optional[str] = Field(None, description="Origin sheet title")
    source_row_number: Optional[str] = Field(None, description="Origin row index")

class LeadCreate(LeadBase):
    user_id: str = Field(..., description="User owner reference id")

class LeadUpdate(BaseModel):
    company_name: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    website_pain_points: Optional[str] = None
    erp_approach: Optional[str] = None
    lead_status: Optional[str] = None
    source_sheet_name: Optional[str] = None
    source_row_number: Optional[str] = None

class Lead(LeadBase):
    id: str
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True
    }
