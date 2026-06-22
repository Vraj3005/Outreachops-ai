import pytest
from app.services.gemini_service import GeminiService

def test_parse_email_standard():
    gs = GeminiService()
    
    raw_text = "SUBJECT: Proposal for Apex\nBODY:\nHello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"
    parsed = gs.parse_email(raw_text)
    
    assert parsed["subject"] == "Proposal for Apex"
    assert parsed["body"] == "Hello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"

def test_parse_email_case_insensitive():
    gs = GeminiService()
    
    raw_text = "Subject: Proposal for Apex\nBody:\nHello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"
    parsed = gs.parse_email(raw_text)
    
    assert parsed["subject"] == "Proposal for Apex"
    assert parsed["body"] == "Hello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"

def test_parse_email_markdown_bold():
    gs = GeminiService()
    
    raw_text = "**SUBJECT:** Proposal for Apex\n**BODY:**\nHello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"
    parsed = gs.parse_email(raw_text)
    
    assert parsed["subject"] == "Proposal for Apex"
    assert parsed["body"] == "Hello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"

def test_parse_email_fallback():
    gs = GeminiService()
    
    # Text without SUBJECT: or BODY: headers
    raw_text = "Hello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"
    parsed = gs.parse_email(raw_text)
    
    assert parsed["subject"] == "Quick thought on your business"
    assert parsed["body"] == "Hello Team,\n\nWe would love to work with you.\n\nBest,\nAdmin"
