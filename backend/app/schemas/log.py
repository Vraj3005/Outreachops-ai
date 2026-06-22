from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime

# --- SEND LOGS SCHEMAS ---
class SendLogBase(BaseModel):
    draft_id: Optional[str] = Field(None, description="Linked email draft identifier")
    lead_id: Optional[str] = Field(None, description="Linked recipient lead identifier")
    recipient_email: str = Field(..., description="Prospect email address")
    subject: Optional[str] = Field(None, description="Sent email subject line")
    email_type: Optional[str] = Field(None, description="Copy category (website/erp)")
    status: str = Field(..., description="Send result: sent or failed")
    error_message: Optional[str] = Field(None, description="Trace message if state is failed")
    gmail_message_id: Optional[str] = Field(None, description="Gmail API unique message tracker")

class SendLogCreate(SendLogBase):
    user_id: str = Field(..., description="User owner reference id")

class SendLog(SendLogBase):
    id: str
    user_id: str
    sent_at: datetime

    model_config = {
        "from_attributes": True
    }

# --- ERROR LOGS SCHEMAS ---
class ErrorLogBase(BaseModel):
    source: Optional[str] = Field(None, description="API module source path")
    message: str = Field(..., description="The error message details")
    details: Optional[str] = Field(None, description="Full trace details stack")

class ErrorLogCreate(ErrorLogBase):
    user_id: Optional[str] = Field(None, description="Optionally linked user context")

class ErrorLog(ErrorLogBase):
    id: str
    user_id: Optional[str]
    created_at: datetime

    model_config = {
        "from_attributes": True
    }
