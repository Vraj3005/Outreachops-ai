from enum import Enum


class LeadStatus(str, Enum):
    PENDING = "Pending"
    APPROVED = "Approved"
    PROCESSED = "Processed"
    ARCHIVED = "Archived"


class CampaignStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class DraftStatus(str, Enum):
    DRAFT = "draft"
    APPROVED = "approved"
    SENT = "sent"
    FAILED = "failed"
    REJECTED = "rejected"


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SequenceStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED = "completed"


class EventSource(str, Enum):
    SHEETS_IMPORT = "sheets_import"
    DRAFT_GENERATION = "draft_generation"
    EMAIL_DISPATCH = "email_dispatch"
    SYSTEM = "system"


class DataSourceType(str, Enum):
    CSV = "CSV Upload"
    SHEETS = "Google Sheet"
