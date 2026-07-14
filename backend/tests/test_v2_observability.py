import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.error_service import (
    OutreachOpsException,
    GmailAuthExpiredError,
    GeminiQuotaError,
    OutreachOpsTimeoutError,
)
from app.utils.logging import redact_data
from app.services.worker_control_service import WorkerControlService
from app.services.website_research_service import resolve_safe_ips


def test_logging_redaction():
    # Test dictionary key redaction
    sensitive_dict = {
        "api_key": "secret-api-key-12345",
        "password": "my-secret-password",
        "token": "oauth-token-xyz",
        "safe_field": "hello world",
        "body": "A" * 150,  # Long email body
    }
    redacted = redact_data(sensitive_dict)
    assert redacted["api_key"] == "[REDACTED]"
    assert redacted["password"] == "[REDACTED]"
    assert redacted["token"] == "[REDACTED]"
    assert redacted["safe_field"] == "hello world"
    assert "[TRUNCATED EMAIL BODY]" in redacted["body"]
    assert len(redacted["body"]) <= 135

    # Test raw string pattern redaction
    raw_str = "Bearer 1234567890abcdef"
    assert redact_data(raw_str) == "Bearer [REDACTED]"

    raw_str_apikey = "my api-key=abc123xyz789qwe456asd123"
    assert redact_data(raw_str_apikey) == "my api_key=[REDACTED]"


def test_error_taxonomy():
    # Check status and error codes
    exc1 = OutreachOpsException("Test general error", status_code=400)
    assert exc1.status_code == 400
    assert exc1.error_code == "INTERNAL_ERROR"

    exc2 = GmailAuthExpiredError("Auth expired")
    assert exc2.status_code == 401
    assert exc2.error_code == "AUTH_EXPIRED"

    exc3 = GeminiQuotaError("Quota exceeded")
    assert exc3.status_code == 429
    assert exc3.error_code == "QUOTA_EXCEEDED"

    exc4 = OutreachOpsTimeoutError("Timed out")
    assert exc4.status_code == 504
    assert exc4.error_code == "TIMEOUT"


def test_worker_control_service(monkeypatch):
    # Mock settings sync
    mock_settings = {
        "generation_worker_paused": 1,
        "sending_worker_paused": 0,
        "queue_drain_enabled": 1,
    }

    def mock_get_settings(owner_id):
        return mock_settings

    monkeypatch.setattr(
        "app.services.worker_control_service.get_owner_settings_sync",
        mock_get_settings,
    )

    controls = WorkerControlService.get_controls("test-owner-id")
    assert controls["generation_worker_paused"] is True
    assert controls["sending_worker_paused"] is False
    assert controls["queue_drain_enabled"] is True


def test_dns_resolution_timeout():
    # Verify DNS resolution on standard loopback/localhost doesn't crash
    ips = resolve_safe_ips("localhost")
    assert isinstance(ips, list)

    # Test invalid host
    ips_invalid = resolve_safe_ips("nonexistent-domain-name-testing-dns-timeout-123.com")
    assert ips_invalid == []


def test_public_health_endpoint():
    client = TestClient(app)
    response = client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    # Public endpoint should not contain sensitive fields like 'queues', 'stuck_jobs', or 'controls'
    assert "queues" not in data
    assert "stuck_jobs" not in data
    assert "controls" not in data
