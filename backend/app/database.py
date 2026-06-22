import os
import sqlite3
import uuid
import logging
from typing import List, Dict, Any, Optional
from supabase import create_client, Client
from app.config import settings

logger = logging.getLogger("outreachops.database")

class SQLiteSupabaseResult:
    def __init__(self, data: List[Dict[str, Any]], count: Optional[int] = None):
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
                        count_sql += " WHERE " + " AND ".join([f"{col} {op} ?" for col, op, _ in self.filters])
                    cursor.execute(count_sql, params[:len(self.filters)])
                    count_val = cursor.fetchone()[0]
                
                return SQLiteSupabaseResult(data, count_val)

            elif self.op == "insert":
                payloads = self.payload if isinstance(self.payload, list) else [self.payload]
                inserted_rows = []
                
                for p in payloads:
                    p = dict(p)
                    if "id" not in p or not p["id"]:
                        p["id"] = str(uuid.uuid4())
                    
                    columns = list(p.keys())
                    placeholders = [f"?" for _ in columns]
                    sql = f"INSERT INTO {self.table_name} ({', '.join(columns)}) VALUES ({', '.join(placeholders)})"
                    cursor.execute(sql, [p[col] for col in columns])
                    
                    cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (p["id"],))
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
                where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                
                cursor.execute(f"SELECT id FROM {self.table_name}{where_sql}", params)
                matching_ids = [r["id"] for r in cursor.fetchall()]
                
                update_cols = []
                update_params = []
                for k, v in self.payload.items():
                    update_cols.append(f"{k} = ?")
                    update_params.append(v)
                
                sql = f"UPDATE {self.table_name} SET {', '.join(update_cols)}{where_sql}"
                cursor.execute(sql, update_params + params)
                
                updated_rows = []
                for row_id in matching_ids:
                    cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (row_id,))
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
                where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
                
                cursor.execute(f"SELECT * FROM {self.table_name}{where_sql}", params)
                deleted_rows = [dict(r) for r in cursor.fetchall()]
                
                sql = f"DELETE FROM {self.table_name}{where_sql}"
                cursor.execute(sql, params)
                
                conn.commit()
                return SQLiteSupabaseResult(deleted_rows)

            elif self.op == "upsert":
                payloads = self.payload if isinstance(self.payload, list) else [self.payload]
                upserted_rows = []
                for p in payloads:
                    p = dict(p)
                    row_id = p.get("id")
                    existing_id = None
                    if row_id:
                        cursor.execute(f"SELECT id FROM {self.table_name} WHERE id = ?", (row_id,))
                        res = cursor.fetchone()
                        if res:
                            existing_id = res["id"]
                    
                    if not existing_id:
                        if self.table_name == "users" and "email" in p:
                            cursor.execute("SELECT id FROM users WHERE email = ?", (p["email"],))
                            res = cursor.fetchone()
                            if res:
                                existing_id = res["id"]
                        elif self.table_name == "do_not_contact" and "email" in p and "user_id" in p:
                            cursor.execute("SELECT id FROM do_not_contact WHERE user_id = ? AND email = ?", (p["user_id"], p["email"]))
                            res = cursor.fetchone()
                            if res:
                                existing_id = res["id"]
                        elif self.table_name == "leads" and "website" in p and "contact_email" in p and "user_id" in p:
                            cursor.execute("SELECT id FROM leads WHERE user_id = ? AND website = ? AND contact_email = ?", (p["user_id"], p["website"], p["contact_email"]))
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
                        placeholders = [f"?" for _ in cols]
                        sql = f"INSERT INTO {self.table_name} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})"
                        cursor.execute(sql, [p[k] for k in cols])
                    
                    cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (p["id"],))
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
    db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "local_outreachops.db")
    logger.info(f"📂 Initializing local SQLite database at: {db_path}")
    return SQLiteSupabaseClient(db_path)

# Initialize database instance dynamically
supabase = init_db()
