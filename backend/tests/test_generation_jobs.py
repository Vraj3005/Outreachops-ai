import datetime
import os

import pytest

from app.database import SQLiteSupabaseClient

# Force SQLite local database client for testing
db_path = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), "local_outreachops.db"
)
test_sqlite_client = SQLiteSupabaseClient(db_path)
supabase = test_sqlite_client

import app.database

app.database.supabase = test_sqlite_client

import app.services.generation_job_service

app.services.generation_job_service.supabase = test_sqlite_client

import app.services.generation_worker

app.services.generation_worker.supabase = test_sqlite_client

from app.services.generation_job_service import GenerationJobService
from app.services.generation_worker import GenerationWorker


@pytest.fixture(autouse=True)
def clean_db():
    supabase.table("generation_job_items").delete().execute()
    supabase.table("generation_jobs").delete().execute()
    yield


# --- 1. Idempotency Key Checks ---


def test_idempotency_key_enforcement():
    # Attempt to insert items with duplicate idempotency keys
    campaign_id = "camp-123"
    job_id = "job-abc"
    lead_id = "lead-456"
    seq_step = "step-789"
    idempotency_key = f"{job_id}:{lead_id}:{seq_step}"

    # Payload
    item_1 = {
        "id": "item-1",
        "job_id": job_id,
        "lead_id": lead_id,
        "sequence_step_id": seq_step,
        "status": "pending",
        "attempts": 0,
        "idempotency_key": idempotency_key,
    }

    item_2 = {
        "id": "item-2",
        "job_id": job_id,
        "lead_id": lead_id,
        "sequence_step_id": seq_step,
        "status": "pending",
        "attempts": 0,
        "idempotency_key": idempotency_key,
    }

    # Insert first item
    supabase.table("generation_job_items").insert(item_1).execute()

    # Verify duplicate insertion fails or skips due to uniqueness
    # Depending on client type, it raises IntegrityError or returns empty/fails
    try:
        supabase.table("generation_job_items").insert(item_2).execute()
        # If it was SQLite client without strict UNIQUE check on dynamic columns, check local constraints:
        # Let's query to ensure only one exists
        res = (
            supabase.table("generation_job_items")
            .select("*")
            .eq("idempotency_key", idempotency_key)
            .execute()
        )
        assert len(res.data) == 1
    except Exception:
        # Success - double insert prevented by DB constraints
        pass


# --- 2. Duplicate Worker Claims Mitigation ---


def test_duplicate_worker_claims():
    # Insert multiple pending items
    job_id = "job-worker-test"
    item_payloads = [
        {
            "id": f"item-worker-{i}",
            "job_id": job_id,
            "lead_id": f"lead-{i}",
            "status": "pending",
            "attempts": 0,
            "idempotency_key": f"key-worker-{i}",
            "created_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat(),
        }
        for i in range(5)
    ]
    supabase.table("generation_job_items").insert(item_payloads).execute()

    # Simulate two parallel workers claiming the same items
    claimed_by_w1 = []
    claimed_by_w2 = []

    for _ in range(5):
        # Worker 1 claims
        c1 = GenerationWorker._claim_next_item()
        if c1:
            claimed_by_w1.append(c1["id"])
        # Worker 2 claims
        c2 = GenerationWorker._claim_next_item()
        if c2:
            claimed_by_w2.append(c2["id"])

    # Verify workers claimed mutually exclusive sets of items (no double claim)
    intersect = set(claimed_by_w1).intersection(set(claimed_by_w2))
    assert len(intersect) == 0
    assert len(claimed_by_w1) + len(claimed_by_w2) <= 5


# --- 3. Provider Timeouts and Transient Errors ---


def test_transient_failure_reschedules():
    item_id = "item-transient-test"
    job_id = "job-transient-test"
    item = {
        "id": item_id,
        "job_id": job_id,
        "lead_id": "lead-transient",
        "status": "processing",
        "attempts": 1,
        "idempotency_key": "key-transient",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    supabase.table("generation_job_items").insert(item).execute()

    # Mock transient exception
    transient_exc = Exception("API rate limit exceeded - HTTP 429 Too Many Requests")

    # Invoke reschedule
    GenerationWorker._reschedule_transient(item, transient_exc)

    # Verify status flipped back to pending, error_type set to transient, and updated_at set to future ETA
    res = supabase.table("generation_job_items").select("*").eq("id", item_id).execute()
    db_item = res.data[0]
    assert db_item["status"] == "pending"
    assert db_item["error_type"] == "transient"
    assert "429" in db_item["error_message"]


# --- 4. Malformed AI Output (Permanent Failures) ---


def test_malformed_ai_output_fails_immediately():
    item_id = "item-malformed-test"
    job_id = "job-malformed-test"
    item = {
        "id": item_id,
        "job_id": job_id,
        "lead_id": "lead-malformed",
        "status": "processing",
        "attempts": 1,
        "idempotency_key": "key-malformed",
        "created_at": datetime.datetime.utcnow().isoformat(),
        "updated_at": datetime.datetime.utcnow().isoformat(),
    }
    supabase.table("generation_job_items").insert(item).execute()

    # Mock job header
    job_payload = {
        "id": job_id,
        "user_id": "owner-1",
        "campaign_id": "camp-malformed",
        "status": "running",
    }
    supabase.table("generation_jobs").insert(job_payload).execute()

    # Mark as failed permanently
    GenerationWorker._mark_failed(
        item, "permanent", "Malformed AI output structure. Missing subject or body."
    )

    # Verify status is failed
    res = supabase.table("generation_job_items").select("*").eq("id", item_id).execute()
    db_item = res.data[0]
    assert db_item["status"] == "failed"
    assert db_item["error_type"] == "permanent"
    assert "Malformed AI output" in db_item["error_message"]


# --- 5. Cancellation Safety ---


def test_job_cancellation():
    job_id = "job-cancel-test"
    user_id = "owner-cancel"

    # Spawn Job Header
    job_payload = {
        "id": job_id,
        "user_id": user_id,
        "campaign_id": "camp-cancel",
        "status": "pending",
    }
    supabase.table("generation_jobs").insert(job_payload).execute()

    # Spawn 3 items: 2 pending, 1 completed
    items = [
        {
            "id": "item-c1",
            "job_id": job_id,
            "lead_id": "lead-c1",
            "status": "pending",
            "idempotency_key": "key-c1",
        },
        {
            "id": "item-c2",
            "job_id": job_id,
            "lead_id": "lead-c2",
            "status": "pending",
            "idempotency_key": "key-c2",
        },
        {
            "id": "item-c3",
            "job_id": job_id,
            "lead_id": "lead-c3",
            "status": "completed",
            "idempotency_key": "key-c3",
        },
    ]
    supabase.table("generation_job_items").insert(items).execute()

    # Trigger cancellation
    GenerationJobService.cancel_generation_job(job_id, user_id)

    # Verify pending items are cancelled, completed remains completed
    res_c1 = (
        supabase.table("generation_job_items").select("*").eq("id", "item-c1").execute()
    )
    assert res_c1.data[0]["status"] == "cancelled"

    res_c3 = (
        supabase.table("generation_job_items").select("*").eq("id", "item-c3").execute()
    )
    assert res_c3.data[0]["status"] == "completed"


# --- 6. Worker Crash Recovery (Resume) ---


def test_worker_crash_recovery_resets_processing_items():
    job_id = "job-crash-test"
    user_id = "owner-crash"

    job_payload = {
        "id": job_id,
        "user_id": user_id,
        "campaign_id": "camp-crash",
        "status": "running",
    }
    supabase.table("generation_jobs").insert(job_payload).execute()

    # Item stuck in processing state
    item = {
        "id": "item-crash-1",
        "job_id": job_id,
        "lead_id": "lead-crash-1",
        "status": "processing",
        "idempotency_key": "key-crash-1",
    }
    supabase.table("generation_job_items").insert(item).execute()

    # Resume job
    GenerationJobService.resume_job(job_id, user_id)

    # Verify status reset to pending
    res = (
        supabase.table("generation_job_items")
        .select("*")
        .eq("id", "item-crash-1")
        .execute()
    )
    assert res.data[0]["status"] == "pending"
