import re
import socket
import logging
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

# Optional dns.resolver import for MX record lookup
try:
    import dns.resolver
    HAS_DNS = True
except ImportError:
    HAS_DNS = False

from app.database import supabase

logger = logging.getLogger("outreachops.services.lead_quality")

# Common disposable domains list
DISPOSABLE_DOMAINS = {
    "mailinator.com", "10minutemail.com", "tempmail.com", "yopmail.com", 
    "guerrillamail.com", "sharklasers.com", "dispostable.com", "getairmail.com",
    "burnermail.io", "trashmail.com", "tempmailaddress.com"
}

# Common role account local parts
ROLE_LOCAL_PARTS = {
    "info", "support", "admin", "sales", "contact", "jobs", "billing", 
    "help", "office", "marketing", "hello", "team", "feedback"
}

class LeadQualityService:
    @staticmethod
    def normalize_lead_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """Normalizes email casing, websites, phone formats, names, and tags."""
        normalized = data.copy()

        # Clean general empty values (convert empty strings/whitespace or "null"/"none"/"undefined" strings to None)
        for k, v in list(normalized.items()):
            if isinstance(v, str):
                v_stripped = v.strip()
                if v_stripped.lower() in ["", "null", "none", "undefined"]:
                    if k == "website":
                        normalized[k] = ""
                    else:
                        normalized[k] = None

        # 1. Email Normalization
        if "contact_email" in normalized and normalized["contact_email"]:
            email = str(normalized["contact_email"]).strip().lower()
            normalized["contact_email"] = email if email not in ["", "null", "none"] else None
        else:
            normalized["contact_email"] = None

        # 2. Website & URL Normalization
        if "website" in normalized and normalized["website"]:
            web = str(normalized["website"]).strip()
            if web.lower() in ["", "null", "none"]:
                normalized["website"] = ""
            else:
                # Add schema if missing
                if not re.match(r"^https?://", web, re.IGNORECASE):
                    web = "https://" + web
                
                # Standardize parsing
                try:
                    parsed = urlparse(web)
                    domain = parsed.netloc.lower()
                    if domain.startswith("www."):
                        domain = domain[4:]
                    normalized["website"] = f"https://{domain}"
                    normalized["company_domain"] = domain
                except Exception:
                    normalized["website"] = web
                    normalized["company_domain"] = None
        else:
            normalized["website"] = ""
            normalized["company_domain"] = None

        # Derive company domain from email if website is empty
        if not normalized.get("company_domain") and normalized.get("contact_email"):
            email_parts = normalized["contact_email"].split("@")
            if len(email_parts) == 2:
                normalized["company_domain"] = email_parts[1]

        # 3. Phone Formatting (digits and leading + only)
        if "phone" in normalized and normalized["phone"]:
            phone = str(normalized["phone"]).strip()
            if phone.lower() in ["", "null", "none"]:
                normalized["phone"] = None
            else:
                digits_only = "".join(c for c in phone if c.isdigit() or c == "+")
                normalized["phone"] = digits_only if digits_only else None
        else:
            normalized["phone"] = None

        # 4. Country & City title casing
        for field in ["country", "city"]:
            if field in normalized and normalized[field]:
                val = str(normalized[field]).strip()
                if val.lower() in ["", "null", "none"]:
                    normalized[field] = None
                else:
                    normalized[field] = " ".join(w.capitalize() for w in val.split())
            else:
                normalized[field] = None

        # 5. Name formatting
        for field in ["first_name", "last_name", "full_name", "company_name", "job_title"]:
            if field in normalized and normalized[field]:
                val = str(normalized[field]).strip()
                if val.lower() in ["", "null", "none"]:
                    normalized[field] = None
                else:
                    # Clean double spacing
                    cleaned = " ".join(val.split())
                    normalized[field] = cleaned
                    
                    # Backfill full_name/company_name logic
                    if field == "full_name" and cleaned and not normalized.get("first_name"):
                        parts = cleaned.split(" ", 1)
                        normalized["first_name"] = parts[0]
                        if len(parts) > 1:
                            normalized["last_name"] = parts[1]

        # Sync full_name if first & last exists
        if not normalized.get("full_name") and normalized.get("first_name"):
            normalized["full_name"] = f"{normalized['first_name']} {normalized.get('last_name') or ''}".strip()

        # 6. Tags normalizations
        if "tags" in normalized:
            raw_tags = normalized["tags"]
            if isinstance(raw_tags, str):
                parsed_tags = [t.strip().lower() for t in raw_tags.split(",") if t.strip()]
            elif isinstance(raw_tags, list):
                parsed_tags = [str(t).strip().lower() for t in raw_tags if str(t).strip()]
            else:
                parsed_tags = []
            normalized["tags"] = sorted(list(set(parsed_tags)))
        else:
            normalized["tags"] = []

        # 7. Custom fields structure safety
        if "custom_fields" in normalized:
            cf = normalized["custom_fields"]
            if not isinstance(cf, dict):
                normalized["custom_fields"] = {}
            else:
                # Sanitize custom fields keys (alphanumeric + underscore)
                cleaned_cf = {}
                for k, v in cf.items():
                    k_clean = re.sub(r"[^a-zA-Z0-9_]", "", k.replace(" ", "_").replace("-", "_")).lower()
                    if k_clean:
                        if isinstance(v, str):
                            v_clean = re.sub(r"<[^>]*>", "", v).strip()
                            cleaned_cf[k_clean] = v_clean if v_clean.lower() not in ["", "null", "none", "undefined"] else None
                        else:
                            cleaned_cf[k_clean] = v
                normalized["custom_fields"] = cleaned_cf
        else:
            normalized["custom_fields"] = {}

        return normalized

    @staticmethod
    def verify_email(email: str) -> Dict[str, Any]:
        """Runs email syntax verification, role local-part, disposable lists, and DNS MX checks."""
        email = email.strip().lower()
        
        # 1. Regex check
        pattern = r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$"
        if not re.match(pattern, email):
            return {
                "status": "invalid",
                "reasons": ["Invalid email syntax format."]
            }

        local_part, domain = email.split("@", 1)
        reasons = []

        # 2. Disposable check
        is_disposable = domain in DISPOSABLE_DOMAINS
        if is_disposable:
            reasons.append("Registered disposable email host domain.")

        # 3. Role account check
        is_role = local_part in ROLE_LOCAL_PARTS
        if is_role:
            reasons.append(f"Generic role address local-part ('{local_part}').")

        # 4. Live DNS MX verification check
        mx_verified = False
        if HAS_DNS:
            try:
                # Fetch MX mail exchanger records
                answers = dns.resolver.resolve(domain, "MX")
                if answers:
                    mx_verified = True
            except Exception:
                # Retry fetching A record fallback
                try:
                    socket.gethostbyname(domain)
                    mx_verified = True
                except Exception:
                    pass
        else:
            try:
                socket.gethostbyname(domain)
                mx_verified = True
            except Exception:
                pass

        if not mx_verified:
            return {
                "status": "invalid",
                "reasons": ["Domain has no active MX mail server or A host DNS records."]
            }

        # Select primary classification status
        if is_disposable:
            status = "disposable"
        elif is_role:
            status = "role_address"
        else:
            status = "valid"

        return {
            "status": status,
            "reasons": reasons if reasons else ["Email syntax and domain routing records are active."]
        }

    @staticmethod
    def calculate_fit_score(lead: Dict[str, Any], criteria: Dict[str, Any]) -> Tuple[int, List[str]]:
        """
        Calculates explainable campaign parameter profile score alignment (0-100).
        """
        score = 0
        reasons = []

        # Target fields extraction
        target_industries = [i.lower() for i in criteria.get("target_industries", [])]
        target_locations = [l.lower() for l in criteria.get("target_locations", [])]
        target_roles = [r.lower() for r in criteria.get("target_roles", [])]

        # 1. Industry Alignment (up to 20 pts)
        lead_ind = str(lead.get("industry") or "").strip().lower()
        if target_industries and lead_ind:
            if lead_ind in target_industries:
                score += 20
                reasons.append("Industry matches target campaign criteria (+20 pts).")
            else:
                reasons.append(f"Industry '{lead.get('industry')}' does not match campaign vertical targets.")
        elif not target_industries:
            score += 20
            reasons.append("No campaign industry parameters specified, vertical matches by default (+20 pts).")
        else:
            reasons.append("Missing lead industry information (0/20 pts).")

        # 2. Location Alignment (up to 20 pts)
        lead_country = str(lead.get("country") or "").strip().lower()
        lead_city = str(lead.get("city") or "").strip().lower()
        if target_locations:
            matched_loc = False
            for loc in target_locations:
                if loc == lead_country or loc == lead_city:
                    score += 20
                    reasons.append(f"Location match found for '{loc.capitalize()}' (+20 pts).")
                    matched_loc = True
                    break
            if not matched_loc:
                reasons.append("Lead location does not match campaign regional limits (0/20 pts).")
        else:
            score += 20
            reasons.append("Global campaign scope: location parameters match by default (+20 pts).")

        # 3. Job Title Role Alignment (up to 20 pts)
        lead_title = str(lead.get("job_title") or "").strip().lower()
        if target_roles and lead_title:
            matched_role = False
            for role in target_roles:
                if role in lead_title:
                    score += 20
                    reasons.append(f"Job title '{lead.get('job_title')}' matches role criteria (+20 pts).")
                    matched_role = True
                    break
            if not matched_role:
                reasons.append(f"Job title '{lead.get('job_title')}' is not a target role keyword.")
        elif not target_roles:
            score += 20
            reasons.append("No campaign audience role criteria set (+20 pts).")
        else:
            reasons.append("Missing lead job title information (0/20 pts).")

        # 4. Ingest completeness check (up to 15 pts)
        filled_fields = 0
        total_checks = ["contact_email", "phone", "website", "company_name"]
        for f in total_checks:
            if lead.get(f):
                filled_fields += 1
        
        comp_points = int((filled_fields / len(total_checks)) * 15)
        score += comp_points
        reasons.append(f"Profile completeness: {filled_fields}/{len(total_checks)} core contact fields populated (+{comp_points} pts).")

        # 5. Quality & Personalization checks (up to 15 pts)
        q_points = 0
        if lead.get("research_summary") or lead.get("personalization_context"):
            q_points += 10
            reasons.append("Research summary / personalized context exists (+10 pts).")
        if lead.get("custom_fields"):
            q_points += 5
            reasons.append("Custom attribute metadata fields are present (+5 pts).")
        score += q_points

        # 6. Custom campaign bonus alignment checks (up to 10 pts)
        if criteria.get("custom_rules_passed"):
            score += 10
            reasons.append("Campaign custom enrichment rules criteria met (+10 pts).")
        else:
            score += 5
            reasons.append("Campaign baseline rules validation checks (+5 pts).")

        # Append Disclaimer
        reasons.append("Disclaimer: This score represents profile parameter alignment and does not predict actual outreach conversion probability.")
        
        return min(score, 100), reasons

    @staticmethod
    def find_existing_duplicate(lead: Dict[str, Any], user_id: str) -> Optional[Dict[str, Any]]:
        """Identifies duplicate candidates matching email, domain+fullname, or website+email."""
        if not supabase:
            return None

        email = lead.get("contact_email")
        website = lead.get("website")
        domain = lead.get("company_domain")
        full_name = lead.get("full_name")

        # 1. Match by email
        if email:
            try:
                res = supabase.table("leads").select("*").eq("user_id", user_id).eq("contact_email", email).execute()
                if res.data:
                    return res.data[0]
            except Exception:
                pass

        # 2. Match by website + email
        if website and email:
            try:
                res = supabase.table("leads").select("*").eq("user_id", user_id).eq("website", website).eq("contact_email", email).execute()
                if res.data:
                    return res.data[0]
            except Exception:
                pass

        # 3. Match by domain + full name
        if domain and full_name:
            try:
                res = supabase.table("leads").select("*").eq("user_id", user_id).eq("full_name", full_name).execute()
                for existing in res.data:
                    # Parse existing domain
                    existing_web = existing.get("website", "")
                    existing_domain = ""
                    if existing_web:
                        parsed = urlparse(existing_web)
                        existing_domain = parsed.netloc.lower().replace("www.", "")
                    if existing_domain == domain:
                        return existing
            except Exception:
                pass

        return None

    @classmethod
    def resolve_duplicate_conflict(
        cls, 
        new_data: Dict[str, Any], 
        existing_lead: Dict[str, Any], 
        strategy: str
    ) -> Tuple[str, Dict[str, Any]]:
        """
        Resolves conflicts using selection criteria strategy:
        - skip: return existing, don't write.
        - merge: only fill fields that are empty in existing.
        - overwrite: completely replace existing values with new payload.
        """
        if strategy == "skip":
            return "skipped", existing_lead

        if strategy == "overwrite":
            # Retain ID and user_id keys
            resolved = new_data.copy()
            resolved["id"] = existing_lead["id"]
            resolved["user_id"] = existing_lead["user_id"]
            return "overwritten", resolved

        # Merge strategy (default)
        resolved = existing_lead.copy()
        for k, v in new_data.items():
            if k in ["id", "user_id", "created_at"]:
                continue
            
            existing_val = resolved.get(k)
            # Fill in only if existing is empty
            if existing_val is None or existing_val == "" or existing_val == [] or existing_val == {}:
                resolved[k] = v
            elif k == "tags" and isinstance(v, list) and isinstance(existing_val, list):
                # Unique tag union merging
                resolved[k] = sorted(list(set(existing_val + v)))
            elif k == "custom_fields" and isinstance(v, dict) and isinstance(existing_val, dict):
                # Key merge for metadata dictionary
                merged_cf = existing_val.copy()
                for cf_k, cf_v in v.items():
                    if not merged_cf.get(cf_k):
                        merged_cf[cf_k] = cf_v
                resolved[k] = merged_cf

        return "merged", resolved
