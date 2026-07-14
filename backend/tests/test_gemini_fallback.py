from app.services.gemini_service import GeminiService


def test_gemini_demo_fallback(mocker):
    mocker.patch("app.services.gemini_service.settings.DEMO_MODE", True)
    mocker.patch("app.services.gemini_service.settings.GEMINI_API_KEY", "")

    gs = GeminiService()
    res = gs.generate_email_content("Write an ERP suggestion for Summit HVAC")

    assert res["model_used"] == "gemini-mock-demo"
    assert "Hi there" in res["body"]


def test_gemini_model_fallback_transient(mocker):
    # Set demo mode to false so it runs actual logic
    mocker.patch("app.services.gemini_service.settings.DEMO_MODE", False)
    mocker.patch("app.services.gemini_service.settings.GEMINI_API_KEY", "fake-key")
    mocker.patch(
        "app.services.gemini_service.settings.GEMINI_MODEL_LIST", "model-1,model-2"
    )
    mocker.patch("time.sleep")  # mock sleep to run instantly

    # Mock client creation
    mock_client = mocker.MagicMock()
    mocker.patch.object(GeminiService, "_get_client", return_value=mock_client)

    # Mock model responses
    # First model (model-1) always raises a 429 transient error
    # Second model (model-2) succeeds

    class MockResponse:
        text = "SUBJECT: Proposal for Apex\nBODY:\nHello Team"

    def mock_generate_content(model, contents, **kwargs):
        if model == "model-1":
            raise Exception("Resource exhausted (429 Rate Limit hit)")
        elif model == "model-2":
            return MockResponse()
        raise Exception("Unknown model")

    mock_client.models.generate_content.side_effect = mock_generate_content

    gs = GeminiService()
    res = gs.generate_email_content("Write an email")

    assert res["model_used"] == "model-2"
    assert res["subject"] == "Proposal for Apex"
    assert mock_client.models.generate_content.call_count > 1
