import logging

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.config import settings
from app.database import supabase
from app.services.import_service import ImportService
from app.services.sheets_service import SheetsService
from app.utils.auth import require_owner

logger = logging.getLogger("outreachops.routes.imports")

router = APIRouter(prefix="/imports", tags=["imports"])
import_service = ImportService()
sheets_service = SheetsService()


class GoogleSheetImportRequest(BaseModel):
    sheet_url: str = Field(..., description="Google Sheet URL or spreadsheet ID")
    worksheet_name: str = Field(..., description="Target worksheet tab name")


class PreviewRequest(BaseModel):
    fingerprint: str = Field(..., description="Import payload cache fingerprint")
    field_mapping: dict[str, str] = Field(
        ..., description="Mapping of source headers to target fields"
    )


class CommitRequest(BaseModel):
    fingerprint: str = Field(..., description="Import payload cache fingerprint")
    field_mapping: dict[str, str] = Field(
        ..., description="Mapping of source headers to target fields"
    )
    source_name: str = Field(..., description="Import source display name")
    source_type: str = Field(
        ..., description="Import source type: 'csv', 'xlsx', 'google_sheets'"
    )
    preset_name: str | None = Field(
        None, description="Optional name to save mapping preset as"
    )


class MappingPresetSaveRequest(BaseModel):
    name: str = Field(..., description="Preset display name")
    source_headers: list[str] = Field(..., description="Headers list")
    field_mapping: dict[str, str] = Field(..., description="Mapping configuration")


@router.post("/parse", status_code=status.HTTP_200_OK)
async def parse_import_source(
    file: UploadFile | None = File(None),
    sheet_url: str | None = Form(None),
    worksheet_name: str | None = Form(None),
    owner: dict = Depends(require_owner),
):
    """
    Parses CSV/XLSX file uploads or fetches Google Sheets tabs.
    Returns headers, sample rows, and file fingerprint.
    """
    from app.services.rate_limit_service import RateLimitService

    limiter = RateLimitService()
    limit_key = f"rate_limit:imports_parse:{owner['id']}"
    if limiter.is_rate_limited(limit_key, max_requests=10, window_seconds=60):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many import requests. Please try again later.",
        )

    if file:
        filename = file.filename or ""
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        if ext not in ["csv", "xlsx"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file extension. Only CSV and XLSX are supported.",
            )

        content_type = file.content_type or ""
        allowed_mimes = [
            "text/csv",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ]
        # Skip check if content_type is blank (fallback)
        if content_type and not any(
            mime in content_type.lower() for mime in allowed_mimes
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid file MIME type. Only CSV and XLSX are supported.",
            )

        try:
            contents = await file.read()
            res = import_service.parse_file(contents, file.filename)
            return res
        except Exception as e:
            logger.error(f"File parse endpoint failed: {e}")
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    elif sheet_url and worksheet_name:
        if settings.DEMO_MODE:
            # Under Demo Mode, fetch static mock rows
            mock_sheet_rows = [
                ["row", "website", "company", "pain points", "erp approach", "email"],
                [
                    "2",
                    "apex-roofing-mock.com",
                    "Apex Roofing Solutions",
                    "Slow forms",
                    "centralized scheduling",
                    "contact@apex-roofing-mock.com",
                ],
                [
                    "3",
                    "beacon-masonry-mock.com",
                    "Beacon Masonry Inc",
                    "No CTA",
                    "job-costing ledger",
                    "estimates@beacon-masonry-mock.com",
                ],
                [
                    "4",
                    "summit-hvac-mock.com",
                    "Summit HVAC",
                    "Broken booking tool",
                    "dispatch board",
                    "service@summit-hvac-mock.com",
                ],
            ]
            res = import_service.parse_google_sheet_rows(mock_sheet_rows)
            return res

        try:
            # Resolve spreadsheet ID/URL
            sheet_id = (
                sheet_url.split("/d/")[-1].split("/")[0]
                if "/d/" in sheet_url
                else sheet_url
            )

            client = sheets_service._get_client()
            sheet = (
                client.open_by_key(sheet_id)
                if len(sheet_id) > 20
                else client.open(sheet_url)
            )
            worksheet = sheet.worksheet(worksheet_name)
            rows_data = worksheet.get_all_values()

            res = import_service.parse_google_sheet_rows(rows_data)
            return res
        except Exception as e:
            logger.error(f"Google sheet parse failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Google Sheet sync failed: {str(e)}",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either a file upload or Google Sheets URL and worksheet name.",
        )


@router.post("/preview", status_code=status.HTTP_200_OK)
async def preview_import_validation(
    payload: PreviewRequest, owner: dict = Depends(require_owner)
):
    """Runs data mapping and validations to verify preview records and row errors."""
    try:
        res = import_service.validate_records(
            fingerprint=payload.fingerprint,
            field_mapping=payload.field_mapping,
            user_id=owner["id"],
        )
        # Append auto suggested columns configuration
        res["auto_suggestions"] = import_service.auto_suggest_mappings(
            headers=(
                res["preview_items"][0]["original_cells"]
                if res["preview_items"]
                else []
            )
        )
        return res
    except Exception as e:
        logger.error(f"Preview endpoint failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/commit", status_code=status.HTTP_200_OK)
async def commit_import_leads(
    payload: CommitRequest, owner: dict = Depends(require_owner)
):
    """Validates and commits valid leads into database leads records under source tags."""
    try:
        res = import_service.commit_import_records(
            fingerprint=payload.fingerprint,
            field_mapping=payload.field_mapping,
            user_id=owner["id"],
            source_name=payload.source_name,
            source_type=payload.source_type,
            preset_name=payload.preset_name,
        )
        return res
    except Exception as e:
        logger.error(f"Commit endpoint failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/errors/download")
async def download_errors_csv(
    fingerprint: str = Query(..., description="Payload cache fingerprint")
):
    """Downloads structured CSV mapping all failed validation records alongside error details."""
    try:
        csv_content = import_service.generate_error_csv(fingerprint)
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=import_validation_errors_{fingerprint}.csv"
            },
        )
    except Exception as e:
        logger.error(f"Download errors failed: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/mappings")
async def list_mapping_presets(owner: dict = Depends(require_owner)):
    """List saved mapping presets."""
    legacy_preset = {
        "id": "legacy-erp-import-id",
        "name": "Legacy ERP Import",
        "field_mapping": {
            "row_num": "source_row_number",
            "website": "website",
            "company_name": "company_name",
            "pain_points": "custom_fields.pain_points",
            "erp_approach": "custom_fields.erp_approach",
            "email": "contact_email",
        },
    }

    presets = [legacy_preset]
    if supabase:
        try:
            res = (
                supabase.table("import_mappings")
                .select("*")
                .eq("user_id", owner["id"])
                .execute()
            )
            if res.data:
                presets.extend(res.data)
        except Exception as e:
            logger.error(f"Failed to fetch import mappings presets: {e}")

    return presets


@router.post("/mappings")
async def save_mapping_preset(
    payload: MappingPresetSaveRequest, owner: dict = Depends(require_owner)
):
    """Saves a new mapping preset configuration."""
    if not supabase:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database offline"
        )

    try:
        db_payload = {
            "user_id": owner["id"],
            "name": payload.name,
            "source_headers": payload.source_headers,
            "field_mapping": payload.field_mapping,
        }
        res = supabase.table("import_mappings").insert(db_payload).execute()
        if not res.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save mapping preset",
            )
        return res.data[0]
    except Exception as e:
        logger.error(f"Failed to save mapping preset: {e}")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
