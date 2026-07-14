import contextvars
import datetime
import json
import logging
import re
import uuid
from typing import Any, Dict

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

# Context variables to propagate structured context fields across execution flow
correlation_id_var = contextvars.ContextVar("correlation_id", default=None)
job_id_var = contextvars.ContextVar("job_id", default=None)
campaign_id_var = contextvars.ContextVar("campaign_id", default=None)
lead_id_var = contextvars.ContextVar("lead_id", default=None)
integration_var = contextvars.ContextVar("integration", default=None)
event_var = contextvars.ContextVar("event", default=None)
safe_error_category_var = contextvars.ContextVar("safe_error_category", default=None)


def set_logging_context(
    correlation_id: str | None = None,
    job_id: str | None = None,
    campaign_id: str | None = None,
    lead_id: str | None = None,
    integration: str | None = None,
    event: str | None = None,
    safe_error_category: str | None = None,
):
    """Sets context variables for structured logging context."""
    if correlation_id is not None:
        correlation_id_var.set(correlation_id)
    if job_id is not None:
        job_id_var.set(job_id)
    if campaign_id is not None:
        campaign_id_var.set(campaign_id)
    if lead_id is not None:
        lead_id_var.set(lead_id)
    if integration is not None:
        integration_var.set(integration)
    if event is not None:
        event_var.set(event)
    if safe_error_category is not None:
        safe_error_category_var.set(safe_error_category)


def clear_logging_context():
    """Clears context variables for structured logging context."""
    correlation_id_var.set(None)
    job_id_var.set(None)
    campaign_id_var.set(None)
    lead_id_var.set(None)
    integration_var.set(None)
    event_var.set(None)
    safe_error_category_var.set(None)


# Match sensitive key fields in dictionaries (case insensitive)
SENSITIVE_KEYS = {
    "token",
    "api_key",
    "apikey",
    "credentials",
    "password",
    "client_secret",
    "secret",
    "access_token",
    "refresh_token",
    "authorization",
    "encrypted_credentials",
}


def redact_data(data: Any) -> Any:
    """
    Recursively redacts sensitive values from dictionaries, lists, and strings.
    """
    if isinstance(data, dict):
        redacted = {}
        for k, v in data.items():
            k_lower = k.lower()
            if any(s in k_lower for s in SENSITIVE_KEYS):
                redacted[k] = "[REDACTED]"
            elif k_lower == "body" and isinstance(v, str) and len(v) > 100:
                redacted[k] = v[:100] + "... [TRUNCATED EMAIL BODY]"
            else:
                redacted[k] = redact_data(v)
        return redacted
    elif isinstance(data, list):
        return [redact_data(item) for item in data]
    elif isinstance(data, str):
        # Redact patterns in raw strings (like Authorization headers or API Keys)
        # Match Bearer token patterns
        data = re.sub(
            r"(?i)bearer\s+[a-zA-Z0-9\-\._~\+\/]+=*", "Bearer [REDACTED]", data
        )
        # Match potential API keys in text (standard format of length > 20 alphanumeric/hyphens)
        data = re.sub(
            r"(?i)api[-_]?key[=:\s]+[a-zA-Z0-9_\-]{20,}", "api_key=[REDACTED]", data
        )
        return data
    return data


class StructuredJSONFormatter(logging.Formatter):
    """
    Serializes logs to standard JSON and automatically embeds dynamic context variables.
    """

    def format(self, record: logging.LogRecord) -> str:
        # Collect dynamic context variable values
        context_data = {
            "correlation_id": correlation_id_var.get(),
            "job_id": job_id_var.get(),
            "campaign_id": campaign_id_var.get(),
            "lead_id": lead_id_var.get(),
            "integration": integration_var.get(),
            "event": event_var.get(),
            "safe_error_category": safe_error_category_var.get(),
        }

        # Build structured log payload
        log_payload = {
            "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_data(record.getMessage()),
        }

        # Add context fields if they are set
        for k, v in context_data.items():
            if v:
                log_payload[k] = v

        # Add error details if they exist in record
        if record.exc_info:
            log_payload["exception"] = self.formatException(record.exc_info)

        # Merge extra fields if present
        if hasattr(record, "extra_fields") and isinstance(record.extra_fields, dict):
            for k, v in record.extra_fields.items():
                log_payload[k] = redact_data(v)

        return json.dumps(log_payload)


class LoggingMiddleware(BaseHTTPMiddleware):
    """
    HTTP Middleware that generates / extracts correlation IDs and populates the logging context.
    """

    async def dispatch(self, request: Request, call_next):
        # Check if Correlation ID header is present, else generate new
        corr_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())

        # Set in logging context
        set_logging_context(correlation_id=corr_id)

        try:
            response = await call_next(request)
            response.headers["X-Correlation-ID"] = corr_id
            return response
        finally:
            clear_logging_context()


def setup_structured_logging():
    """
    Initializes structured logging configuration on stdout and sets default levels.
    """
    root_logger = logging.getLogger()
    
    # Remove existing handlers to avoid duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    # Output to standard output stream
    handler = logging.StreamHandler()
    handler.setFormatter(StructuredJSONFormatter())
    root_logger.addHandler(handler)
    
    # Set default level (INFO) or via settings
    root_logger.setLevel(logging.INFO)
    
    # Suppress verbose loggers from libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("googleapiclient.discovery").setLevel(logging.WARNING)
    logging.getLogger("gspread").setLevel(logging.WARNING)
