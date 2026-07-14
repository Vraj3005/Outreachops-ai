from app.services.lead_quality_service import LeadQualityService


def test_malicious_field_names_and_html_strip():
    lqs = LeadQualityService()

    # 1. Malicious field keys (e.g. script tags, SQL symbols) should be stripped to alphanumeric + underscore
    raw_lead = {
        "website": "pitbull.com",
        "contact_email": "vraj@gmail.com",
        "custom_fields": {
            "<script>alert(1)</script>": "value",
            "sql_key; DROP TABLE leads;--": "value",
            "nested_value": "<h3>Nice Content</h3>",
        },
    }

    normalized = lqs.normalize_lead_data(raw_lead)
    cf = normalized["custom_fields"]

    # "scriptalert1script" and "sql_key_drop_table_leads__" (trailing dashes mapped to underscores)
    assert "scriptalert1script" in cf
    assert "sql_key_drop_table_leads__" in cf
    # HTML tag "<h3>" and "</h3>" must be stripped from value
    assert cf["nested_value"] == "Nice Content"


def test_malformed_emails_verification():
    lqs = LeadQualityService()

    res1 = lqs.verify_email("plainaddress")
    assert res1["status"] == "invalid"

    res2 = lqs.verify_email("@missinglocal.com")
    assert res2["status"] == "invalid"

    res3 = lqs.verify_email("local@.com")
    assert res3["status"] == "invalid"


def test_duplicate_resolution_strategies():
    lqs = LeadQualityService()

    existing = {
        "id": "lead-123",
        "user_id": "owner-abc",
        "first_name": "Yash",
        "last_name": None,
        "company_name": "Pitbull Corp",
        "tags": ["warm"],
        "custom_fields": {"priority": "high"},
    }

    new_payload = {
        "first_name": "Yash Updated",
        "last_name": "Shah",
        "company_name": "New Pitbull Corp",
        "tags": ["hot", "warm"],
        "custom_fields": {"notes": "Follow up next week", "priority": "low"},
    }

    # 1. Strategy: skip
    action, res_skip = lqs.resolve_duplicate_conflict(new_payload, existing, "skip")
    assert action == "skipped"
    assert res_skip["first_name"] == "Yash"

    # 2. Strategy: overwrite
    action, res_over = lqs.resolve_duplicate_conflict(
        new_payload, existing, "overwrite"
    )
    assert action == "overwritten"
    assert res_over["first_name"] == "Yash Updated"
    assert res_over["last_name"] == "Shah"

    # 3. Strategy: merge
    action, res_merge = lqs.resolve_duplicate_conflict(new_payload, existing, "merge")
    assert action == "merged"
    # Keep existing first_name (non-empty)
    assert res_merge["first_name"] == "Yash"
    # Fill in empty last_name
    assert res_merge["last_name"] == "Shah"
    # Union tags uniquely
    assert res_merge["tags"] == ["hot", "warm"]
    # Merge custom fields safely without destroying existing ones
    assert res_merge["custom_fields"]["priority"] == "high"
    assert res_merge["custom_fields"]["notes"] == "Follow up next week"


def test_custom_json_values():
    lqs = LeadQualityService()

    raw_lead = {
        "website": "pitbull.com",
        "contact_email": "vraj@gmail.com",
        "custom_fields": {
            "nested_dict": {"meta": "data", "id": 123},
            "nested_list": ["tag1", "tag2", 345],
        },
    }

    normalized = lqs.normalize_lead_data(raw_lead)
    cf = normalized["custom_fields"]

    assert cf["nested_dict"] == {"meta": "data", "id": 123}
    assert cf["nested_list"] == ["tag1", "tag2", 345]


def test_pagination_and_filters_mock(mocker):
    from fastapi.testclient import TestClient

    from app.main import app
    from app.utils.auth import require_owner

    # Override auth dependency
    app.dependency_overrides[require_owner] = lambda: {
        "id": "mock-owner-id",
        "email": "yash69699696@gmail.com",
    }
    client = TestClient(app)

    mock_leads_data = [
        {
            "id": "1",
            "user_id": "mock-owner-id",
            "company_name": "Pitbull construction",
            "website": "https://pitbull.com",
            "industry": "construction",
            "country": "USA",
            "contact_email": "info@pitbull.com",
            "lead_status": "Pending",
            "email_validation_status": "valid",
            "created_at": "2026-07-12T18:20:00",
            "updated_at": "2026-07-12T18:20:00",
        },
        {
            "id": "2",
            "user_id": "mock-owner-id",
            "company_name": "Alpha HVAC",
            "website": "https://alphahvac.com",
            "industry": "hvac",
            "country": "Canada",
            "contact_email": "support@alphahvac.com",
            "lead_status": "Approved",
            "email_validation_status": "role_address",
            "created_at": "2026-07-12T18:20:00",
            "updated_at": "2026-07-12T18:20:00",
        },
    ]

    mocker.patch("app.routes.leads.get_leads", return_value=mock_leads_data)

    try:
        # 1. Test Filter: lead_status
        response = client.get("/api/v1/leads?lead_status=Pending")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Pitbull construction"

        # 2. Test Filter: industry
        response = client.get("/api/v1/leads?industry=hvac")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Alpha HVAC"

        # 3. Test Filter: country
        response = client.get("/api/v1/leads?country=USA")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Pitbull construction"

        # 4. Test Search keyword query
        response = client.get("/api/v1/leads?search=Alpha")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Alpha HVAC"

        # 5. Test Pagination: limit and offset
        response = client.get("/api/v1/leads?limit=1&offset=1")
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["company_name"] == "Alpha HVAC"
    finally:
        # Clean overrides
        app.dependency_overrides.clear()
