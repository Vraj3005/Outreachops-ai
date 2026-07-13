import pytest
import datetime
from zoneinfo import ZoneInfo
from unittest.mock import MagicMock

from app.services.sequence_service import SequenceService


def test_calculate_next_send_time_weekday():
    # Thursday T22:00:00 -> 3 hours delay -> Friday T01:00:00 -> within 09:00-17:00 window? No, before 09:00, so shifts to Friday 09:00:00
    base_utc = datetime.datetime(2026, 7, 16, 22, 0, 0, tzinfo=datetime.UTC) # Thursday
    
    send_time = SequenceService.calculate_next_send_time(
        from_utc_dt=base_utc,
        delay_amount=3,
        delay_unit="hours",
        timezone_str="UTC",
        window_start_str="09:00",
        window_end_str="17:00",
        exclude_weekends=True
    )
    
    # Friday 09:00 UTC
    assert send_time.year == 2026
    assert send_time.month == 7
    assert send_time.day == 17
    assert send_time.hour == 9
    assert send_time.minute == 0


def test_calculate_next_send_time_weekend_exclusion():
    # Friday T18:00:00 -> 1 day delay -> Saturday T18:00:00. Weekend exclusion shifts to Monday 09:00:00
    base_utc = datetime.datetime(2026, 7, 17, 18, 0, 0, tzinfo=datetime.UTC) # Friday
    
    send_time = SequenceService.calculate_next_send_time(
        from_utc_dt=base_utc,
        delay_amount=1,
        delay_unit="days",
        timezone_str="UTC",
        window_start_str="09:00",
        window_end_str="17:00",
        exclude_weekends=True
    )
    
    # Monday July 20th 09:00 UTC
    assert send_time.weekday() == 0 # Monday
    assert send_time.day == 20
    assert send_time.hour == 9
    assert send_time.minute == 0


def test_sequence_stop_conditions_check(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.sequence_service.supabase", mock_supabase)

    # 1. Lead not found
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
    stop, reason = SequenceService.evaluate_stop_conditions("camp-1", "lead-1")
    assert stop is True
    assert "not found" in reason.lower()

    # 2. DNC check triggers stop
    mock_lead = {
        "id": "lead-1",
        "contact_email": "dnc@example.com",
        "lead_status": "Active",
        "tags": '[]'
    }
    
    def select_side_effect(table):
        mock_tbl = mocker.MagicMock()
        if table == "leads":
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[mock_lead])
        elif table == "do_not_contact":
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[{"id": "dnc-1"}])
        else:
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
        return mock_tbl

    mock_supabase.table.side_effect = select_side_effect
    stop, reason = SequenceService.evaluate_stop_conditions("camp-1", "lead-1")
    assert stop is True
    assert "DNC" in reason

    # 3. Stop keywords in tags triggers stop
    mock_lead_opt_out = {
        "id": "lead-1",
        "contact_email": "safe@example.com",
        "lead_status": "Active",
        "tags": '["unsubscribed"]'
    }
    
    def select_side_effect_tags(table):
        mock_tbl = mocker.MagicMock()
        if table == "leads":
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[mock_lead_opt_out])
        elif table == "do_not_contact":
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
        else:
            mock_tbl.select.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
        return mock_tbl

    mock_supabase.table.side_effect = select_side_effect_tags
    stop, reason = SequenceService.evaluate_stop_conditions("camp-1", "lead-1")
    assert stop is True
    assert "tag stop keyword matched" in reason


def test_enroll_lead_state_machine_transition(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.sequence_service.supabase", mock_supabase)

    # Mock get_or_create_default_sequence
    mocker.patch.object(SequenceService, "get_or_create_default_sequence", return_value="seq-123")

    # Mock exists check empty -> inserts new campaign_leads
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])

    res = SequenceService.enroll_lead("camp-123", "lead-456", "user-789")
    assert res["status"] == "awaiting_generation"
    assert mock_supabase.table.return_value.insert.called or mock_supabase.table.return_value.update.called
