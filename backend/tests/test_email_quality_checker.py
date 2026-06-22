import pytest
from app.services.email_quality_service import EmailQualityService

def test_clean_and_normalize(mocker):
    # Mock settings
    mocker.patch("app.services.email_quality_service.settings.YOUR_NAME", "Vraj")
    mocker.patch("app.services.email_quality_service.settings.YOUR_AGENCY_NAME", "Pitbull Corporations")
    mocker.patch("app.services.email_quality_service.settings.YOUR_WEBSITE", "https://pitbullcorporations.com")
    mocker.patch("app.services.email_quality_service.settings.YOUR_PHONE", "+91-7801951876")

    eqs = EmailQualityService()

    # Test clean and normalize with subject header in body
    subject = "Outreach Proposal"
    body = "SUBJECT: Outreach Proposal\n\nHi there,\n\nI noticed you have page issues.\n\nBest,\nVraj"
    res = eqs.clean_and_normalize(subject, body)
    
    assert res["subject_leaked"] is True
    assert "SUBJECT:" not in res["body"]
    assert "Outreach Proposal" not in res["body"].split("\n")[0]  # first line shouldn't contain it
    assert "Vraj | Pitbull Corporations | https://pitbullcorporations.com | +91-7801951876" in res["body"]

def test_evaluate_draft_banned_phrases(mocker):
    mocker.patch("app.services.email_quality_service.settings.YOUR_NAME", "Vraj")
    mocker.patch("app.services.email_quality_service.settings.YOUR_AGENCY_NAME", "Pitbull Corporations")
    mocker.patch("app.services.email_quality_service.settings.YOUR_WEBSITE", "https://pitbullcorporations.com")
    mocker.patch("app.services.email_quality_service.settings.YOUR_PHONE", "")

    eqs = EmailQualityService()
    lead = {
        "company_name": "Apex Roofing",
        "website": "apex.com",
        "erp_approach": "centralized scheduling modules and automated costing reports"
    }

    # Banned phrase "I hope this email finds you well" and "streamline"
    subject = "Suggestions for apex.com"
    body = "Hi Apex Team,\n\nI hope this email finds you well. We can streamline your sales.\n\nBest,\nVraj"
    
    eval_res = eqs.evaluate_draft(subject, body, "erp", lead)
    
    assert any("Banned phrase found" in w for w in eval_res["warnings"])
    assert eval_res["scores"]["quality_score"] < 8.0  # Quality score should be penalized for warnings

def test_evaluate_draft_length_and_personalization(mocker):
    mocker.patch("app.services.email_quality_service.settings.YOUR_NAME", "Vraj")
    mocker.patch("app.services.email_quality_service.settings.YOUR_AGENCY_NAME", "Pitbull Corporations")
    mocker.patch("app.services.email_quality_service.settings.YOUR_WEBSITE", "https://pitbullcorporations.com")
    mocker.patch("app.services.email_quality_service.settings.YOUR_PHONE", "")

    eqs = EmailQualityService()
    lead = {
        "company_name": "Apex Roofing",
        "website": "apex.com",
        "erp_approach": "centralized scheduling modules and automated costing reports"
    }

    # Too short email (less than 60 words for ERP)
    subject = "Suggestions for apex.com"
    body = "Hi Apex Roofing Team,\n\nWe found issues on apex.com. Let us call you.\n\nBest,\nVraj"
    
    eval_res = eqs.evaluate_draft(subject, body, "erp", lead)
    assert any("Too short" in w for w in eval_res["warnings"])
    assert eval_res["scores"]["personalization_score"] > 5.0 # apex.com and Apex are referenced
