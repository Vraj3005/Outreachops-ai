import pytest
import datetime
from unittest.mock import MagicMock, ANY

from app.services.sequence_service import SequenceService
from app.services.durable_sending_worker import DurableSendingWorker


def test_guardrails_active_campaign_check(mocker):
    # Setup mock campaign, lead, draft, job
    job = {"id": "job-1", "user_id": "user-1"}
    campaign = {"id": "camp-1", "status": "paused", "timezone": "UTC"}
    lead = {"id": "lead-1", "lead_status": "Active", "contact_email": "v@example.com"}
    draft = {"id": "draft-1", "status": "approved"}

    # Mock DB
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.durable_sending_worker.supabase", mock_supabase)

    ok, reason = DurableSendingWorker._check_guardrails(job, campaign, lead, draft)
    assert ok is False
    assert "Campaign is not in active state" in reason


def test_guardrails_dnc_list_block(mocker):
    job = {"id": "job-1", "user_id": "user-1"}
    campaign = {"id": "camp-1", "status": "active", "timezone": "UTC"}
    lead = {"id": "lead-1", "lead_status": "Active", "contact_email": "dnc@example.com"}
    draft = {"id": "draft-1", "status": "approved"}

    mock_supabase = mocker.MagicMock()
    # Mock do_not_contact query returning a record
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[{"id": "dnc-rec"}])
    mocker.patch("app.services.durable_sending_worker.supabase", mock_supabase)

    ok, reason = DurableSendingWorker._check_guardrails(job, campaign, lead, draft)
    assert ok is False
    assert "Do Not Contact" in reason


def test_guardrails_unsubscribed_tag_block(mocker):
    job = {"id": "job-1", "user_id": "user-1"}
    campaign = {"id": "camp-1", "status": "active", "timezone": "UTC"}
    lead = {"id": "lead-1", "lead_status": "Active", "contact_email": "test@example.com", "tags": '["unsubscribed"]'}
    draft = {"id": "draft-1", "status": "approved"}

    mock_supabase = mocker.MagicMock()
    # Mock do_not_contact empty, send_events empty
    def select_side_effect(table):
        mock_tbl = mocker.MagicMock()
        if table == "do_not_contact":
            mock_tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
        else:
            mock_tbl.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[])
        return mock_tbl

    mock_supabase.table.side_effect = select_side_effect
    mocker.patch("app.services.durable_sending_worker.supabase", mock_supabase)

    ok, reason = DurableSendingWorker._check_guardrails(job, campaign, lead, draft)
    assert ok is False
    assert "opt-out blocked" in reason


def test_worker_transient_retry_handling(mocker):
    job = {
        "id": "job-1", 
        "user_id": "user-1", 
        "attempts": 1,
        "campaign_id": "camp-1",
        "lead_id": "lead-1",
        "draft_id": "draft-1",
        "status": "processing"
    }

    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.durable_sending_worker.supabase", mock_supabase)

    # Invoke retry handler for transient error
    DurableSendingWorker._mark_failed(job, "Rate Limit Exceeded (429)", is_transient=True)

    # Verify updated status to retry
    mock_supabase.table.return_value.update.assert_called_with({
        "status": "retry",
        "last_error": "Rate Limit Exceeded (429)",
        "scheduled_for": ANY,
        "updated_at": ANY
    })


def test_idempotency_duplicate_dispatch_check(mocker):
    job = {
        "id": "job-1", 
        "user_id": "user-1", 
        "campaign_id": "camp-1",
        "lead_id": "lead-1",
        "draft_id": "draft-1",
        "idempotency_key": "send_draft_draft-1"
    }

    mock_supabase = mocker.MagicMock()
    # Mock send_events returning an existing record -> duplicate dispatch detection
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(data=[{"id": "event-1"}])
    mocker.patch("app.services.durable_sending_worker.supabase", mock_supabase)

    # Trigger process job
    DurableSendingWorker._process_job(job)

    # Verify status updated to sent directly and not calling gmail service
    mock_supabase.table.return_value.update.assert_called_with({
        "status": "sent",
        "updated_at": ANY
    })
