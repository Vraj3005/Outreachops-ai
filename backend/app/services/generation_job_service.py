import datetime
import json
import logging
import uuid
from typing import Any, Dict, List, Optional
from app.database import supabase

logger = logging.getLogger("outreachops.services.generation_job")


class GenerationJobService:
    """
    Service to manage backend asynchronous generation jobs and items.
    Tracks state progress, cancels jobs, resumes crashed tasks, and retries failures.
    """

    @classmethod
    def create_generation_job(
        cls,
        campaign_id: str,
        user_id: str,
        lead_ids: Optional[List[str]] = None,
        sample_only: bool = False,
        regenerate: bool = False,
        prompt_version_id: Optional[str] = None,
        model_config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Initializes a generation job and maps target leads as queued job items.
        """
        # 1. Fetch Campaign Details
        campaign_res = supabase.table("campaigns").select("*").eq("id", campaign_id).execute()
        if not campaign_res.data:
            raise ValueError(f"Campaign {campaign_id} not found")
        campaign = campaign_res.data[0]

        # 2. Determine prompt version & sequence step
        p_version = prompt_version_id or campaign.get("prompt_template_id")
        
        sequence_step_id = None
        seq_id = campaign.get("sequence_id")
        if seq_id:
            steps_res = supabase.table("sequence_steps").select("*").eq("sequence_id", seq_id).order("step_number").execute()
            if steps_res.data:
                sequence_step_id = steps_res.data[0]["id"]

        # 3. Resolve target Lead IDs
        resolved_lead_ids = []
        if lead_ids:
            resolved_lead_ids = list(lead_ids)
        else:
            # Query leads enrolled in this campaign
            enroll_res = supabase.table("campaign_leads").select("lead_id").eq("campaign_id", campaign_id).execute()
            if enroll_res.data:
                resolved_lead_ids = [row["lead_id"] for row in enroll_res.data]

        # Handle sample run limit
        if sample_only:
            resolved_lead_ids = resolved_lead_ids[:5]
            if len(resolved_lead_ids) == 0:
                # Fallback to general leads if none enrolled yet
                leads_res = supabase.table("leads").select("id").eq("user_id", user_id).limit(5).execute()
                resolved_lead_ids = [row["id"] for row in (leads_res.data or [])]

        if not resolved_lead_ids:
            raise ValueError("No eligible leads found for email generation")

        # 4. Create Generation Job Header
        job_id = str(uuid.uuid4())
        job_payload = {
            "id": job_id,
            "user_id": user_id,
            "campaign_id": campaign_id,
            "status": "pending",
            "total": len(resolved_lead_ids),
            "queued": len(resolved_lead_ids),
            "processing": 0,
            "completed": 0,
            "failed": 0,
            "cancelled": 0,
            "prompt_version": p_version,
            "model_configuration_snapshot": json.dumps(model_config or {}),
            "created_at": datetime.datetime.utcnow().isoformat(),
            "updated_at": datetime.datetime.utcnow().isoformat()
        }
        
        supabase.table("generation_jobs").insert(job_payload).execute()

        # 5. Insert Individual Generation Job Items
        items_payload = []
        for l_id in resolved_lead_ids:
            item_id = str(uuid.uuid4())
            # Idempotency key covers Job + Lead + Step scope to avoid duplicate execution
            idempotency_key = f"{job_id}:{l_id}:{sequence_step_id or 'default'}"
            items_payload.append({
                "id": item_id,
                "job_id": job_id,
                "lead_id": l_id,
                "sequence_step_id": sequence_step_id,
                "status": "pending",
                "attempts": 0,
                "error_message": None,
                "error_type": None,
                "resulting_draft_id": None,
                "idempotency_key": idempotency_key,
                "created_at": datetime.datetime.utcnow().isoformat(),
                "updated_at": datetime.datetime.utcnow().isoformat()
            })
            
        supabase.table("generation_job_items").insert(items_payload).execute()

        logger.info(f"Created Generation Job {job_id} with {len(items_payload)} items (sample_only={sample_only})")
        return job_payload

    @classmethod
    def cancel_generation_job(cls, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Transition job status to cancelled, flipping queued items to cancelled state.
        Already completed items are preserved.
        """
        # Fetch Job
        job_res = supabase.table("generation_jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
        if not job_res.data:
            raise ValueError(f"Job {job_id} not found")

        # Update pending items to cancelled
        supabase.table("generation_job_items").update({
            "status": "cancelled",
            "updated_at": datetime.datetime.utcnow().isoformat()
        }).eq("job_id", job_id).eq("status", "pending").execute()

        # Update job header status
        supabase.table("generation_jobs").update({
            "status": "cancelled",
            "updated_at": datetime.datetime.utcnow().isoformat()
        }).eq("id", job_id).execute()

        cls.sync_job_counts(job_id)
        logger.info(f"Cancelled Generation Job {job_id}")
        return {"job_id": job_id, "status": "cancelled"}

    @classmethod
    def retry_job_failures(cls, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Resets failed and cancelled items back to pending, triggering worker queue.
        """
        job_res = supabase.table("generation_jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
        if not job_res.data:
            raise ValueError(f"Job {job_id} not found")

        # Find items that failed or were cancelled
        for s in ["failed", "cancelled"]:
            supabase.table("generation_job_items").update({
                "status": "pending",
                "attempts": 0,
                "error_type": None,
                "error_message": None,
                "updated_at": datetime.datetime.utcnow().isoformat()
            }).eq("job_id", job_id).eq("status", s).execute()

        # Mark job status back to running/pending
        supabase.table("generation_jobs").update({
            "status": "pending",
            "updated_at": datetime.datetime.utcnow().isoformat()
        }).eq("id", job_id).execute()

        cls.sync_job_counts(job_id)
        logger.info(f"Triggered retry on failed items of job {job_id}")
        return {"job_id": job_id, "status": "pending"}

    @classmethod
    def resume_job(cls, job_id: str, user_id: str) -> Dict[str, Any]:
        """
        Resets stalled items in 'processing' state back to 'pending'.
        Useful for worker crash recovery.
        """
        job_res = supabase.table("generation_jobs").select("*").eq("id", job_id).eq("user_id", user_id).execute()
        if not job_res.data:
            raise ValueError(f"Job {job_id} not found")

        for s in ["processing", "pending"]:
            supabase.table("generation_job_items").update({
                "status": "pending",
                "error_type": None,
                "error_message": None,
                "updated_at": datetime.datetime.utcnow().isoformat()
            }).eq("job_id", job_id).eq("status", s).execute()

        supabase.table("generation_jobs").update({
            "status": "pending",
            "updated_at": datetime.datetime.utcnow().isoformat()
        }).eq("id", job_id).execute()

        cls.sync_job_counts(job_id)
        logger.info(f"Resumed incomplete items for job {job_id}")
        return {"job_id": job_id, "status": "pending"}

    @classmethod
    def sync_job_counts(cls, job_id: str) -> Dict[str, int]:
        """
        Queries status distribution of items and updates job aggregates header.
        """
        items_res = supabase.table("generation_job_items").select("status").eq("job_id", job_id).execute()
        items = items_res.data or []

        total = len(items)
        queued = sum(1 for i in items if i["status"] == "pending")
        processing = sum(1 for i in items if i["status"] == "processing")
        completed = sum(1 for i in items if i["status"] == "completed")
        failed = sum(1 for i in items if i["status"] == "failed")
        cancelled = sum(1 for i in items if i["status"] == "cancelled")

        # Determine overall job status
        job_status = "running"
        if queued == 0 and processing == 0:
            if failed > 0:
                job_status = "failed"
            elif cancelled > 0 and completed == 0:
                job_status = "cancelled"
            else:
                job_status = "completed"

        supabase.table("generation_jobs").update({
            "status": job_status,
            "total": total,
            "queued": queued,
            "processing": processing,
            "completed": completed,
            "failed": failed,
            "cancelled": cancelled,
            "updated_at": datetime.datetime.utcnow().isoformat()
        }).eq("id", job_id).execute()

        return {
            "total": total,
            "queued": queued,
            "processing": processing,
            "completed": completed,
            "failed": failed,
            "cancelled": cancelled
        }
