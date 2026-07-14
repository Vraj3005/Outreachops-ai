from fastapi.testclient import TestClient

from app.config import settings
from app.main import app

client = TestClient(app)


def test_missing_token():
    """
    Ensure missing Authorization header returns 401.
    """
    response = client.get("/api/v1/leads")
    assert response.status_code == 401
    assert "Not authenticated" in response.json().get("detail", "")


def test_invalid_token(mocker):
    """
    Ensure invalid token returns 401.
    """
    mocker.patch("app.utils.auth.settings.DEMO_MODE", True)
    response = client.get(
        "/api/v1/leads", headers={"Authorization": "Bearer mock-invalid-token"}
    )
    assert response.status_code == 401
    assert "Invalid, missing or expired" in response.json().get("detail", "")


def test_expired_token(mocker):
    """
    Ensure expired token returns 401.
    """
    mocker.patch("app.utils.auth.settings.DEMO_MODE", True)
    response = client.get(
        "/api/v1/leads", headers={"Authorization": "Bearer mock-expired-token"}
    )
    assert response.status_code == 401
    assert "Token has expired" in response.json().get("detail", "")


def test_non_owner_token(mocker):
    """
    Ensure token from a non-owner user returns 403.
    """
    mocker.patch("app.utils.auth.settings.DEMO_MODE", True)
    response = client.get(
        "/api/v1/leads", headers={"Authorization": "Bearer mock-non-owner-token"}
    )
    assert response.status_code == 403
    assert "restricted to the owner only" in response.json().get("detail", "")


def test_valid_owner_and_demo_access(mocker):
    """
    Ensure a valid owner token successfully accesses protected metadata.
    """
    mocker.patch("app.utils.auth.settings.DEMO_MODE", True)
    # Mock lead retrieval to verify we reach the handler
    mock_get_leads = mocker.patch("app.routes.leads.get_leads", return_value=[])

    response = client.get(
        "/api/v1/leads", headers={"Authorization": "Bearer mock-valid-token"}
    )
    assert response.status_code == 200
    assert response.json() == []
    mock_get_leads.assert_called_once()


def test_protected_sending_endpoint(mocker):
    """
    Ensure that a send request is blocked/allowed based on auth credentials
    and checks if demo mode sending limits are enforced.
    """
    mocker.patch("app.utils.auth.settings.DEMO_MODE", True)

    mock_supabase = mocker.MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[]
    )
    mocker.patch("app.database.supabase", mock_supabase)

    # 1. Unauthenticated request to individual send
    res_unauth = client.post("/api/v1/drafts/some-uuid/send")
    assert res_unauth.status_code == 401

    # 2. Authenticated send request in Demo mode
    # Ensure demo mode blocks actual sending unless DEMO_SENDING_ENABLED is True
    mocker.patch("app.routes.drafts.settings.DEMO_SENDING_ENABLED", False)
    mocker.patch(
        "app.routes.drafts.get_draft",
        return_value={
            "id": "some-uuid",
            "lead_id": "lead-uuid",
            "status": "approved",
            "user_id": settings.OWNER_USER_ID,
        },
    )
    mocker.patch(
        "app.routes.drafts.get_lead",
        return_value={
            "id": "lead-uuid",
            "contact_email": "test@apex.com",
            "user_id": settings.OWNER_USER_ID,
        },
    )

    mocker.patch(
        "app.services.rate_limit_service.RateLimitService.check_daily_limit",
        return_value=True,
    )
    mocker.patch(
        "app.services.rate_limit_service.RateLimitService.check_double_email_limit",
        return_value=True,
    )

    res_auth_demo = client.post(
        "/api/v1/drafts/some-uuid/send",
        headers={"Authorization": "Bearer mock-valid-token"},
    )
    assert res_auth_demo.status_code == 403
    assert "Sending is disabled in demo mode" in res_auth_demo.json().get("detail", "")
