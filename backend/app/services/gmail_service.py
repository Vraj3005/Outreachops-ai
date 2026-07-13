import base64
import logging
import os
import re
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

from fastapi import HTTPException
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

from app.config import settings
from app.database import supabase
from app.services.error_service import (
    GmailAuthExpiredError,
    InvalidEmailError,
    MissingCredentialsError,
    OutreachOpsException,
)

logger = logging.getLogger("outreachops.services.gmail")


class GmailService:
    """
    Gmail OAuth Manager and Outbox Sender Service.
    """

    def __init__(self):
        self.creds_path = (
            os.getenv("GMAIL_CREDENTIALS_PATH") or settings.GMAIL_CREDENTIALS_PATH
        )
        self.token_path = os.getenv("GMAIL_TOKEN_PATH") or settings.GMAIL_TOKEN_PATH
        self.scopes = ["https://www.googleapis.com/auth/gmail.send"]

    def _get_db_credentials(self, user_id: str):
        import json

        from google.oauth2.credentials import Credentials

        from app.utils.crypto import decrypt_val

        try:
            res = (
                supabase.table("integration_connections")
                .select("*")
                .eq("user_id", user_id)
                .eq("provider", "gmail")
                .execute()
            )
            if not res.data:
                return None
            conn = res.data[0]
            if conn.get("connection_status") != "connected":
                return None

            creds_str = decrypt_val(conn.get("encrypted_credentials"))
            if not creds_str:
                return None

            creds_info = json.loads(creds_str)
            return Credentials(
                token=creds_info.get("token"),
                refresh_token=creds_info.get("refresh_token"),
                token_uri=creds_info.get(
                    "token_uri", "https://oauth2.googleapis.com/token"
                ),
                client_id=creds_info.get("client_id"),
                client_secret=creds_info.get("client_secret"),
                scopes=self.scopes,
            )
        except Exception as e:
            logger.error(f"Error loading credentials from database: {e}")
            return None

    def _save_db_credentials(self, user_id: str, creds):
        import json

        from app.utils.crypto import encrypt_val

        creds_info = {
            "token": creds.token,
            "refresh_token": creds.refresh_token,
            "token_uri": creds.token_uri,
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
        }
        encrypted = encrypt_val(json.dumps(creds_info))

        payload = {
            "user_id": user_id,
            "provider": "gmail",
            "connection_status": "connected",
            "encrypted_credentials": encrypted,
            "updated_at": datetime.utcnow().isoformat(),
        }

        res = (
            supabase.table("integration_connections")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", "gmail")
            .execute()
        )
        if res.data:
            supabase.table("integration_connections").update(payload).eq(
                "id", res.data[0]["id"]
            ).execute()
        else:
            import uuid

            payload["id"] = str(uuid.uuid4())
            supabase.table("integration_connections").insert(payload).execute()

    def check_connection_status(self, user_id: str) -> dict[str, Any]:
        """
        Returns Gmail OAuth state: connected, expired, or disconnected.
        """
        if settings.DEMO_MODE:
            return {
                "status": (
                    "connected" if settings.DEMO_SENDING_ENABLED else "disconnected"
                ),
                "details": "Demo Mode active. Simulated Gmail connected status.",
            }

        creds = self._get_db_credentials(user_id)
        if not creds:
            return {
                "status": "disconnected",
                "details": "No OAuth tokens found. Please run authorization.",
            }

        if creds.valid:
            return {"status": "connected", "details": "Active session initialized."}

        # Token is expired
        if creds.expired and creds.refresh_token:
            try:
                logger.info("Attempting to refresh expired Gmail OAuth token...")
                creds.refresh(Request())
                self._save_db_credentials(user_id, creds)
                return {
                    "status": "connected",
                    "details": "Token refreshed successfully.",
                }
            except Exception as e:
                logger.error(f"Failed to refresh Gmail OAuth token: {e}")
                return {
                    "status": "disconnected",
                    "details": f"Failed to refresh cached tokens: {e}",
                }

        return {
            "status": "disconnected",
            "details": "Gmail OAuth credentials have expired.",
        }

    def run_oauth_flow(self, user_id: str) -> dict[str, Any]:
        """
        Starts authorization flow and caches credentials securely in DB.
        """
        if settings.DEMO_MODE:
            return {
                "status": "connected",
                "message": "Demo mode active. OAuth bypass success.",
            }

        if not self.creds_path or not os.path.exists(self.creds_path):
            raise MissingCredentialsError(
                message="Missing gmail_credentials.json. Cannot run OAuth flow."
            )

        try:
            flow = InstalledAppFlow.from_client_secrets_file(
                self.creds_path, self.scopes
            )
            # Starts local oauth server
            creds = flow.run_local_server(port=0)

            # Save in database
            self._save_db_credentials(user_id, creds)

            logger.info("Gmail OAuth authentication successful.")
            return {
                "status": "connected",
                "message": "Successfully authenticated and cached token.",
            }
        except Exception as e:
            logger.error(f"Gmail OAuth connection flow crashed: {e}")
            return {"status": "failed", "error": str(e)}

    def revoke_connection(self, user_id: str) -> dict[str, Any]:
        """
        Revokes Gmail integration credentials by deleting database records.
        """
        try:
            supabase.table("integration_connections").delete().eq(
                "user_id", user_id
            ).eq("provider", "gmail").execute()
            return {"status": "success", "message": "Connection revoked successfully."}
        except Exception as e:
            logger.error(f"Failed to revoke Gmail connection: {e}")
            return {"status": "failed", "error": str(e)}

    def _get_gmail_client(self, user_id: str):
        """Loads and returns the built googleapiclient Gmail resource client."""
        if settings.DEMO_MODE:
            return None

        status = self.check_connection_status(user_id)
        if status["status"] != "connected":
            raise GmailAuthExpiredError(
                message="Gmail Client is offline. Authorize Gmail first."
            )

        creds = self._get_db_credentials(user_id)
        return build("gmail", "v1", credentials=creds)

    def is_valid_email(self, email: str) -> bool:
        if not email:
            return False
        return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email.strip()))

    def send_approved_email(self, draft_id: str, user_id: str) -> dict[str, Any]:
        """
        Validates draft approval status, checks DNC records, and dispatches email via Gmail API.
        Logs every attempt to Supabase send_logs.
        """
        if not supabase:
            return {"status": "failed", "error": "Database client offline"}

        try:
            # 1. Fetch Draft Details
            draft_res = (
                supabase.table("email_drafts").select("*").eq("id", draft_id).execute()
            )
            if not draft_res.data:
                raise HTTPException(status_code=404, detail="Email draft not found")
            draft = draft_res.data[0]

            if draft.get("status") != "approved":
                return {
                    "status": "skipped",
                    "reason": f"Draft status is '{draft.get('status')}', not 'approved'.",
                }

            lead_id = draft.get("lead_id")
            email_type = draft.get("email_type")
            subject = draft.get("subject") or ""
            body = draft.get("body") or ""

            # 2. Fetch Lead Details
            lead_res = supabase.table("leads").select("*").eq("id", lead_id).execute()
            if not lead_res.data:
                return {
                    "status": "failed",
                    "error": f"Associated lead '{lead_id}' not found.",
                }
            lead = lead_res.data[0]
            recipient_email = lead.get("contact_email") or ""

            # 3. Validate Email
            if not self.is_valid_email(recipient_email):
                try:
                    # Update draft and insert failed log
                    supabase.table("email_drafts").update(
                        {
                            "status": "failed",
                            "last_error": "Invalid or missing recipient email",
                        }
                    ).eq("id", draft_id).execute()

                    supabase.table("send_logs").insert(
                        {
                            "draft_id": draft_id,
                            "lead_id": lead_id,
                            "user_id": user_id,
                            "recipient_email": recipient_email,
                            "subject": subject,
                            "email_type": email_type,
                            "status": "failed",
                            "error_message": "Invalid or missing recipient email",
                        }
                    ).execute()
                except Exception as db_err:
                    logger.error(f"Failed to write failure log: {db_err}")

                raise InvalidEmailError(
                    message=f"Recipient email '{recipient_email}' is invalid."
                )

            # 4. Check Do Not Contact List
            dnc_check = (
                supabase.table("do_not_contact")
                .select("id")
                .eq("user_id", user_id)
                .eq("email", recipient_email)
                .execute()
            )
            if dnc_check.data:
                logger.warning(
                    f"Prevented mailing. Lead '{recipient_email}' is on Do Not Contact (DNC) list."
                )

                try:
                    supabase.table("email_drafts").update(
                        {
                            "status": "rejected",
                            "last_error": "Blocked by Do Not Contact (DNC) list",
                        }
                    ).eq("id", draft_id).execute()

                    supabase.table("send_logs").insert(
                        {
                            "draft_id": draft_id,
                            "lead_id": lead_id,
                            "user_id": user_id,
                            "recipient_email": recipient_email,
                            "subject": subject,
                            "email_type": email_type,
                            "status": "failed",
                            "error_message": "Recipient email is blocked by Do Not Contact (DNC) list",
                        }
                    ).execute()
                except Exception as db_err:
                    logger.error(f"Failed to write DNC rejection log: {db_err}")

                return {
                    "status": "blocked",
                    "reason": "Recipient listed on Do Not Contact (DNC)",
                }
        except (HTTPException, OutreachOpsException):
            raise
        except Exception as e:
            logger.error(f"Database error during send initialization: {e}")
            return {"status": "failed", "error": f"Database connection error: {e}"}

        # 5. Connect and Send via Gmail
        try:
            if settings.DEMO_MODE:
                gmail_message_id = (
                    f"demo_msg_{draft_id}_{int(datetime.now().timestamp())}"
                )
                logger.info(
                    f"Demo Mode: Simulating email dispatch to {recipient_email}. Generated ID: {gmail_message_id}"
                )
            else:
                gmail_client = self._get_gmail_client()

                message = MIMEMultipart()
                message["to"] = recipient_email
                message["subject"] = subject
                message.attach(MIMEText(body, "plain", "utf-8"))
                raw_msg = base64.urlsafe_b64encode(message.as_bytes()).decode()

                # Dispatch
                res = (
                    gmail_client.users()
                    .messages()
                    .send(userId="me", body={"raw": raw_msg})
                    .execute()
                )
                gmail_message_id = res.get("id")

            # Update Draft State
            supabase.table("email_drafts").update(
                {"status": "sent", "sent_at": datetime.now().isoformat()}
            ).eq("id", draft_id).execute()

            # Insert Success Log
            supabase.table("send_logs").insert(
                {
                    "draft_id": draft_id,
                    "lead_id": lead_id,
                    "user_id": user_id,
                    "recipient_email": recipient_email,
                    "subject": subject,
                    "email_type": email_type,
                    "status": "sent",
                    "gmail_message_id": gmail_message_id,
                }
            ).execute()

            return {"status": "success", "gmail_message_id": gmail_message_id}

        except Exception as e:
            logger.error(f"Gmail transmission failed: {e}")

            # Update Draft State to Failed
            supabase.table("email_drafts").update(
                {"status": "failed", "last_error": str(e)}
            ).eq("id", draft_id).execute()

            # Insert Failed Log
            supabase.table("send_logs").insert(
                {
                    "draft_id": draft_id,
                    "lead_id": lead_id,
                    "user_id": user_id,
                    "recipient_email": recipient_email,
                    "subject": subject,
                    "email_type": email_type,
                    "status": "failed",
                    "error_message": str(e),
                }
            ).execute()

            return {"status": "failed", "error": str(e)}
