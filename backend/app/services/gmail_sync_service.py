import datetime
import logging
from typing import Any

from googleapiclient.errors import HttpError

from app.config import settings
from app.database import supabase
from app.services.gmail_service import GmailService
from app.services.reply_classification_service import ReplyClassificationService

logger = logging.getLogger("outreachops.services.gmail_sync_service")


class GmailSyncService:

    @classmethod
    def sync_all_connections(cls):
        """Ticks reply syncing for all active connected Gmail integration endpoints."""
        if not supabase:
            return

        try:
            conns = (
                supabase.table("integration_connections")
                .select("*")
                .eq("provider", "gmail")
                .eq("connection_status", "connected")
                .execute()
            )
        except Exception as e:
            logger.error(f"Failed to fetch active integration connections: {e}")
            return

        for conn in conns.data or []:
            try:
                cls.sync_user_replies(conn["user_id"])
            except Exception as e:
                logger.error(f"Failed syncing replies for user {conn['user_id']}: {e}")

    @classmethod
    def sync_user_replies(cls, user_id: str):
        """Processes incremental history or fallback messages list for a single user connection."""
        gmail_service = GmailService()

        # 1. Load connection details
        conn_res = (
            supabase.table("integration_connections")
            .select("*")
            .eq("user_id", user_id)
            .eq("provider", "gmail")
            .execute()
        )
        if not conn_res.data:
            logger.warning(f"No active Gmail connection found for user {user_id}")
            return

        connection = conn_res.data[0]
        last_history_id = connection.get("last_history_id")

        if settings.DEMO_MODE:
            cls._mock_demo_sync(user_id)
            return

        try:
            gmail_client = gmail_service._get_gmail_client(user_id)
        except Exception as e:
            logger.error(f"Failed to instantiate Gmail client for user {user_id}: {e}")
            return

        # 2. Get profile email to ignore own sent messages
        try:
            profile = gmail_client.users().getProfile(userId="me").execute()
            user_email = profile.get("emailAddress", "").strip().lower()
        except Exception as e:
            logger.error(f"Failed to load Gmail user profile: {e}")
            user_email = ""

        # 3. Synchronize history
        messages_to_process = []
        new_history_id = last_history_id

        if last_history_id:
            try:
                logger.info(
                    f"Initiating incremental Gmail history sync from history ID: {last_history_id}"
                )
                history_res = (
                    gmail_client.users()
                    .history()
                    .list(
                        userId="me",
                        startHistoryId=last_history_id,
                        historyTypes=["messageAdded"],
                    )
                    .execute()
                )

                history_records = history_res.get("history", [])
                for h in history_records:
                    for add_event in h.get("messagesAdded", []):
                        msg = add_event.get("message")
                        if msg:
                            messages_to_process.append(msg)

                new_history_id = history_res.get("historyId", last_history_id)
            except HttpError as e:
                # Expired history ID yields 404/400. Perform fallback full scan
                if e.resp.status in [400, 404]:
                    logger.warning(
                        f"History ID {last_history_id} expired. Falling back to Inbox scan."
                    )
                    messages_to_process = cls._fetch_inbox_fallback(gmail_client)
                else:
                    raise e
        else:
            # First-time sync: Fetch current inbox messages
            messages_to_process = cls._fetch_inbox_fallback(gmail_client)

        # 4. Fetch the latest historyId from the most recent messages to establish new baseline
        if not new_history_id and messages_to_process:
            new_history_id = messages_to_process[0].get("historyId")
        if not new_history_id:
            try:
                profile_res = gmail_client.users().getProfile(userId="me").execute()
                new_history_id = profile_res.get("historyId")
            except Exception:
                pass

        # 5. Process each incoming message candidate
        cls._process_messages_batch(
            user_id, gmail_client, user_email, messages_to_process
        )

        # 6. Update baseline history ID
        if new_history_id:
            supabase.table("integration_connections").update(
                {
                    "last_history_id": str(new_history_id),
                    "updated_at": datetime.datetime.now(datetime.UTC).isoformat(),
                }
            ).eq("user_id", user_id).eq("provider", "gmail").execute()

    @classmethod
    def _fetch_inbox_fallback(cls, gmail_client) -> list[dict[str, Any]]:
        """Scans the inbox when history ID is unavailable/expired."""
        try:
            logger.info("Executing fallback recent Inbox scan...")
            res = (
                gmail_client.users()
                .messages()
                .list(userId="me", q="is:inbox", maxResults=50)
                .execute()
            )
            return res.get("messages", [])
        except Exception as e:
            logger.error(f"Fallback scan failed: {e}")
            return []

    @classmethod
    def _process_messages_batch(
        cls, user_id: str, gmail_client, user_email: str, messages: list[dict[str, Any]]
    ):
        """Processes email messages metadata details, filters replies, and classifies outcomes."""
        for msg_summary in messages:
            msg_id = msg_summary["id"]
            thread_id = msg_summary["threadId"]

            # Avoid processing duplicate event IDs
            try:
                exist_check = (
                    supabase.table("reply_events")
                    .select("id")
                    .eq("gmail_message_id", msg_id)
                    .execute()
                )
                if exist_check.data:
                    continue
            except Exception:
                pass

            # Fetch complete message content details
            try:
                msg = (
                    gmail_client.users()
                    .messages()
                    .get(userId="me", id=msg_id, format="full")
                    .execute()
                )
            except Exception as e:
                logger.error(f"Failed to fetch message details for {msg_id}: {e}")
                continue

            # Extract Headers
            headers = msg.get("payload", {}).get("headers", [])
            headers_dict = {h["name"].lower(): h["value"] for h in headers}

            sender = headers_dict.get("from", "")
            subject = headers_dict.get("subject", "")
            recipients = headers_dict.get("to", "")

            # Ignore own sent messages
            clean_sender = cls._extract_email_address(sender)
            if clean_sender == user_email.strip().lower():
                logger.info(f"Ignoring self-sent message {msg_id}")
                continue

            # Resolve thread relationship mapping (Find corresponding lead and campaign)
            lead_id, campaign_id = cls._resolve_thread_mapping(thread_id, clean_sender)
            if not lead_id or not campaign_id:
                logger.debug(
                    f"Message thread {thread_id} does not map to any active outreach lead. Skipped."
                )
                continue

            # Extract Clean Body Excerpt
            body = cls._parse_message_body(msg.get("payload", {}))

            # Trigger Classification & Sequence Stopping Logic
            ReplyClassificationService.classify_and_process(
                user_id=user_id,
                campaign_id=campaign_id,
                lead_id=lead_id,
                gmail_message_id=msg_id,
                sender=sender,
                subject=subject,
                body=body,
            )

    @classmethod
    def _resolve_thread_mapping(
        cls, thread_id: str, clean_sender: str
    ) -> tuple[str | None, str | None]:
        """Resolves lead and campaign associations by matching the Gmail thread ID."""
        try:
            # Query send events by thread id
            res = (
                supabase.table("send_events")
                .select("lead_id, campaign_id")
                .eq("gmail_thread_id", thread_id)
                .execute()
            )

            if res.data:
                return res.data[0]["lead_id"], res.data[0]["campaign_id"]

            # Subject fallback: match by lead email address and active campaign enrollment
            lead_res = (
                supabase.table("leads")
                .select("id")
                .eq("contact_email", clean_sender)
                .execute()
            )
            if lead_res.data:
                lead_id = lead_res.data[0]["id"]
                # Find matching active campaign lead enrollment
                cl_res = (
                    supabase.table("campaign_leads")
                    .select("campaign_id")
                    .eq("lead_id", lead_id)
                    .eq("status", "waiting")
                    .execute()
                )
                if cl_res.data:
                    return lead_id, cl_res.data[0]["campaign_id"]

            return None, None
        except Exception as e:
            logger.error(f"Error resolving thread mapping: {e}")
            return None, None

    @classmethod
    def _extract_email_address(cls, full_header: str) -> str:
        import re

        match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", full_header)
        return match.group(0).lower().strip() if match else full_header.lower().strip()

    @classmethod
    def _parse_message_body(cls, payload: dict[str, Any]) -> str:
        """Helper to parse raw email MIME parts recursively."""
        mime_type = payload.get("mimeType", "")
        parts = payload.get("parts", [])
        body_data = payload.get("body", {}).get("data", "")

        if "text/plain" in mime_type and body_data:
            import base64

            try:
                return base64.urlsafe_b64decode(body_data).decode("utf-8")
            except Exception:
                return ""

        for part in parts:
            ret = cls._parse_message_body(part)
            if ret:
                return ret

        return ""

    @classmethod
    def _mock_demo_sync(cls, user_id: str):
        """Simulation mock for demo sandbox mode."""
        logger.info(
            f"[Demo Mode] Simulating inbound reply scan tick for user {user_id}"
        )

        # Check if we have active campaign leads waiting to simulate a reply
        try:
            cl_res = (
                supabase.table("campaign_leads")
                .select("campaign_id, lead_id")
                .eq("status", "waiting")
                .limit(1)
                .execute()
            )
            if not cl_res.data:
                return

            lead_id = cl_res.data[0]["lead_id"]
            campaign_id = cl_res.data[0]["campaign_id"]

            # Check if we already received a reply for this lead to avoid infinite loops
            rep_check = (
                supabase.table("reply_events")
                .select("id")
                .eq("lead_id", lead_id)
                .eq("campaign_id", campaign_id)
                .execute()
            )
            if rep_check.data:
                return

            lead = (
                supabase.table("leads")
                .select("contact_email")
                .eq("id", lead_id)
                .execute()
                .data[0]
            )

            # Generate simulated reply
            import random

            sim_types = [
                (
                    "Interested in scheduling a meeting. Call me next week.",
                    "positive/interested",
                ),
                ("Please unsubscribe me from this list immediately.", "unsubscribe"),
                (
                    "This is an out of office reply. I am on vacation until Monday.",
                    "out of office",
                ),
            ]
            body, cat = random.choice(sim_types)

            ReplyClassificationService.classify_and_process(
                user_id=user_id,
                campaign_id=campaign_id,
                lead_id=lead_id,
                gmail_message_id=f"demo_inbound_{int(datetime.datetime.now().timestamp())}",
                sender=lead["contact_email"],
                subject="Re: Operational efficiency improvements",
                body=body,
            )
        except Exception as e:
            logger.error(f"Demo sync failed: {e}")
