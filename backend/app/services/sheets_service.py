import logging
import os
from typing import Any

import gspread
from google.oauth2.service_account import Credentials

from app.config import settings
from app.database import supabase
from app.services.error_service import GoogleSheetTabError, MissingCredentialsError

logger = logging.getLogger("outreachops.services.sheets")


class SheetsService:
    """
    Service to authorize, fetch, and import lead rows from Google Sheets.
    """

    def __init__(self):
        self.creds_path = (
            os.getenv("GOOGLE_SHEETS_CREDENTIALS_PATH")
            or settings.SHEETS_CREDENTIALS_PATH
        ).strip()
        if self.creds_path and not os.path.exists(self.creds_path):
            alt_path = os.path.join("backend", self.creds_path)
            if os.path.exists(alt_path):
                self.creds_path = alt_path
        self.sheet_name = settings.GOOGLE_SHEET_NAME.strip()
        self.main_tab = settings.MAIN_TAB_NAME.strip()

    def _get_client(self, user_id: str) -> gspread.Client:
        """Initializes authorized gspread client using Service Account JSON."""
        import json

        from app.utils.crypto import decrypt_val

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]

        # Try database credentials first
        try:
            res = (
                supabase.table("integration_connections")
                .select("*")
                .eq("user_id", user_id)
                .eq("provider", "google_sheets")
                .execute()
            )
            if res.data and res.data[0].get("connection_status") == "connected":
                sa_str = decrypt_val(res.data[0].get("encrypted_credentials"))
                if sa_str:
                    creds_info = json.loads(sa_str)
                    creds = Credentials.from_service_account_info(
                        creds_info, scopes=scopes
                    )
                    client = gspread.authorize(creds)
                    client.set_timeout(15.0)
                    return client
        except Exception as e:
            logger.warning(
                f"Failed to load Sheets service account from DB: {e}. Checking local file..."
            )

        if not self.creds_path or not os.path.exists(self.creds_path):
            raise MissingCredentialsError(
                message=f"Google Sheets credentials file not found at: {self.creds_path}. Check GOOGLE_SHEETS_CREDENTIALS_PATH env.",
                details={"credentials_path": self.creds_path},
            )
        try:
            creds = Credentials.from_service_account_file(
                self.creds_path, scopes=scopes
            )
            client = gspread.authorize(creds)
            client.set_timeout(15.0)
            return client
        except Exception as e:
            logger.error(f"Google Sheets OAuth authorization failed: {e}")
            raise MissingCredentialsError(
                message="Google Sheets Service Account authentication failed.",
                details={"error": str(e)},
            )

    def import_leads(self, user_id: str) -> dict[str, Any]:
        """
        Reads columns A-E, filters out duplicate contacts, and inserts new rows into Supabase.
        """
        if settings.DEMO_MODE:
            logger.info("Demo Mode: Active. Ingesting mock leads into database.")
            mock_leads = [
                {
                    "row_num": "2",
                    "website": "apex-roofing-mock.com",
                    "company_name": "Apex Roofing Solutions",
                    "pain_points": "Slow contact forms, mobile view layout shift.",
                    "erp_approach": "centralized job scheduling, subcontractor tracking",
                    "email": "demo@example.com",
                },
                {
                    "row_num": "3",
                    "website": "beacon-masonry-mock.com",
                    "company_name": "Beacon Masonry Inc",
                    "pain_points": "No lead capture CTA, outdated project visual showcase.",
                    "erp_approach": "job-costing ledger, purchase approval workflows",
                    "email": "demo@example.com",
                },
                {
                    "row_num": "4",
                    "website": "summit-hvac-mock.com",
                    "company_name": "Summit HVAC Services",
                    "pain_points": "Booking tool is broken on iOS safari.",
                    "erp_approach": "dispatching board, field service app",
                    "email": "demo@example.com",
                },
                {
                    "row_num": "5",
                    "website": "primeglass-mock.com",
                    "company_name": "Prime Glass & Glazing",
                    "pain_points": "No dynamic quote estimate workflow.",
                    "erp_approach": "estimate approvals portal, job status triggers",
                    "email": "demo@example.com",
                },
                {
                    "row_num": "6",
                    "website": "vanguard-build-mock.net",
                    "company_name": "Vanguard Builders",
                    "pain_points": "Heavy pdf downloads for portfolio page.",
                    "erp_approach": "subcontractor tracking, RFI logs",
                    "email": "demo@example.com",
                },
            ]

            imported_count = 0
            duplicate_count = 0

            if not supabase:
                return {
                    "imported": 0,
                    "skipped_duplicates": 0,
                    "total_processed": 0,
                    "error": "Database client offline",
                }

            for lead in mock_leads:
                try:
                    duplicate_check = (
                        supabase.table("leads")
                        .select("id")
                        .eq("user_id", user_id)
                        .eq("website", lead["website"])
                        .eq("contact_email", lead["email"])
                        .execute()
                    )

                    if duplicate_check.data:
                        duplicate_count += 1
                        continue

                    supabase.table("leads").insert(
                        {
                            "user_id": user_id,
                            "company_name": lead["company_name"],
                            "website": lead["website"],
                            "contact_email": lead["email"],
                            "website_pain_points": lead["pain_points"],
                            "erp_approach": lead["erp_approach"],
                            "lead_status": "Pending",
                            "source_sheet_name": "Demo Sheet",
                            "source_row_number": lead["row_num"],
                        }
                    ).execute()
                    imported_count += 1
                except Exception as e:
                    logger.error(f"Failed to ingest mock lead: {e}")

            return {
                "imported": imported_count,
                "skipped_duplicates": duplicate_count,
                "total_processed": len(mock_leads),
            }

        client = self._get_client(user_id)

        try:
            sheet = client.open(self.sheet_name)
        except Exception as e:
            logger.error(f"Spreadsheet '{self.sheet_name}' not found: {e}")
            raise GoogleSheetTabError(
                message=f"Google Sheet '{self.sheet_name}' could not be opened.",
                details={"error": str(e)},
            )

        try:
            worksheet = sheet.worksheet(self.main_tab)
        except gspread.exceptions.WorksheetNotFound as e:
            logger.error(f"Worksheet tab '{self.main_tab}' not found: {e}")
            raise GoogleSheetTabError(
                message=f"Worksheet tab '{self.main_tab}' not found in sheet '{self.sheet_name}'.",
                details={"sheet_name": self.sheet_name, "tab_name": self.main_tab},
            )
        except Exception as e:
            logger.error(f"Error accessing worksheet: {e}")
            raise GoogleSheetTabError(message=f"Error accessing worksheet tab: {e}")

        # Fetch all rows from spreadsheet
        try:
            all_rows = worksheet.get_all_values()
        except Exception as e:
            logger.error(f"Failed to fetch spreadsheet rows: {e}")
            raise GoogleSheetTabError(
                message="Failed to read spreadsheet data", details={"error": str(e)}
            )

        if len(all_rows) <= 1:
            return {"imported": 0, "skipped_duplicates": 0, "total": 0}

        headers = all_rows[0]
        data_rows = all_rows[1:]

        imported_count = 0
        duplicate_count = 0

        # Sync connection to Supabase database leads checklist
        if not supabase:
            logger.error("Supabase client not initialized. Cannot sync leads.")
            return {
                "imported": 0,
                "skipped_duplicates": 0,
                "total": 0,
                "error": "Database client offline",
            }

        for idx, row in enumerate(data_rows, start=2):
            # Ensure row length matches columns A-E
            row = list(row) + [""] * max(0, 5 - len(row))
            row_num = str(row[0]).strip()
            website = str(row[1]).strip()
            pain_points = str(row[2]).strip()
            erp_approach = str(row[3]).strip()
            contact_email = str(row[4]).strip()

            if not website or not contact_email:
                continue

            try:
                # Check for duplicates by website + contact_email combination in Supabase
                duplicate_check = (
                    supabase.table("leads")
                    .select("id")
                    .eq("user_id", user_id)
                    .eq("website", website)
                    .eq("contact_email", contact_email)
                    .execute()
                )

                if duplicate_check.data:
                    duplicate_count += 1
                    logger.info(f"Skipping duplicate lead: {website} | {contact_email}")
                    continue

                # Insert lead into Supabase
                supabase.table("leads").insert(
                    {
                        "user_id": user_id,
                        "company_name": website.split(".")[0].capitalize(),
                        "website": website,
                        "contact_email": contact_email,
                        "website_pain_points": pain_points,
                        "erp_approach": erp_approach,
                        "lead_status": "Pending",
                        "source_sheet_name": self.sheet_name,
                        "source_row_number": row_num,
                    }
                ).execute()

                imported_count += 1

            except Exception as e:
                logger.error(f"Failed to ingest row {idx} for website {website}: {e}")

        return {
            "imported": imported_count,
            "skipped_duplicates": duplicate_count,
            "total_processed": len(data_rows),
        }
