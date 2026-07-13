import json
import math
import logging
from typing import Dict, Any, List

from app.database import supabase

logger = logging.getLogger("outreachops.services.analytics_service")


class AnalyticsService:

    @classmethod
    def get_funnel_metrics(cls, user_id: str, campaign_id: str = None) -> Dict[str, int]:
        """
        Assembles funnel stages: imported -> researched -> generated -> approved -> scheduled -> sent -> replied -> positive_reply.
        """
        if not supabase:
            return {}

        try:
            # Base query builders
            leads_q = supabase.table("leads").select("id", count="exact").eq("user_id", user_id)
            drafts_q = supabase.table("email_drafts").select("status", count="exact").eq("user_id", user_id)
            sched_q = supabase.table("scheduled_emails").select("id", count="exact").eq("user_id", user_id)
            events_q = supabase.table("send_events").select("event_type", count="exact").eq("user_id", user_id)

            if campaign_id:
                # Filter by campaign
                cl_res = supabase.table("campaign_leads").select("lead_id").eq("campaign_id", campaign_id).execute()
                lead_ids = [r["lead_id"] for r in (cl_res.data or [])]
                
                leads_q = leads_q.in_("id", lead_ids) if lead_ids else leads_q.eq("id", "none")
                drafts_q = drafts_q.eq("campaign_id", campaign_id)
                sched_q = sched_q.eq("campaign_id", campaign_id)
                events_q = events_q.eq("campaign_id", campaign_id)

            # 1. Imported Leads
            imported = leads_q.execute().count or 0

            # 2. Researched
            # Researched counts as leads that have custom_fields website data or tags
            res_res = leads_q.execute()
            researched = sum(1 for l in (res_res.data or []) if l.get("custom_fields") or l.get("tags"))

            # 3. Generated Drafts
            drafts_data = drafts_q.execute().data or []
            generated = len(drafts_data)

            # 4. Approved Drafts
            approved = sum(1 for d in drafts_data if d["status"] in ["approved", "sent"])

            # 5. Scheduled Outbox
            scheduled = sched_q.eq("status", "pending").execute().count or 0

            # 6. Sent Emails
            events_data = events_q.execute().data or []
            sent = sum(1 for e in events_data if e["event_type"] == "sent")

            # 7. Replied
            replied = sum(1 for e in events_data if e["event_type"] in ["reply", "replied"])

            # 8. Positive Replied
            positive = sum(1 for e in events_data if e["event_type"] == "positive_reply")

            return {
                "imported": imported,
                "researched": researched,
                "generated": generated,
                "approved": approved,
                "scheduled": scheduled,
                "sent": sent,
                "replied": replied,
                "positive_reply": positive
            }
        except Exception as e:
            logger.error(f"Failed assembling funnel analytics: {e}")
            return {}

    @classmethod
    def get_experiment_report(cls, user_id: str, experiment_id: str) -> Dict[str, Any]:
        """
        Computes sample sizes, sends, replies, rate differences, confidence intervals,
        and statistical significance winner declarations for an A/B experiment.
        """
        if not supabase:
            return {}

        try:
            exp_res = supabase.table("experiments").select("*").eq("id", experiment_id).execute()
            if not exp_res.data:
                return {"error": "Experiment not found"}
            experiment = exp_res.data[0]

            # Fetch variant definitions
            var_res = supabase.table("experiment_variants").select("*").eq("experiment_id", experiment_id).execute()
            variants = var_res.data or []

            # Fetch assignments counts
            assign_res = supabase.table("experiment_assignments").select("*").eq("experiment_id", experiment_id).execute()
            assignments = assign_res.data or []

            # Fetch all send events associated with this campaign
            campaign_id = variants[0]["campaign_id"] if variants else "none"
            events_res = supabase.table("send_events")\
                .select("*")\
                .eq("campaign_id", campaign_id)\
                .execute()
            events = events_res.data or []

            # Aggregate stats per variant
            report_variants = []
            for v in variants:
                v_name = v["name"]
                
                # Sample count (leads assigned)
                samples = sum(1 for a in assignments if a["variant_name"] == v_name)
                
                # Sends
                sends = sum(1 for e in events if e.get("variant_name") == v_name and e["event_type"] == "sent")
                
                # Replies
                replies = sum(1 for e in events if e.get("variant_name") == v_name and e["event_type"] in ["reply", "replied"])
                
                # Positive replies
                positives = sum(1 for e in events if e.get("variant_name") == v_name and e["event_type"] == "positive_reply")

                reply_rate = (replies / sends) if sends > 0 else 0.0
                positive_rate = (positives / sends) if sends > 0 else 0.0

                report_variants.append({
                    "id": v["id"],
                    "name": v_name,
                    "prompt_template_version_id": v.get("prompt_template_version_id"),
                    "sample_count": samples,
                    "sends": sends,
                    "replies": replies,
                    "positive_replies": positives,
                    "reply_rate": reply_rate,
                    "positive_rate": positive_rate
                })

            # Statistical Significance Comparison (if exactly 2 variants exist)
            comparison = {}
            if len(report_variants) == 2:
                v1, v2 = report_variants[0], report_variants[1]
                n1, n2 = v1["sends"], v2["sends"]
                r1, r2 = v1["replies"], v2["replies"]
                
                p1 = v1["reply_rate"]
                p2 = v2["reply_rate"]
                rate_diff = p1 - p2

                # Standard error of difference
                se = 0.0
                ci_lower = 0.0
                ci_upper = 0.0
                insufficient_data = (n1 < 50 or n2 < 50)

                if not insufficient_data:
                    # 95% Confidence Interval
                    se = math.sqrt((p1 * (1 - p1) / n1) + (p2 * (1 - p2) / n2))
                    margin_error = 1.96 * se
                    ci_lower = rate_diff - margin_error
                    ci_upper = rate_diff + margin_error

                # Determine winner
                winner = "No statistically significant winner yet"
                if not insufficient_data:
                    # If interval does not cross zero, it's significant
                    if ci_lower > 0:
                        winner = f"Variant {v1['name']} is the statistically significant winner"
                    elif ci_upper < 0:
                        winner = f"Variant {v2['name']} is the statistically significant winner"

                comparison = {
                    "rate_difference": rate_diff,
                    "standard_error": se,
                    "confidence_interval_95": [ci_lower, ci_upper],
                    "insufficient_data": insufficient_data,
                    "declared_winner": winner,
                    "min_required_sends": 50
                }

            return {
                "experiment_id": experiment_id,
                "name": experiment["name"],
                "status": experiment["status"],
                "primary_metric": experiment.get("primary_metric", "reply_rate"),
                "variants": report_variants,
                "comparison": comparison
            }
        except Exception as e:
            logger.error(f"Failed generating A/B experiment report: {e}")
            return {"error": str(e)}
