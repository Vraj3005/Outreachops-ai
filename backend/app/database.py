import logging
import os
import sqlite3
import uuid
from typing import Any

from app.config import settings
from supabase import create_client

logger = logging.getLogger("outreachops.database")


class SQLiteSupabaseResult:
    def __init__(self, data: list[dict[str, Any]], count: int | None = None):
        self.data = data
        self.count = count


class SQLiteQueryBuilder:
    def __init__(self, db_path: str, table_name: str):
        self.db_path = db_path
        self.table_name = table_name
        self.op = "select"  # select, insert, update, delete, upsert
        self.select_fields = "*"
        self.count_mode = None
        self.payload = None
        self.filters = []
        self.orders = []
        self.limit_val = None

    def select(self, fields="*", count=None):
        self.op = "select"
        self.select_fields = fields
        self.count_mode = count
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def delete(self):
        self.op = "delete"
        return self

    def upsert(self, payload, on_conflict=None):
        self.op = "upsert"
        self.payload = payload
        return self

    def eq(self, column, value):
        self.filters.append((column, "=", value))
        return self

    def neq(self, column, value):
        self.filters.append((column, "!=", value))
        return self

    def gte(self, column, value):
        self.filters.append((column, ">=", value))
        return self

    def order(self, column, desc=False):
        self.orders.append((column, "DESC" if desc else "ASC"))
        return self

    def limit(self, limit_val):
        self.limit_val = limit_val
        return self

    def execute(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        try:
            if self.op == "select":
                sql = f"SELECT * FROM {self.table_name}"
                params = []

                if self.filters:
                    where_clauses = []
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                    sql += " WHERE " + " AND ".join(where_clauses)

                if self.orders:
                    order_clauses = [f"{col} {dir}" for col, dir in self.orders]
                    sql += " ORDER BY " + ", ".join(order_clauses)

                if self.limit_val is not None:
                    sql += f" LIMIT {self.limit_val}"

                cursor.execute(sql, params)
                rows = cursor.fetchall()
                data = [dict(r) for r in rows]

                count_val = None
                if self.count_mode == "exact" or "count" in self.select_fields:
                    count_sql = f"SELECT COUNT(*) FROM {self.table_name}"
                    if self.filters:
                        count_sql += " WHERE " + " AND ".join(
                            [f"{col} {op} ?" for col, op, _ in self.filters]
                        )
                    cursor.execute(count_sql, params[: len(self.filters)])
                    count_val = cursor.fetchone()[0]

                return SQLiteSupabaseResult(data, count_val)

            elif self.op == "insert":
                payloads = (
                    self.payload if isinstance(self.payload, list) else [self.payload]
                )
                inserted_rows = []

                for p in payloads:
                    p = dict(p)
                    if "id" not in p or not p["id"]:
                        p["id"] = str(uuid.uuid4())

                    columns = list(p.keys())
                    placeholders = ["?" for _ in columns]
                    sql = f"INSERT INTO {self.table_name} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
                    cursor.execute(sql, [p[col] for col in columns])

                    cursor.execute(
                        f"SELECT * FROM {self.table_name} WHERE id = ?", (p["id"],)
                    )
                    inserted_rows.append(dict(cursor.fetchone()))

                conn.commit()
                return SQLiteSupabaseResult(inserted_rows)

            elif self.op == "update":
                where_clauses = []
                params = []
                if self.filters:
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                where_sql = (
                    " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                )

                cursor.execute(f"SELECT id FROM {self.table_name}{where_sql}", params)
                matching_ids = [r["id"] for r in cursor.fetchall()]

                update_cols = []
                update_params = []
                for k, v in self.payload.items():
                    update_cols.append(f"{k} = ?")
                    update_params.append(v)

                sql = (
                    f"UPDATE {self.table_name} SET {', '.join(update_cols)}{where_sql}"
                )
                cursor.execute(sql, update_params + params)

                updated_rows = []
                for row_id in matching_ids:
                    cursor.execute(
                        f"SELECT * FROM {self.table_name} WHERE id = ?", (row_id,)
                    )
                    updated_rows.append(dict(cursor.fetchone()))

                conn.commit()
                return SQLiteSupabaseResult(updated_rows)

            elif self.op == "delete":
                where_clauses = []
                params = []
                if self.filters:
                    for col, op, val in self.filters:
                        where_clauses.append(f"{col} {op} ?")
                        params.append(val)
                where_sql = (
                    " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                )

                cursor.execute(f"SELECT * FROM {self.table_name}{where_sql}", params)
                deleted_rows = [dict(r) for r in cursor.fetchall()]

                sql = f"DELETE FROM {self.table_name}{where_sql}"
                cursor.execute(sql, params)

                conn.commit()
                return SQLiteSupabaseResult(deleted_rows)

            elif self.op == "upsert":
                payloads = (
                    self.payload if isinstance(self.payload, list) else [self.payload]
                )
                upserted_rows = []
                for p in payloads:
                    p = dict(p)
                    row_id = p.get("id")
                    existing_id = None
                    if row_id:
                        cursor.execute(
                            f"SELECT id FROM {self.table_name} WHERE id = ?", (row_id,)
                        )
                        res = cursor.fetchone()
                        if res:
                            existing_id = res["id"]

                    if not existing_id:
                        if self.table_name == "users" and "email" in p:
                            cursor.execute(
                                "SELECT id FROM users WHERE email = ?", (p["email"],)
                            )
                            res = cursor.fetchone()
                            if res:
                                existing_id = res["id"]
                        elif (
                            self.table_name == "do_not_contact"
                            and "email" in p
                            and "user_id" in p
                        ):
                            cursor.execute(
                                "SELECT id FROM do_not_contact WHERE user_id = ? AND email = ?",
                                (p["user_id"], p["email"]),
                            )
                            res = cursor.fetchone()
                            if res:
                                existing_id = res["id"]
                        elif (
                            self.table_name == "leads"
                            and "website" in p
                            and "contact_email" in p
                            and "user_id" in p
                        ):
                            cursor.execute(
                                "SELECT id FROM leads WHERE user_id = ? AND website = ? AND contact_email = ?",
                                (p["user_id"], p["website"], p["contact_email"]),
                            )
                            res = cursor.fetchone()
                            if res:
                                existing_id = res["id"]

                    if existing_id:
                        p["id"] = existing_id
                        cols = [f"{k} = ?" for k in p.keys() if k != "id"]
                        vals = [p[k] for k in p.keys() if k != "id"]
                        sql = f"UPDATE {self.table_name} SET {', '.join(cols)} WHERE id = ?"
                        cursor.execute(sql, vals + [existing_id])
                    else:
                        if "id" not in p or not p["id"]:
                            p["id"] = str(uuid.uuid4())
                        cols = list(p.keys())
                        placeholders = ["?" for _ in cols]
                        sql = f"INSERT INTO {self.table_name} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})"
                        cursor.execute(sql, [p[k] for k in cols])

                    cursor.execute(
                        f"SELECT * FROM {self.table_name} WHERE id = ?", (p["id"],)
                    )
                    upserted_rows.append(dict(cursor.fetchone()))

                conn.commit()
                return SQLiteSupabaseResult(upserted_rows)

        except Exception as e:
            logger.error(f"SQLite error executing {self.op} on {self.table_name}: {e}")
            raise e
        finally:
            conn.close()


class SQLiteSupabaseClient:
    def __init__(self, db_path: str):
        self.db_path = db_path
        self._init_db()

    def _add_column_if_missing(
        self, cursor, table: str, column: str, col_type: str, default_val: str = None
    ):
        cursor.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in cursor.fetchall()]
        if column not in columns:
            stmt = f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"
            if default_val is not None:
                stmt += f" DEFAULT {default_val}"
            cursor.execute(stmt)

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # users
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            full_name TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # campaigns
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaigns (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            campaign_type TEXT DEFAULT 'mixed',
            status TEXT DEFAULT 'active',
            daily_send_limit INTEGER DEFAULT 50,
            delay_seconds INTEGER DEFAULT 5,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # leads
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company_name TEXT,
            website TEXT NOT NULL,
            industry TEXT,
            country TEXT,
            city TEXT,
            contact_email TEXT,
            phone TEXT,
            website_pain_points TEXT,
            erp_approach TEXT,
            lead_status TEXT DEFAULT 'Pending',
            source_sheet_name TEXT,
            source_row_number TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # email_drafts
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS email_drafts (
            id TEXT PRIMARY KEY,
            lead_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            email_type TEXT NOT NULL,
            subject TEXT,
            body TEXT,
            status TEXT DEFAULT 'draft',
            ai_model TEXT,
            prompt_version TEXT,
            quality_score REAL,
            spam_risk_score REAL,
            personalization_score REAL,
            clarity_score REAL,
            generated_at TEXT,
            approved_at TEXT,
            sent_at TEXT,
            warnings TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # send_logs
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS send_logs (
            id TEXT PRIMARY KEY,
            draft_id TEXT,
            lead_id TEXT,
            user_id TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            subject TEXT,
            email_type TEXT,
            status TEXT NOT NULL,
            error_message TEXT,
            gmail_message_id TEXT,
            sent_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # prompt_templates
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS prompt_templates (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            email_type TEXT NOT NULL,
            template_text TEXT NOT NULL,
            version TEXT DEFAULT '1.0.0',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # error_logs
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS error_logs (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            source TEXT,
            message TEXT NOT NULL,
            details TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # do_not_contact
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS do_not_contact (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            email TEXT NOT NULL,
            reason TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, email)
        )""")

        # --- V2 NEW TABLES ---
        # import_mappings
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS import_mappings (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            source_headers TEXT DEFAULT '[]',
            field_mapping TEXT DEFAULT '{}',
            required_fields TEXT DEFAULT '[]',
            transform_rules TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # import_sources
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS import_sources (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            source_type TEXT NOT NULL,
            name TEXT NOT NULL,
            metadata TEXT DEFAULT '{}',
            imported_at TEXT DEFAULT CURRENT_TIMESTAMP,
            total_rows INTEGER DEFAULT 0,
            successful_rows INTEGER DEFAULT 0,
            failed_rows INTEGER DEFAULT 0,
            mapping_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # owner_settings
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS owner_settings (
            id TEXT PRIMARY KEY,
            owner_id TEXT UNIQUE NOT NULL,
            business_name TEXT,
            website TEXT,
            sender_name TEXT,
            sender_email TEXT,
            sender_phone TEXT,
            default_signature TEXT,
            brand_voice TEXT,
            default_tone TEXT,
            default_cta TEXT,
            default_language TEXT DEFAULT 'en',
            timezone TEXT DEFAULT 'UTC',
            daily_send_limit INTEGER DEFAULT 50,
            minimum_send_spacing_seconds INTEGER DEFAULT 60,
            allowed_send_start TEXT DEFAULT '09:00',
            allowed_send_end TEXT DEFAULT '17:00',
            required_footer TEXT,
            banned_phrases TEXT DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # sequences
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sequences (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # prompt_versions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id TEXT PRIMARY KEY,
            template_id TEXT NOT NULL,
            version TEXT DEFAULT '1.0.0',
            template_text TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # sequence_steps
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS sequence_steps (
            id TEXT PRIMARY KEY,
            sequence_id TEXT NOT NULL,
            step_number INTEGER NOT NULL,
            delay_hours INTEGER DEFAULT 24,
            prompt_version_id TEXT,
            subject_instruction TEXT,
            body_instruction TEXT,
            stop_conditions TEXT DEFAULT '{}',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(sequence_id, step_number)
        )""")

        # campaign_leads
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS campaign_leads (
            id TEXT PRIMARY KEY,
            campaign_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            variant_id TEXT,
            status TEXT DEFAULT 'enrolled',
            current_sequence_step INTEGER DEFAULT 1,
            stopped_reason TEXT,
            enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            completed_at TEXT,
            UNIQUE(campaign_id, lead_id)
        )""")

        # generation_jobs
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS generation_jobs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            total_items INTEGER DEFAULT 0,
            processed_items INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # generation_job_items
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS generation_job_items (
            id TEXT PRIMARY KEY,
            job_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            draft_id TEXT,
            error_message TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # scheduled_emails
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS scheduled_emails (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            draft_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            scheduled_at TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            sequence_step_id TEXT,
            attempts INTEGER DEFAULT 0,
            idempotency_key TEXT UNIQUE,
            gmail_message_id TEXT,
            gmail_thread_id TEXT,
            last_error TEXT,
            scheduled_for TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # send_events
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS send_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            scheduled_email_id TEXT,
            event_type TEXT NOT NULL,
            recipient_email TEXT NOT NULL,
            gmail_message_id TEXT,
            error_message TEXT,
            occurred_at TEXT DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # reply_events
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS reply_events (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            gmail_message_id TEXT UNIQUE NOT NULL,
            in_reply_to_id TEXT,
            subject TEXT,
            body TEXT,
            sentiment TEXT DEFAULT 'neutral',
            category TEXT,
            confidence REAL,
            rule_model_used TEXT,
            explanation TEXT,
            manual_override INTEGER DEFAULT 0,
            replied_at TEXT DEFAULT CURRENT_TIMESTAMP,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # research_snapshots
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS research_snapshots (
            id TEXT PRIMARY KEY,
            lead_id TEXT NOT NULL,
            research_type TEXT NOT NULL,
            raw_data TEXT DEFAULT '{}',
            structured_summary TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # experiments
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS experiments (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'draft',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # experiment_variants
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS experiment_variants (
            id TEXT PRIMARY KEY,
            experiment_id TEXT NOT NULL,
            campaign_id TEXT NOT NULL,
            name TEXT NOT NULL,
            description TEXT,
            weight REAL DEFAULT 0.5,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # experiment_assignments
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS experiment_assignments (
            id TEXT PRIMARY KEY,
            experiment_id TEXT NOT NULL,
            lead_id TEXT NOT NULL,
            variant_id TEXT NOT NULL,
            variant_name TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(experiment_id, lead_id)
        )""")

        # integration_connections
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS integration_connections (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            connection_status TEXT DEFAULT 'disconnected',
            encrypted_credentials TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, provider)
        )""")

        # --- V2 ALTERS ON EXISTING TABLES ---
        # Alter Campaigns Table
        self._add_column_if_missing(cursor, "campaigns", "objective", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "offer", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "target_audience", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "value_proposition", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "tone", "TEXT")
        self._add_column_if_missing(
            cursor, "campaigns", "email_length", "TEXT", "'medium'"
        )
        self._add_column_if_missing(cursor, "campaigns", "CTA", "TEXT")
        self._add_column_if_missing(
            cursor, "campaigns", "required_content", "TEXT", "'[]'"
        )
        self._add_column_if_missing(
            cursor, "campaigns", "banned_content", "TEXT", "'[]'"
        )
        self._add_column_if_missing(cursor, "campaigns", "prompt_template_id", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "sequence_id", "TEXT")
        self._add_column_if_missing(
            cursor, "campaigns", "sender_profile_snapshot", "TEXT", "'{}'"
        )
        self._add_column_if_missing(cursor, "campaigns", "timezone", "TEXT", "'UTC'")
        self._add_column_if_missing(
            cursor, "campaigns", "send_spacing_seconds", "INTEGER", "60"
        )
        self._add_column_if_missing(
            cursor, "campaigns", "sending_window_start", "TEXT", "'09:00'"
        )
        self._add_column_if_missing(
            cursor, "campaigns", "sending_window_end", "TEXT", "'17:00'"
        )
        self._add_column_if_missing(
            cursor, "campaigns", "approval_mode", "TEXT", "'manual'"
        )
        self._add_column_if_missing(cursor, "campaigns", "cloned_from_id", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "preset", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "description", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "proof_points", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "required_facts", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "prohibited_claims", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "target_industry", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "target_roles", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "countries", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "tags", "TEXT", "'[]'")
        self._add_column_if_missing(cursor, "campaigns", "min_lead_fit_score", "INTEGER", "0")
        self._add_column_if_missing(cursor, "campaigns", "selected_leads", "TEXT", "'[]'")
        self._add_column_if_missing(cursor, "campaigns", "language", "TEXT", "'en'")
        self._add_column_if_missing(cursor, "campaigns", "start_date", "TEXT")
        self._add_column_if_missing(cursor, "campaigns", "prompt_config_snapshot", "TEXT", "'{}'")
        self._add_column_if_missing(cursor, "campaigns", "min_quality_score", "REAL", "0.7")
        self._add_column_if_missing(cursor, "campaigns", "min_spam_risk", "REAL", "0.4")
        self._add_column_if_missing(cursor, "campaigns", "min_personalization", "REAL", "0.6")
        self._add_column_if_missing(cursor, "campaigns", "min_clarity", "REAL", "0.7")

        # Alter Leads Table
        self._add_column_if_missing(cursor, "leads", "first_name", "TEXT")
        self._add_column_if_missing(cursor, "leads", "last_name", "TEXT")
        self._add_column_if_missing(cursor, "leads", "full_name", "TEXT")
        self._add_column_if_missing(cursor, "leads", "job_title", "TEXT")
        self._add_column_if_missing(cursor, "leads", "tags", "TEXT", "'[]'")
        self._add_column_if_missing(cursor, "leads", "custom_fields", "TEXT", "'{}'")
        self._add_column_if_missing(cursor, "leads", "research_summary", "TEXT")
        self._add_column_if_missing(cursor, "leads", "personalization_context", "TEXT")
        self._add_column_if_missing(cursor, "leads", "fit_score", "INTEGER")
        self._add_column_if_missing(
            cursor, "leads", "fit_score_reasons", "TEXT", "'[]'"
        )
        self._add_column_if_missing(
            cursor, "leads", "research_status", "TEXT", "'unchecked'"
        )
        self._add_column_if_missing(cursor, "leads", "source_id", "TEXT")

        # Alter Prompt Versions Table
        self._add_column_if_missing(cursor, "prompt_versions", "status", "TEXT", "'published'")
        self._add_column_if_missing(cursor, "prompt_versions", "description", "TEXT")
        self._add_column_if_missing(cursor, "prompt_versions", "changelog", "TEXT")
        self._add_column_if_missing(cursor, "prompt_versions", "updated_at", "TEXT")

        # Alter Owner Settings Table
        self._add_column_if_missing(cursor, "owner_settings", "offer_description", "TEXT")
        self._add_column_if_missing(cursor, "owner_settings", "default_target_audience", "TEXT")

        # Alter Generation Jobs Table
        self._add_column_if_missing(cursor, "generation_jobs", "total", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "queued", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "processing", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "completed", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "failed", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "cancelled", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_jobs", "model_configuration_snapshot", "TEXT", "'{}'")
        self._add_column_if_missing(cursor, "generation_jobs", "prompt_version", "TEXT")

        # Alter Generation Job Items Table
        self._add_column_if_missing(cursor, "generation_job_items", "sequence_step_id", "TEXT")
        self._add_column_if_missing(cursor, "generation_job_items", "attempts", "INTEGER", "0")
        self._add_column_if_missing(cursor, "generation_job_items", "error_type", "TEXT")
        self._add_column_if_missing(cursor, "generation_job_items", "resulting_draft_id", "TEXT")
        self._add_column_if_missing(cursor, "generation_job_items", "idempotency_key", "TEXT")

        # Alter Email Drafts Table
        self._add_column_if_missing(cursor, "email_drafts", "campaign_id", "TEXT")
        self._add_column_if_missing(cursor, "email_drafts", "generation_job_id", "TEXT")

        # Alter Sequence Steps Table
        self._add_column_if_missing(cursor, "sequence_steps", "name", "TEXT")
        self._add_column_if_missing(cursor, "sequence_steps", "delay_amount", "INTEGER", "24")
        self._add_column_if_missing(cursor, "sequence_steps", "delay_unit", "TEXT", "'hours'")
        self._add_column_if_missing(cursor, "sequence_steps", "subject_template_version_id", "TEXT")
        self._add_column_if_missing(cursor, "sequence_steps", "body_template_version_id", "TEXT")
        self._add_column_if_missing(cursor, "sequence_steps", "custom_instructions", "TEXT")
        self._add_column_if_missing(cursor, "sequence_steps", "require_manual_approval", "INTEGER", "1")

        # Alter Campaign Leads Table
        self._add_column_if_missing(cursor, "campaign_leads", "next_step_scheduled_at", "TEXT")
        self._add_column_if_missing(cursor, "campaign_leads", "last_sent_at", "TEXT")
        self._add_column_if_missing(cursor, "campaign_leads", "last_error", "TEXT")
        self._add_column_if_missing(cursor, "campaign_leads", "exclude_weekends", "INTEGER", "1")

        # Alter Scheduled Emails Table
        self._add_column_if_missing(cursor, "scheduled_emails", "sequence_step_id", "TEXT")
        self._add_column_if_missing(cursor, "scheduled_emails", "attempts", "INTEGER", "0")
        self._add_column_if_missing(cursor, "scheduled_emails", "idempotency_key", "TEXT")
        self._add_column_if_missing(cursor, "scheduled_emails", "gmail_message_id", "TEXT")
        self._add_column_if_missing(cursor, "scheduled_emails", "gmail_thread_id", "TEXT")
        self._add_column_if_missing(cursor, "scheduled_emails", "last_error", "TEXT")
        self._add_column_if_missing(cursor, "scheduled_emails", "scheduled_for", "TEXT")

        # Alter Reply Events Table
        self._add_column_if_missing(cursor, "reply_events", "category", "TEXT")
        self._add_column_if_missing(cursor, "reply_events", "confidence", "REAL")
        self._add_column_if_missing(cursor, "reply_events", "rule_model_used", "TEXT")
        self._add_column_if_missing(cursor, "reply_events", "explanation", "TEXT")
        self._add_column_if_missing(cursor, "reply_events", "manual_override", "INTEGER", "0")

        # Alter Integration Connections Table
        self._add_column_if_missing(cursor, "integration_connections", "last_history_id", "TEXT")

        # Alter Campaigns Table
        self._add_column_if_missing(cursor, "campaigns", "ooo_behavior", "TEXT", "'ignore'")
        self._add_column_if_missing(cursor, "campaigns", "parent_campaign_id", "TEXT")

        # Alter Experiment Variants Table
        self._add_column_if_missing(cursor, "experiment_variants", "prompt_template_version_id", "TEXT")

        # Alter Email Drafts Table
        self._add_column_if_missing(cursor, "email_drafts", "variant_id", "TEXT")
        self._add_column_if_missing(cursor, "email_drafts", "variant_name", "TEXT")

        # Alter Send Events Table
        self._add_column_if_missing(cursor, "send_events", "variant_id", "TEXT")
        self._add_column_if_missing(cursor, "send_events", "variant_name", "TEXT")
        self._add_column_if_missing(cursor, "send_events", "prompt_version_id", "TEXT")

        # --- V2 DATA MIGRATIONS ---
        # 1. Migrate leads website_pain_points & erp_approach to custom_fields
        cursor.execute(
            "SELECT id, website_pain_points, erp_approach, custom_fields FROM leads"
        )
        leads_rows = cursor.fetchall()
        import json

        for row in leads_rows:
            lead_id, pain_points, erp_approach, cf = row
            try:
                cf_dict = json.loads(cf) if cf else {}
            except Exception:
                cf_dict = {}
            if not cf_dict or (
                cf_dict.get("pain_points") is None
                and cf_dict.get("erp_approach") is None
            ):
                cf_dict["pain_points"] = pain_points
                cf_dict["erp_approach"] = erp_approach
                cursor.execute(
                    "UPDATE leads SET custom_fields = ? WHERE id = ?",
                    (json.dumps(cf_dict), lead_id),
                )

        # Migrate old mixed/website/erp campaigns to generic campaigns
        cursor.execute("SELECT id, campaign_type, name, objective FROM campaigns")
        old_campaigns = cursor.fetchall()
        for row in old_campaigns:
            c_id, c_type, name, obj = row
            if c_type in ["mixed", "website", "erp"]:
                new_objective = obj
                if not new_objective:
                    if c_type == "erp":
                        new_objective = "Introduce an ERP consulting service and propose schedule systems"
                    elif c_type == "website":
                        new_objective = "Propose website development and design improvements"
                    else:
                        new_objective = "Introduce general operational agency services"
                
                cursor.execute(
                    "UPDATE campaigns SET campaign_type = 'generic', objective = ? WHERE id = ?",
                    (new_objective, c_id)
                )

        # 2. Backfill prompt versions
        cursor.execute(
            "SELECT id, template_text, version, is_active, created_at FROM prompt_templates"
        )
        templates_rows = cursor.fetchall()
        for row in templates_rows:
            tmpl_id, text, version, is_active, created_at = row
            cursor.execute(
                "SELECT id FROM prompt_versions WHERE template_id = ? AND version = ?",
                (tmpl_id, version or "1.0.0"),
            )
            if not cursor.fetchone():
                cursor.execute(
                    "INSERT INTO prompt_versions (id, template_id, version, template_text, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        str(uuid.uuid4()),
                        tmpl_id,
                        version or "1.0.0",
                        text,
                        is_active,
                        created_at,
                    ),
                )

        conn.commit()
        conn.close()

    def table(self, table_name: str) -> SQLiteQueryBuilder:
        return SQLiteQueryBuilder(self.db_path, table_name)


def init_db() -> Any:
    url = settings.SUPABASE_URL
    key = settings.SUPABASE_SERVICE_ROLE_KEY or settings.SUPABASE_ANON_KEY

    # Try initializing Supabase client first
    if url and key:
        try:
            client = create_client(url, key)
            # Test query to check if 'leads' table exists
            client.table("leads").select("id").limit(1).execute()
            logger.info("✅ Supabase client initialized and verified successfully")
            return client
        except Exception as e:
            logger.warning(
                f"⚠️ Supabase verification failed: {e}. "
                f"Falling back to local SQLite database."
            )

    # Fallback to local SQLite database
    db_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)), "local_outreachops.db"
    )
    logger.info(f"📂 Initializing local SQLite database at: {db_path}")
    return SQLiteSupabaseClient(db_path)


# Initialize database instance dynamically
supabase = init_db()
