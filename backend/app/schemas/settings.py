import re

from pydantic import BaseModel, Field, model_validator


class OwnerSettingsBase(BaseModel):
    business_name: str | None = Field(None, max_length=150)
    website: str | None = Field(None, max_length=255)
    sender_name: str | None = Field(None, max_length=100)
    sender_email: str | None = None
    sender_phone: str | None = None
    default_signature: str | None = None
    brand_voice: str | None = None
    offer_description: str | None = None
    default_target_audience: str | None = None
    default_tone: str | None = Field(None, max_length=50)
    default_cta: str | None = None
    default_language: str = Field("en", max_length=10)
    timezone: str = Field("UTC", max_length=50)
    daily_send_limit: int = Field(50, ge=1, le=1000)
    minimum_send_spacing_seconds: int = Field(60, ge=5, le=3600)
    allowed_send_start: str = Field("09:00")
    allowed_send_end: str = Field("17:00")
    required_footer: str | None = None
    banned_phrases: list[str] = Field(default_factory=list)
    generation_worker_paused: bool = False
    sending_worker_paused: bool = False
    queue_drain_enabled: bool = False

    @model_validator(mode="after")
    def validate_hours_and_domain(self) -> "OwnerSettingsBase":
        time_pattern = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")
        if not time_pattern.match(self.allowed_send_start):
            raise ValueError("allowed_send_start must be in valid 24hr HH:MM format")
        if not time_pattern.match(self.allowed_send_end):
            raise ValueError("allowed_send_end must be in valid 24hr HH:MM format")
        if self.sender_email:
            email_pattern = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
            if not email_pattern.match(self.sender_email.strip()):
                raise ValueError("sender_email must be a valid email address format")
        return self


class OwnerSettingsCreate(OwnerSettingsBase):
    pass


class OwnerSettingsUpdate(OwnerSettingsBase):
    pass


class OwnerSettingsResponse(OwnerSettingsBase):
    owner_id: str
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True
