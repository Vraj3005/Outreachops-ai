import json
import os
import sqlite3
import tempfile

from app.database import SQLiteSupabaseClient


def test_sqlite_v2_migration():
    """
    Creates a temporary v1 SQLite schema, seeds it with v1 leads and templates,
    applies the SQLiteSupabaseClient v2 migration logic, and asserts
    that columns, new tables, and data backfills are correct.
    """
    # Create temp DB file
    temp_dir = tempfile.mkdtemp()
    db_path = os.path.join(temp_dir, "test_outreachops_v2.db")

    try:
        # 1. Establish v1 Schema manually
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # create v1 leads table
        cursor.execute("""
        CREATE TABLE leads (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            company_name TEXT,
            website TEXT NOT NULL,
            website_pain_points TEXT,
            erp_approach TEXT,
            lead_status TEXT DEFAULT 'Pending'
        )""")

        # create v1 prompt_templates table
        cursor.execute("""
        CREATE TABLE prompt_templates (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            email_type TEXT NOT NULL,
            template_text TEXT NOT NULL,
            version TEXT DEFAULT '1.0.0',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""")

        # Seed v1 data
        cursor.execute("""
        INSERT INTO leads (id, user_id, company_name, website, website_pain_points, erp_approach)
        VALUES ('lead-v1-id', 'user-v1-id', 'Old Corp', 'oldcorp.com', 'slow forms', 'centralized ERP')
        """)

        cursor.execute("""
        INSERT INTO prompt_templates (id, user_id, name, email_type, template_text, version)
        VALUES ('template-v1-id', 'user-v1-id', 'V1 Template', 'website', 'Pitch to {website}', '1.2.3')
        """)

        conn.commit()
        conn.close()

        # 2. Initialize V2 upgrades through client instantiation
        client = SQLiteSupabaseClient(db_path)

        # 3. Assert upgrades
        conn2 = sqlite3.connect(db_path)
        cursor2 = conn2.cursor()

        # Verify leads columns added and data migrated
        cursor2.execute("PRAGMA table_info(leads)")
        columns = [row[1] for row in cursor2.fetchall()]
        assert "first_name" in columns
        assert "custom_fields" in columns
        assert "fit_score" in columns

        cursor2.execute(
            "SELECT website_pain_points, erp_approach, custom_fields FROM leads WHERE id = 'lead-v1-id'"
        )
        pain, erp, cf = cursor2.fetchone()
        assert pain == "slow forms"
        assert erp == "centralized ERP"

        cf_data = json.loads(cf)
        assert cf_data["pain_points"] == "slow forms"
        assert cf_data["erp_approach"] == "centralized ERP"

        # Verify prompt versions backfilled
        cursor2.execute(
            "SELECT template_id, version, template_text, is_active FROM prompt_versions"
        )
        versions = cursor2.fetchall()
        assert len(versions) == 1
        assert versions[0][0] == "template-v1-id"
        assert versions[0][1] == "1.2.3"
        assert versions[0][2] == "Pitch to {website}"
        assert versions[0][3] == 1

        # Verify campaigns columns
        cursor2.execute("PRAGMA table_info(campaigns)")
        campaigns_columns = [row[1] for row in cursor2.fetchall()]
        assert "objective" in campaigns_columns
        assert "email_length" in campaigns_columns
        assert "send_spacing_seconds" in campaigns_columns

        # Verify new tables exist (e.g. owner_settings, reply_events, Integration connections)
        cursor2.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor2.fetchall()]
        assert "owner_settings" in tables
        assert "reply_events" in tables
        assert "integration_connections" in tables
        assert "import_sources" in tables

        conn2.close()

    finally:
        # Clean up temp file
        if os.path.exists(db_path):
            os.remove(db_path)
        if os.path.exists(temp_dir):
            os.rmdir(temp_dir)
