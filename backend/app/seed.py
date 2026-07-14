import sys
from pathlib import Path

# Add backend directory to Python path
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.database import supabase

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"
DEMO_EMAIL = "demo@outreachops.ai"

MOCK_LEADS = [
    {
        "id": "e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd0",
        "user_id": DEMO_USER_ID,
        "company_name": "Apex Roofing Solutions",
        "website": "apex-roofing-mock.com",
        "industry": "Construction",
        "country": "USA",
        "city": "Atlanta",
        "contact_email": "contact@apex-roofing-mock.com",
        "phone": "+1-404-555-0199",
        "website_pain_points": "Slow contact forms, mobile view layout shift, missing lead forms on main pricing tab.",
        "erp_approach": "centralized job scheduling, subcontractor invoice generation, material tracking dashboards",
        "lead_status": "Pending",
        "source_sheet_name": "Demo",
        "source_row_number": "2",
    },
    {
        "id": "e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd1",
        "user_id": DEMO_USER_ID,
        "company_name": "Beacon Masonry Inc",
        "website": "beacon-masonry-mock.com",
        "industry": "Construction",
        "country": "USA",
        "city": "Boston",
        "contact_email": "estimates@beacon-masonry-mock.com",
        "phone": "+1-617-555-0144",
        "website_pain_points": "Informational only, no lead capture CTA, outdated project visual showcase portfolio.",
        "erp_approach": "job-costing ledger, purchase approval workflows, materials inventory control",
        "lead_status": "Pending",
        "source_sheet_name": "Demo",
        "source_row_number": "3",
    },
    {
        "id": "e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd2",
        "user_id": DEMO_USER_ID,
        "company_name": "Summit HVAC Services",
        "website": "summit-hvac-mock.com",
        "industry": "Home Services",
        "country": "USA",
        "city": "Denver",
        "contact_email": "service@summit-hvac-mock.com",
        "phone": "+1-303-555-0122",
        "website_pain_points": "Booking tool is broken on iOS safari, lack of conversion funnel mapping on landing pages.",
        "erp_approach": "dispatching dispatch board, field service app, equipment maintenance logs, invoice syncing",
        "lead_status": "Pending",
        "source_sheet_name": "Demo",
        "source_row_number": "4",
    },
    {
        "id": "e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd3",
        "user_id": DEMO_USER_ID,
        "company_name": "Prime Glass & Glazing",
        "website": "primeglass-mock.com",
        "industry": "Construction Services",
        "country": "Canada",
        "city": "Toronto",
        "contact_email": "info@primeglass-mock.com",
        "phone": "+1-416-555-0188",
        "website_pain_points": "No dynamic online quote estimate workflow, low visual contrast on dark buttons.",
        "erp_approach": "estimate approvals portal, job status notification trigger pipeline, automated dispatching",
        "lead_status": "Pending",
        "source_sheet_name": "Demo",
        "source_row_number": "5",
    },
    {
        "id": "e7c2ba31-8f43-4cb5-8e2b-2a912ef32cd4",
        "user_id": DEMO_USER_ID,
        "company_name": "Vanguard Builders",
        "website": "vanguard-build-mock.net",
        "industry": "General Contractors",
        "country": "UK",
        "city": "London",
        "contact_email": "tenders@vanguard-build-mock.net",
        "phone": "+44-20-7946-0155",
        "website_pain_points": "Heavy pdf downloads for portfolio page instead of fast web showcases.",
        "erp_approach": "subcontractor tracking, request for information (RFI) logs, real-time job-cost dashboard",
        "lead_status": "Pending",
        "source_sheet_name": "Demo",
        "source_row_number": "6",
    },
]


def seed():
    if not supabase:
        print(
            "[ERROR] Supabase client is not initialized. Check your environment variables."
        )
        return

    try:
        print(f"Checking for demo user {DEMO_EMAIL}...")
        supabase.table("users").upsert(
            {
                "id": DEMO_USER_ID,
                "email": DEMO_EMAIL,
                "full_name": "Demo Administrator",
            },
            on_conflict="email",
        ).execute()
        print("[SUCCESS] User configuration active.")

        print("Seeding leads database...")
        for lead in MOCK_LEADS:
            supabase.table("leads").upsert(lead).execute()
        print("[SUCCESS] 5 Mock leads seeded successfully.")

    except Exception as e:
        print(f"[ERROR] Database seeding failed: {e}")


if __name__ == "__main__":
    seed()
