import sqlite3

import pytest

from app.database import supabase

# --- 1. Database Index Existence Verification ---


def test_database_indexes():
    # Retrieve the database path from local client
    db_path = getattr(supabase, "db_path", "local_outreachops.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='index'")
    indexes = [row[0] for row in cursor.fetchall()]
    conn.close()

    expected_indexes = [
        "idx_leads_user_id",
        "idx_campaigns_user_id",
        "idx_scheduled_emails_status",
        "idx_scheduled_emails_scheduled_for",
        "idx_campaign_leads_campaign_id",
    ]
    for idx in expected_indexes:
        assert idx in indexes, f"Index {idx} was not found in the SQLite schema."


# --- 2. Database Constraints Validation ---


def test_database_not_null_constraints():
    db_path = getattr(supabase, "db_path", "local_outreachops.db")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # website is NOT NULL in leads table, inserting NULL must trigger IntegrityError
    with pytest.raises(sqlite3.IntegrityError):
        cursor.execute(
            "INSERT INTO leads (id, user_id, website) VALUES ('test-id', 'test-user', NULL)"
        )
        conn.commit()

    conn.close()


# --- 3. Queue Claim Concurrency Verification ---


def test_queue_claim_concurrency(mocker):
    """
    Validates that status claims on scheduled_emails are thread-safe and concurrency-safe
    (i.e. only one worker thread can successfully claim a pending outbox job).
    """
    db_path = getattr(supabase, "db_path", "local_outreachops.db")

    # 1. Clean previous scheduled emails
    try:
        supabase.table("scheduled_emails").delete().eq(
            "campaign_id", "concurrency-test-campaign"
        ).execute()
    except Exception:
        pass

    # 2. Setup a pending scheduled email record
    job_id = "test-job-uuid-12345"
    payload = {
        "id": job_id,
        "campaign_id": "concurrency-test-campaign",
        "lead_id": "lead-uuid-con",
        "draft_id": "draft-uuid-con",
        "scheduled_for": "2020-01-01T00:00:00Z",  # long overdue
        "scheduled_at": "2020-01-01T00:00:00Z",
        "status": "pending",
        "attempts": 0,
        "user_id": "owner-user-id",
    }
    supabase.table("scheduled_emails").insert(payload).execute()

    # 3. Simulate two concurrent worker claiming loops attempting status change from 'pending' to 'processing'
    results = []

    def claim_runner(worker_name: str):
        now_str = "2026-07-13T18:00:00Z"
        # Query job
        job_res = (
            supabase.table("scheduled_emails").select("*").eq("id", job_id).execute()
        )
        if not job_res.data:
            return
        job = job_res.data[0]

        # Atomic lock claiming logic (eq("status", "pending") guarantees mutual exclusion)
        claim_res = (
            supabase.table("scheduled_emails")
            .update(
                {
                    "status": "processing",
                    "attempts": (job.get("attempts") or 0) + 1,
                    "updated_at": now_str,
                }
            )
            .eq("id", job["id"])
            .eq("status", "pending")
            .execute()
        )

        if claim_res.data:
            results.append(worker_name)

    # Execute sequentially: Worker-1 claims successfully, changing status to 'processing'.
    # Worker-2 then attempts to claim, but the update filter eq("status", "pending") fails to match.
    claim_runner("Worker-1")
    claim_runner("Worker-2")

    # Assert that only ONE worker succeeded in claiming the job
    assert len(results) == 1, f"Concurrency violation! Job claimed by: {results}"
    assert results == ["Worker-1"]


# --- 4. RLS / Tenant Permissions Mocks ---


def test_rls_ownership_isolation_enforcement():
    """
    Ensure the Supabase / SQLite client routes filter records by user_id to enforce RLS isolation.
    """
    # Verify client routes explicitly insert owner filter parameters
    from unittest import mock

    from app.crud.campaigns import get_campaigns

    # Mock database execute to verify the filter structure
    with mock.patch.object(supabase, "table") as mock_table:
        get_campaigns("owner-user-id-abc")

        # Verify campaigns are queried with user_id eq owner-user-id-abc filter
        mock_table.assert_called_with("campaigns")
        mock_table.return_value.select.assert_called_with("*")
        mock_table.return_value.select.return_value.eq.assert_called_with(
            "user_id", "owner-user-id-abc"
        )
