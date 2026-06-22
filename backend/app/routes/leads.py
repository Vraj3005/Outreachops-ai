from typing import List
from fastapi import APIRouter, HTTPException, Path, status
from app.schemas.lead import Lead, LeadBase, LeadCreate, LeadUpdate
from app.crud.leads import get_leads, get_lead, create_lead, update_lead, delete_lead

router = APIRouter(prefix="/leads", tags=["leads"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

@router.get("", response_model=List[Lead])
async def read_leads(limit: int = 100):
    """
    Get all ingested leads.
    """
    return get_leads(user_id=DEMO_USER_ID, limit=limit)

@router.post("", response_model=Lead, status_code=status.HTTP_201_CREATED)
async def add_lead(lead_in: LeadBase):
    """
    Add a new lead to the database.
    """
    # Create LeadCreate instance using client input and user ID
    payload = LeadCreate(**lead_in.model_dump(), user_id=DEMO_USER_ID)
    res = create_lead(payload)
    if not res:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create lead. Verify database connection."
        )
    return res

@router.patch("/{id}", response_model=Lead)
async def modify_lead(
    id: str = Path(..., description="The unique UUID of the lead"),
    lead_in: LeadUpdate = None
):
    """
    Update lead details.
    """
    if not lead_in:
        raise HTTPException(status_code=400, detail="Request body cannot be empty")
    
    # Confirm lead exists and belongs to user
    existing = get_lead(id)
    if not existing or existing.get("user_id") != DEMO_USER_ID:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    res = update_lead(id, lead_in)
    if not res:
        raise HTTPException(status_code=500, detail="Failed to update lead record")
    return res

@router.delete("/{id}", status_code=status.HTTP_200_OK)
async def remove_lead(id: str = Path(..., description="The unique UUID of the lead")):
    """
    Delete a lead from the database.
    """
    existing = get_lead(id)
    if not existing or existing.get("user_id") != DEMO_USER_ID:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    success = delete_lead(id)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to delete lead record")
    return {"message": "Lead deleted successfully", "id": id}

import csv
import io
import logging
from fastapi import UploadFile, File
from app.database import supabase

logger = logging.getLogger("outreachops.routes.leads")

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_leads_csv(file: UploadFile = File(...)):
    """
    Upload a CSV sheet of leads, parse it, and insert into the database.
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files are supported.")
        
    try:
        contents = await file.read()
        decoded = contents.decode('utf-8-sig', errors='ignore')
        csv_file = io.StringIO(decoded)
        reader = csv.reader(csv_file)
        
        rows = list(reader)
        if not rows:
            return {"imported": 0, "skipped_duplicates": 0, "message": "The CSV file is empty."}
            
        header = [h.strip().lower() for h in rows[0]]
        
        # Determine column mappings
        col_website = -1
        col_email = -1
        col_erp = -1
        col_company = -1
        
        for idx, h in enumerate(header):
            if "website" in h:
                col_website = idx
            elif "email" in h or "contact" in h or "mail" in h:
                col_email = idx
            elif "erp" in h or "pain" in h or "approach" in h:
                col_erp = idx
            elif "company" in h or "name" in h:
                col_company = idx
                
        # Positional fallbacks
        if col_website == -1 and len(rows[0]) >= 1:
            col_website = 0
        if col_company == -1 and len(rows[0]) >= 2:
            col_company = 1
        if col_erp == -1 and len(rows[0]) >= 3:
            col_erp = 2
        if col_email == -1 and len(rows[0]) >= 4:
            col_email = 3
            
        is_header = True
        # If first row contains actual website data (e.g. dots or slashes), it's not a header row
        if rows[0][max(0, col_website)].startswith("www.") or "://" in rows[0][max(0, col_website)] or "." in rows[0][max(0, col_website)]:
            if col_website == 0 and col_company == 1 and col_erp == 2 and col_email == 3:
                is_header = False

        data_rows = rows[1:] if is_header else rows
        
        imported = 0
        skipped = 0
        
        for idx, r in enumerate(data_rows, start=2):
            if not r:
                continue
            r = [val.strip() for val in r]
            r = r + [""] * max(0, 4 - len(r))
            
            website = r[col_website] if (col_website != -1 and col_website < len(r)) else ""
            email = r[col_email] if (col_email != -1 and col_email < len(r)) else ""
            erp = r[col_erp] if (col_erp != -1 and col_erp < len(r)) else ""
            company = r[col_company] if (col_company != -1 and col_company < len(r)) else ""
            
            if not website or not email:
                continue
                
            if not company:
                company = website.split(".")[0].capitalize()
                
            duplicate_check = supabase.table("leads").select("id") \
                .eq("user_id", DEMO_USER_ID) \
                .eq("website", website) \
                .eq("contact_email", email) \
                .execute()
                
            if duplicate_check.data:
                skipped += 1
                continue
                
            supabase.table("leads").insert({
                "user_id": DEMO_USER_ID,
                "company_name": company,
                "website": website,
                "contact_email": email,
                "website_pain_points": None,
                "erp_approach": erp,
                "lead_status": "Pending",
                "source_sheet_name": "CSV Upload",
                "source_row_number": str(idx)
            }).execute()
            
            imported += 1
            
        return {
            "imported": imported,
            "skipped_duplicates": skipped,
            "total_processed": len(data_rows)
        }
    except Exception as e:
        logger.error(f"Error importing CSV file: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process CSV file: {e}")
