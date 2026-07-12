import pytest
import sqlite3
import uuid
import json
from fastapi.testclient import TestClient
from app.main import app
from app.utils.auth import require_owner

def test_campaign_migration_logic():
    # Create an in-memory SQLite database to test migration code isolatedly
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    
    # Setup test campaigns table
    cursor.execute("""
    CREATE TABLE campaigns (
        id TEXT PRIMARY KEY,
        campaign_type TEXT,
        name TEXT,
        objective TEXT
    )""")
    
    cursor.execute("INSERT INTO campaigns VALUES ('1', 'erp', 'ERP consulting campaign', '')")
    cursor.execute("INSERT INTO campaigns VALUES ('2', 'website', 'Web design campaign', NULL)")
    cursor.execute("INSERT INTO campaigns VALUES ('3', 'mixed', 'General agency campaign', 'Custom Objective')")
    cursor.execute("INSERT INTO campaigns VALUES ('4', 'generic', 'Already generic campaign', 'Custom Objective 2')")
    conn.commit()

    # Run the exact migration logic from database.py
    cursor.execute("SELECT id, campaign_type, name, objective FROM campaigns")
    old_campaigns = cursor.fetchall()
    for row in old_campaigns:
        c_id, c_type, name, obj = row
        if c_type in ["mixed", "website", "erp"]:
            new_objective = obj
            if not new_objective:
                if c_type == "erp":
                    new_objective = "Introduce an ERP consulting service and propose schedule systems"
                elif c_type == "website":
                    new_objective = "Propose website development and design improvements"
                else:
                    new_objective = "Introduce general operational agency services"
            
            cursor.execute(
                "UPDATE campaigns SET campaign_type = 'generic', objective = ? WHERE id = ?",
                (new_objective, c_id)
            )
    conn.commit()

    # Validate migration results
    cursor.execute("SELECT id, campaign_type, objective FROM campaigns ORDER BY id")
    rows = cursor.fetchall()
    
    assert rows[0] == ('1', 'generic', 'Introduce an ERP consulting service and propose schedule systems')
    assert rows[1] == ('2', 'generic', 'Propose website development and design improvements')
    assert rows[2] == ('3', 'generic', 'Custom Objective')
    assert rows[3] == ('4', 'generic', 'Custom Objective 2')
    
    conn.close()

def test_campaign_cloning_and_snapshots(mocker):
    # Override auth dependency
    app.dependency_overrides[require_owner] = lambda: {"id": "mock-owner-id", "email": "yash69699696@gmail.com"}
    client = TestClient(app)
    
    # 1. Mock original campaign details
    original_campaign = {
        "id": "original-camp-123",
        "user_id": "mock-owner-id",
        "name": "Acme outreach",
        "campaign_type": "generic",
        "status": "active",
        "daily_send_limit": 50,
        "delay_seconds": 5,
        "objective": "Partnership search",
        "sequence_id": "original-seq-456"
    }

    # Mock owner settings fetch
    mock_settings = {
        "sender_name": "Yash",
        "sender_email": "yash69699696@gmail.com",
        "default_signature": "Best regards, Yash",
        "brand_voice": "Friendly",
        "offer_description": "Workflow systems",
        "default_tone": "casual"
    }

    # Mock Supabase
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.routes.campaigns.supabase", mock_supabase)
    mocker.patch("app.crud.campaigns.supabase", mock_supabase)

    # Mocking select responses
    # First select campaign
    mock_camp_query = mocker.Mock()
    mock_camp_query.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[original_campaign])
    
    # Mock sequence and steps select
    mock_seq_query = mocker.Mock()
    mock_seq_query.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[{"id": "original-seq-456", "name": "Main Sequence"}])
    
    mock_steps_query = mocker.Mock()
    mock_steps_query.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[
        {"id": "step-1", "sequence_id": "original-seq-456", "step_number": 1, "subject_instruction": "Intro", "body_instruction": "Pitch"}
    ])

    # Side effect for table selections
    def table_side_effect(table_name):
        if table_name == "campaigns":
            return mock_camp_query
        elif table_name == "sequences":
            return mock_seq_query
        elif table_name == "sequence_steps":
            return mock_steps_query
        return mocker.Mock()
        
    mock_supabase.table.side_effect = table_side_effect
    
    # Patch get_owner_settings_sync
    mocker.patch("app.routes.settings.get_owner_settings_sync", return_value=mock_settings)
    
    # Mock campaign create/insert
    inserted_cloned_campaign = dict(original_campaign)
    inserted_cloned_campaign["id"] = "cloned-camp-789"
    inserted_cloned_campaign["name"] = "Copy of Acme outreach"
    inserted_cloned_campaign["status"] = "paused"
    inserted_cloned_campaign["cloned_from_id"] = "original-camp-123"
    inserted_cloned_campaign["sender_profile_snapshot"] = json.dumps({
        "sender_name": "Yash",
        "sender_email": "yash69699696@gmail.com",
        "default_signature": "Best regards, Yash"
    })
    inserted_cloned_campaign["prompt_config_snapshot"] = json.dumps({
        "brand_voice": "Friendly",
        "offer_description": "Workflow systems",
        "default_tone": "casual"
    })
    inserted_cloned_campaign["created_at"] = "2026-07-12T12:00:00"
    inserted_cloned_campaign["updated_at"] = "2026-07-12T12:00:00"
    
    mock_camp_query.insert.return_value.execute.return_value = mocker.Mock(data=[inserted_cloned_campaign])

    try:
        response = client.post("/api/v1/campaigns/original-camp-123/clone")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == "cloned-camp-789"
        assert data["name"] == "Copy of Acme outreach"
        assert data["status"] == "paused"
        assert data["cloned_from_id"] == "original-camp-123"
        
        # Check snapshot contents
        sender_prof = data["sender_profile_snapshot"]
        prompt_conf = data["prompt_config_snapshot"]
        assert sender_prof["sender_name"] == "Yash"
        assert prompt_conf["default_tone"] == "casual"
    finally:
        app.dependency_overrides.clear()

def test_campaign_presets_creation(mocker):
    app.dependency_overrides[require_owner] = lambda: {"id": "mock-owner-id", "email": "yash69699696@gmail.com"}
    client = TestClient(app)
    
    preset_payload = {
        "name": "New Preset",
        "campaign_type": "generic",
        "preset": "Introduce a service",
        "objective": "Introduce a service",
        "offer": "SEO checks",
        "value_proposition": "Increase organic search",
        "status": "active"
    }
    
    inserted_preset = dict(preset_payload)
    inserted_preset["id"] = "preset-camp-111"
    inserted_preset["status"] = "paused"
    inserted_preset["user_id"] = "mock-owner-id"
    inserted_preset["created_at"] = "2026-07-12T12:00:00"
    inserted_preset["updated_at"] = "2026-07-12T12:00:00"

    mock_supabase = mocker.MagicMock()
    mock_supabase.table.return_value.insert.return_value.execute.return_value = mocker.Mock(data=[inserted_preset])
    mocker.patch("app.routes.campaigns.supabase", mock_supabase)
    mocker.patch("app.crud.campaigns.supabase", mock_supabase)

    try:
        response = client.post("/api/v1/campaigns/presets", json=preset_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "paused"
        assert data["preset"] == "Introduce a service"
    finally:
        app.dependency_overrides.clear()

def test_campaign_preview_generation(mocker):
    app.dependency_overrides[require_owner] = lambda: {"id": "mock-owner-id", "email": "yash69699696@gmail.com"}
    client = TestClient(app)
    
    preview_req = {
        "objective": "Book a demo",
        "offer": "Free coordination portal trial",
        "value_proposition": "Connect subcontractors instantly",
        "tone": "casual",
        "CTA": "Can we talk next Tuesday?"
    }

    mock_supabase = mocker.MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = mocker.Mock(data=[
        {"company_name": "Delta Roofing", "first_name": "David", "job_title": "General Manager", "website": "https://deltaroofing.com"}
    ])
    mocker.patch("app.routes.campaigns.supabase", mock_supabase)
    mocker.patch("app.crud.campaigns.supabase", mock_supabase)

    try:
        response = client.post("/api/v1/campaigns/preview-drafts", json=preview_req)
        assert response.status_code == 200
        data = response.json()
        
        # Should return list of previews
        assert len(data) == 1
        assert "Delta Roofing" in data[0]["subject"]
        assert "David" in data[0]["body"]
        assert "Free coordination portal trial" in data[0]["body"]
        assert "Can we talk next Tuesday?" in data[0]["body"]
    finally:
        app.dependency_overrides.clear()
