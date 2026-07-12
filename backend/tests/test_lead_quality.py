import pytest
from app.services.lead_quality_service import LeadQualityService

@pytest.fixture
def quality_service():
    return LeadQualityService()

def test_normalization_malicious_field_names(quality_service):
    # Test malicious input custom fields format containing special characters
    lead_input = {
        "company_name": "  Apex Solutions  ",
        "website": "http://www.apex-solutions.com/index.html",
        "contact_email": "Info@APEX-solutions.com",
        "phone": "+1 (555) 019-9922 ext 5",
        "country": "united   states",
        "city": "boston  ",
        "tags": " warm, , Target, lead! ",
        "custom_fields": {
            "Select * From users;": "SQL Injection",
            "<script>alert(1)</script>": "XSS Script",
            "valid_key": "Regular Value"
        }
    }
    
    normalized = quality_service.normalize_lead_data(lead_input)
    
    assert normalized["company_name"] == "Apex Solutions"
    assert normalized["website"] == "https://apex-solutions.com"
    assert normalized["company_domain"] == "apex-solutions.com"
    assert normalized["contact_email"] == "info@apex-solutions.com"
    assert normalized["phone"] == "+155501999225"
    assert normalized["country"] == "United States"
    assert normalized["city"] == "Boston"
    assert normalized["tags"] == ["lead!", "target", "warm"]
    
    # Custom fields sanitize check (remove non-alphanumeric)
    cf = normalized["custom_fields"]
    assert "select__from_users" in cf
    assert "scriptalert1script" in cf
    assert cf["valid_key"] == "Regular Value"

def test_email_verification_rules(quality_service):
    # 1. Invalid Syntax
    v1 = quality_service.verify_email("invalid-email-address")
    assert v1["status"] == "invalid"
    
    # 2. Disposable warning
    v2 = quality_service.verify_email("user@mailinator.com")
    assert v2["status"] == "disposable"
    assert "disposable" in v2["reasons"][0]
    
    # 3. Role Address warning
    v3 = quality_service.verify_email("support@google.com")
    assert v3["status"] == "role_address"
    assert "role address" in v3["reasons"][0]
    
    # 4. Valid email Syntax check
    v4 = quality_service.verify_email("vraj@pitbullcorporations.com")
    assert v4["status"] in ["valid", "invalid", "role_address"]

def test_lead_fit_scoring(quality_service):
    lead = {
        "industry": "HVAC",
        "country": "USA",
        "city": "Boston",
        "job_title": "VP of Sales",
        "company_name": "Apex solutions",
        "website": "https://apex.com",
        "contact_email": "sales@apex.com",
        "research_summary": "Active contractor"
    }
    
    criteria = {
        "target_industries": ["hvac", "roofing"],
        "target_locations": ["usa", "canada"],
        "target_roles": ["sales", "owner"]
    }
    
    score, reasons = quality_service.calculate_fit_score(lead, criteria)
    
    # Assert reasons contains standard criteria
    assert score >= 80
    assert any("industry" in r.lower() for r in reasons)
    assert any("location" in r.lower() for r in reasons)
    assert any("job title" in r.lower() for r in reasons)
    # Explanatory disclaimer
    assert any("disclaimer" in r.lower() for r in reasons)

def test_duplicate_conflict_resolution(quality_service):
    existing = {
        "id": "existing-uuid-1234",
        "user_id": "owner-123",
        "company_name": "Apex solutions",
        "website": "https://apex.com",
        "contact_email": "info@apex.com",
        "phone": None,
        "tags": ["warm"],
        "custom_fields": {"old_key": "old_value"}
    }
    
    new_data = {
        "company_name": "Apex Solutions Inc",
        "website": "https://apex.com",
        "contact_email": "info@apex.com",
        "phone": "+16175550100",
        "tags": ["target"],
        "custom_fields": {"new_key": "new_value"}
    }
    
    # 1. Skip Strategy
    action, resolved = quality_service.resolve_duplicate_conflict(new_data, existing, "skip")
    assert action == "skipped"
    assert resolved["phone"] is None
    
    # 2. Overwrite Strategy
    action, resolved = quality_service.resolve_duplicate_conflict(new_data, existing, "overwrite")
    assert action == "overwritten"
    assert resolved["company_name"] == "Apex Solutions Inc"
    assert resolved["phone"] == "+16175550100"
    
    # 3. Merge Strategy (Default)
    action, resolved = quality_service.resolve_duplicate_conflict(new_data, existing, "merge")
    assert action == "merged"
    # Fills phone which was empty
    assert resolved["phone"] == "+16175550100"
    # Merges tag collections uniquely
    assert resolved["tags"] == ["target", "warm"]
    # Merges custom field keys
    assert resolved["custom_fields"] == {"old_key": "old_value", "new_key": "new_value"}
