from unittest.mock import ANY

from googleapiclient.errors import HttpError

from app.services.gmail_sync_service import GmailSyncService
from app.services.reply_classification_service import ReplyClassificationService


def test_classify_genuine_reply(mocker):
    # Setup mock
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.reply_classification_service.supabase", mock_supabase)

    # Mock GeminiService client interaction
    mock_gemini = mocker.MagicMock()
    mock_gemini.api_key = "test-key"
    mock_gemini.model_list = ["gemini-2.5-flash-lite"]
    mock_client = mocker.MagicMock()
    mock_gemini._get_client.return_value = mock_client

    mock_response = mocker.MagicMock()
    mock_response.text = '{"category": "positive/interested", "confidence": 0.9, "explanation": "Interested client"}'
    mock_client.models.generate_content.return_value = mock_response

    mocker.patch(
        "app.services.reply_classification_service.GeminiService",
        return_value=mock_gemini,
    )

    # Classify a standard body response
    res = ReplyClassificationService.classify_and_process(
        user_id="user-1",
        campaign_id="camp-1",
        lead_id="lead-1",
        gmail_message_id="msg-1",
        sender="lead@example.com",
        subject="Re: Operational efficiency improvements",
        body="I am interested in learning more about this. Contact me at 555-555-0199 or user@example.com",
    )

    # Validate classification
    assert res["category"] == "positive/interested"
    assert res["rule_model_used"] == "gemini-ai"
    # PII Redacted
    assert "[PHONE-REDACTED]" in res["body"]
    assert "[EMAIL-REDACTED]" in res["body"]


def test_classify_unsubscribe(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.reply_classification_service.supabase", mock_supabase)

    res = ReplyClassificationService.classify_and_process(
        user_id="user-1",
        campaign_id="camp-1",
        lead_id="lead-1",
        gmail_message_id="msg-2",
        sender="lead@example.com",
        subject="Stop emailing me",
        body="Please unsubscribe me immediately.",
    )

    assert res["category"] == "unsubscribe"
    assert res["rule_model_used"] == "deterministic-rules"

    # Check stopping sequence updates
    mock_supabase.table.assert_any_call("campaign_leads")
    mock_supabase.table.assert_any_call("scheduled_emails")


def test_ooo_config_handling(mocker):
    # Campaign behavior set to pause
    mock_supabase = mocker.MagicMock()
    # Mock campaign query lookup to return pause
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[{"ooo_behavior": "pause"}]
    )
    mocker.patch("app.services.reply_classification_service.supabase", mock_supabase)

    # Classify OOO response
    ReplyClassificationService.classify_and_process(
        user_id="user-1",
        campaign_id="camp-1",
        lead_id="lead-1",
        gmail_message_id="msg-3",
        sender="lead@example.com",
        subject="Out of Office",
        body="I am away until next Monday.",
    )

    # Verify campaign lead was updated to stopped status
    mock_supabase.table.return_value.update.assert_any_call(
        {"status": "stopped", "last_error": ANY}
    )


def test_own_message_ignored(mocker):
    # If clean_sender matches user email address, ignore
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.gmail_sync_service.supabase", mock_supabase)

    # Message summary candidate
    messages = [{"id": "msg-1", "historyId": "123", "threadId": "thread-1"}]

    # Mock gmail profile email Address
    mock_gmail = mocker.MagicMock()
    mock_gmail.users.return_value.getProfile.return_value.execute.return_value = {
        "emailAddress": "user@gmail.com"
    }

    # Mock detail message return from headers
    mock_gmail.users.return_value.messages.return_value.get.return_value.execute.return_value = {
        "id": "msg-1",
        "threadId": "thread-1",
        "payload": {
            "headers": [
                {"name": "From", "value": "user@gmail.com"},
                {"name": "Subject", "value": "Outreach"},
            ]
        },
    }

    # Execute batch process
    GmailSyncService._process_messages_batch(
        "user-1", mock_gmail, "user@gmail.com", messages
    )

    # Check that classification was NOT called (no db insert mock calls since it was skipped)
    assert not mock_supabase.table.return_value.insert.called


def test_history_expiration_fallback(mocker):
    # Trigger Gmail sync for user
    mock_supabase = mocker.MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = mocker.Mock(
        data=[{"user_id": "user-1", "last_history_id": "9999"}]
    )
    mocker.patch("app.services.gmail_sync_service.supabase", mock_supabase)
    mocker.patch("app.services.gmail_sync_service.settings.DEMO_MODE", False)

    mock_gmail = mocker.MagicMock()
    mocker.patch(
        "app.services.gmail_service.GmailService._get_gmail_client",
        return_value=mock_gmail,
    )
    mocker.patch(
        "app.services.gmail_service.GmailService.check_connection_status",
        return_value={"status": "connected"},
    )

    # Raise HttpError on history list
    resp = mocker.Mock(status=404)
    mock_gmail.users.return_value.history.return_value.list.return_value.execute.side_effect = HttpError(
        resp=resp, content=b"History ID expired"
    )

    # Mock fallback inbox scan message list return
    mock_gmail.users.return_value.messages.return_value.list.return_value.execute.return_value = {
        "messages": [{"id": "msg-101", "threadId": "thread-101"}]
    }

    # Mock profile response
    mock_gmail.users.return_value.getProfile.return_value.execute.return_value = {
        "emailAddress": "user@gmail.com",
        "historyId": "10050",
    }

    # Mock detail message get
    mock_gmail.users.return_value.messages.return_value.get.return_value.execute.return_value = {
        "id": "msg-101",
        "threadId": "thread-101",
        "payload": {"headers": [{"name": "From", "value": "user@gmail.com"}]},
    }

    GmailSyncService.sync_user_replies("user-1")

    # Verify fallback method list was executed
    mock_gmail.users.return_value.messages.return_value.list.assert_called_with(
        userId="me", q="is:inbox", maxResults=50
    )
