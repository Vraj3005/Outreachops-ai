import pytest
from pydantic import ValidationError

from app.database import SQLiteQueryBuilder, supabase
from app.schemas.lead import LeadCreate
from app.services.rate_limit_service import RateLimitService
from app.services.audit_log_service import AuditLogService


# --- 1. SQL Injection Identification & Injection Prevention Tests ---

def test_sql_injection_validation():
    import sqlite3

    # SQLiteQueryBuilder table validation
    builder = SQLiteQueryBuilder("dummy_db.db", "leads; DROP TABLE leads; --")
    with pytest.raises(ValueError, match="Invalid database identifier"):
        builder.execute()

    # Filter column validation
    builder = SQLiteQueryBuilder("dummy_db.db", "leads")
    builder.eq("id; DROP TABLE leads; --", "val")
    with pytest.raises(ValueError, match="Invalid database identifier"):
        builder.execute()

    # Sort column validation
    builder = SQLiteQueryBuilder("dummy_db.db", "leads")
    # Manually append an invalid column name to orders to test execution check
    builder.orders.append(("first_name; DELETE FROM leads;", "ASC"))
    with pytest.raises(ValueError, match="Invalid database identifier"):
        builder.execute()

    # Sort direction validation
    builder = SQLiteQueryBuilder("dummy_db.db", "leads")
    # Manually append an invalid direction to orders
    builder.orders.append(("first_name", "INVALID_DIR"))
    with pytest.raises(ValueError, match="Invalid sorting direction"):
        builder.execute()

    # Valid execution should bypass ValueError and attempt database query, raising OperationalError
    builder = SQLiteQueryBuilder("dummy_db.db", "leads")
    builder.eq("first_name", "test")
    with pytest.raises(sqlite3.OperationalError):
        builder.execute()


# --- 2. Input Validation Schema & Custom Fields Restrictions Tests ---

def test_lead_custom_fields_validation():
    # Normal custom fields should pass
    valid_lead = LeadCreate(
        website="http://example.com",
        custom_fields={"industry_segment": "Roofing", "details": {"employees": 15}},
        user_id="test-owner-id"
    )
    assert valid_lead.custom_fields["industry_segment"] == "Roofing"

    # Too many custom fields (>50) should fail
    too_many = {f"field_{i}": "val" for i in range(55)}
    with pytest.raises(ValidationError, match="Maximum of 50 custom fields allowed"):
        LeadCreate(website="http://example.com", custom_fields=too_many, user_id="test-owner-id")

    # Too nested (>2 levels deep) should fail
    nested = {"level1": {"level2": {"level3": "val"}}}
    with pytest.raises(ValidationError, match="Nesting depth of custom fields cannot exceed 2"):
        LeadCreate(website="http://example.com", custom_fields=nested, user_id="test-owner-id")

    # Key length exceeded (>100 characters) should fail
    long_key = {"a" * 105: "val"}
    with pytest.raises(ValidationError, match="Custom field key length cannot exceed 100 characters"):
        LeadCreate(website="http://example.com", custom_fields=long_key, user_id="test-owner-id")

    # Value length exceeded (>5000 characters) should fail
    long_val = {"field": "a" * 5005}
    with pytest.raises(ValidationError, match="Custom field string value length cannot exceed 5000 characters"):
        LeadCreate(website="http://example.com", custom_fields=long_val, user_id="test-owner-id")


# --- 3. Rate Limiting System & Fallback Engine Tests ---

def test_rate_limiter_service():
    limiter = RateLimitService()
    key = "test_rate_limit_key_sec"

    # Clean previous limits for test isolation
    if supabase:
        try:
            supabase.table("rate_limits").delete().eq("key", key).execute()
        except Exception:
            pass

    # First 3 requests should pass
    for _ in range(3):
        res = limiter.is_rate_limited(key, max_requests=3, window_seconds=5)
        assert res is False

    # 4th request should fail (rate-limited)
    res = limiter.is_rate_limited(key, max_requests=3, window_seconds=5)
    assert res is True


# --- 4. Security Audit Trail Verification Tests ---

def test_audit_log_service():
    # Delete previous test records for clean assertions
    if supabase:
        try:
            supabase.table("security_audit_logs").delete().eq("user_id", "test-owner-id-audit").execute()
        except Exception:
            pass

    # Create event
    success = AuditLogService.log_event(
        user_id="test-owner-id-audit",
        action="test_action_event",
        details="test detail parameters"
    )
    assert success is True

    # Retrieve from DB to verify structure matches
    if supabase:
        res = supabase.table("security_audit_logs").select("*").eq("user_id", "test-owner-id-audit").eq("action", "test_action_event").execute()
        assert len(res.data) > 0
        assert res.data[0]["details"] == "test detail parameters"
        assert res.data[0]["timestamp"] is not None
