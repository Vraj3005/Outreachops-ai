from fastapi.testclient import TestClient

from app.main import app
from app.services.template_renderer import SafeTemplateRenderer
from app.utils.auth import require_owner


def test_safe_template_renderer_logic():
    # 1. Test standard replacement
    context = {
        "first_name": "John",
        "company_name": "ACME",
        "campaign": {"objective": "increase sales"},
        "custom": {"metric": "50%"},
    }

    template = "Hello {{first_name}} from {{company_name}}! We want to {{campaign.objective}} using {{custom.metric}}."
    rendered, used, missing = SafeTemplateRenderer.render(template, context)

    assert rendered == "Hello John from ACME! We want to increase sales using 50%."
    assert "first_name" in used
    assert "company_name" in used
    assert "campaign.objective" in used
    assert "custom.metric" in used
    assert len(missing) == 0

    # 2. Test fallback parameters
    template_fallback = "Hi {{first_name|there}}, meet {{non_existent|the owner}}."
    rendered_f, used_f, missing_f = SafeTemplateRenderer.render(
        template_fallback, context
    )

    assert rendered_f == "Hi John, meet the owner."
    assert "first_name" in used_f
    assert "non_existent" not in used_f
    assert len(missing_f) == 0

    # 3. Test missing variable detection
    template_missing = "Hi {{first_name}} and {{missing_val}}."
    rendered_m, used_m, missing_m = SafeTemplateRenderer.render(
        template_missing, context
    )
    assert rendered_m == "Hi John and ."
    assert "missing_val" in missing_m

    # 4. Test max size constraints
    rendered_l, _, _ = SafeTemplateRenderer.render("A" * 10500, {}, max_size=1000)
    assert len(rendered_l) <= 1050
    assert "[Render size limit reached]" in rendered_l


def test_safe_template_renderer_validation():
    # 1. Valid syntax
    valid_template = "Hello {{first_name}}, objective is {{campaign.objective}}."
    is_valid, errors, detected, unknown = SafeTemplateRenderer.validate_syntax(
        valid_template
    )
    assert is_valid is True
    assert len(errors) == 0
    assert "first_name" in detected
    assert "campaign.objective" in detected
    assert len(unknown) == 0

    # 2. Unbalanced braces
    invalid_template = "Hello {{first_name"
    is_valid_i, errors_i, _, _ = SafeTemplateRenderer.validate_syntax(invalid_template)
    assert is_valid_i is False
    assert any("Unbalanced" in e for e in errors_i)

    # 3. Typo brace single check
    typo_template = "Hello {first_name}"
    is_valid_t, errors_t, _, _ = SafeTemplateRenderer.validate_syntax(typo_template)
    assert is_valid_t is False
    assert any("Possible malformed placeholder" in e for e in errors_t)

    # 4. Unknown variables
    unknown_template = "Hello {{first_name}} and {{invalid.variable_name}}."
    is_valid_u, errors_u, detected_u, unknown_u = SafeTemplateRenderer.validate_syntax(
        unknown_template
    )
    assert is_valid_u is False
    assert "invalid.variable_name" in unknown_u


def test_prompt_validation_endpoint(mocker):
    app.dependency_overrides[require_owner] = lambda: {
        "id": "mock-owner-id",
        "email": "yash69699696@gmail.com",
    }
    client = TestClient(app)

    payload = {
        "template_text": "Hello {{first_name}}, objective is {{campaign.objective}}.",
        "email_type": "generic",
    }

    try:
        res = client.post("/api/v1/prompts/validate", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["is_valid"] is True
        assert "first_name" in data["detected_variables"]
        assert "Alice" in data["preview_text"]  # check mock data resolution
    finally:
        app.dependency_overrides.clear()


def test_prompt_version_creation_and_compare(mocker):
    app.dependency_overrides[require_owner] = lambda: {
        "id": "mock-owner-id",
        "email": "yash69699696@gmail.com",
    }
    client = TestClient(app)

    # Mock template select
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.database.supabase", mock_supabase)
    mocker.patch("app.routes.prompts.supabase", mock_supabase)

    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[
            {
                "id": "tmpl-123",
                "user_id": "mock-owner-id",
                "name": "Standard template",
                "email_type": "generic",
            }
        ]
    )

    # Mock version insertion
    inserted_version = {
        "id": "ver-456",
        "template_id": "tmpl-123",
        "version": "1.1.0",
        "template_text": "Hello {{first_name}}",
        "status": "published",
        "description": "Custom version",
        "changelog": "Initial publish",
        "is_active": True,
        "created_at": "2026-07-12T12:00:00",
    }
    mock_supabase.table.return_value.insert.return_value.execute.return_value = (
        mocker.Mock(data=[inserted_version])
    )
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[]
    )

    try:
        payload = {
            "version": "1.1.0",
            "template_text": "Hello {{first_name}}",
            "status": "published",
            "description": "Custom version",
            "changelog": "Initial publish",
        }

        response = client.post("/api/v1/prompts/tmpl-123/versions", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["version"] == "1.1.0"
        assert data["status"] == "published"

        # Test Compare Endpoint
        v1_data = {
            "id": "v1-id",
            "template_id": "tmpl-123",
            "version": "1.0.0",
            "template_text": "Hello {{first_name}}\nOriginal lines",
            "status": "published",
        }
        v2_data = {
            "id": "v2-id",
            "template_id": "tmpl-123",
            "version": "1.1.0",
            "template_text": "Hello {{first_name}}\nModified lines",
            "status": "published",
        }

        # Mocking selects for compare endpoint
        def mock_select_side_effect(table_name):
            if table_name == "prompt_versions":
                mock_query = mocker.Mock()

                # Side effect for v1 vs v2 selects
                def eq_side_effect(col, val):
                    if val == "v1-id":
                        mock_query.execute.return_value = mocker.Mock(data=[v1_data])
                    else:
                        mock_query.execute.return_value = mocker.Mock(data=[v2_data])
                    return mock_query

                mock_query.select.return_value.eq.side_effect = eq_side_effect
                return mock_query
            elif table_name == "prompt_templates":
                mock_query = mocker.Mock()
                mock_query.select.return_value.eq.return_value.execute.return_value = (
                    mocker.Mock(data=[{"id": "tmpl-123", "user_id": "mock-owner-id"}])
                )
                return mock_query
            return mocker.Mock()

        mock_supabase.table.side_effect = mock_select_side_effect

        compare_res = client.get("/api/v1/prompts/compare?v1=v1-id&v2=v2-id")
        assert compare_res.status_code == 200
        comp_data = compare_res.json()
        assert comp_data["version1"] == "1.0.0"
        assert comp_data["version2"] == "1.1.0"
        assert len(comp_data["diff_lines"]) > 0
    finally:
        app.dependency_overrides.clear()


def test_prompt_simulation_test_endpoint(mocker):
    app.dependency_overrides[require_owner] = lambda: {
        "id": "mock-owner-id",
        "email": "yash69699696@gmail.com",
    }
    client = TestClient(app)

    # Mock owner settings fetch
    mock_settings = {
        "sender_name": "Yash",
        "business_name": "OutreachOps",
        "website": "outreachops.ai",
        "sender_phone": "+1-555-0199",
        "default_signature": "Best, Yash | OutreachOps",
        "banned_phrases": "free money, guarantee",
    }
    mocker.patch(
        "app.routes.settings.get_owner_settings_sync", return_value=mock_settings
    )

    # Mock Supabase selects
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.database.supabase", mock_supabase)
    mocker.patch("app.routes.prompts.supabase", mock_supabase)

    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[]
    )

    # Mock Gemini Service response
    mock_email = {
        "subject": "Improving Acme workflows",
        "body": "Hello John,\n\nWe saw manual scheduling spreadsheet bottlenecks.\n\nBest, Yash",
        "reasoning": "Mocked test reasoning",
        "model_used": "gemini-test-mock",
        "warnings": [],
    }
    mocker.patch(
        "app.services.gemini_service.GeminiService.generate_structured_email",
        return_value=mock_email,
    )

    try:
        payload = {
            "lead_id": "lead-123",
            "template_text": "Hi {{first_name}}, meeting objective: {{campaign.objective}}.",
            "tone": "casual",
            "length": "short",
            "cta": "soft",
        }
        res = client.post("/api/v1/prompts/test", json=payload)
        assert res.status_code == 200
        data = res.json()
        assert data["subject"] == "Improving Acme workflows"
        assert "scores" in data
        assert data["token_estimate"] > 0
        assert data["reasoning"] == "Mocked test reasoning"
    finally:
        app.dependency_overrides.clear()
