import io

import pytest
from openpyxl import Workbook

from app.services.import_service import ImportService


@pytest.fixture
def import_service():
    return ImportService()


def test_parse_csv_arbitrary_column_order(import_service):
    # Test CSV with arbitrary column order
    csv_data = "Email,Website,Company,ERP\r\ninfo@apex.com,apex.com,Apex,scheduling\r\n"
    res = import_service.parse_file(csv_data.encode("utf-8"), "test.csv")
    assert "Email" in res["headers"]
    assert "Website" in res["headers"]

    # Auto mapping check
    mappings = import_service.auto_suggest_mappings(res["headers"])
    assert mappings["Email"] == "contact_email"
    assert mappings["Website"] == "website"
    assert mappings["Company"] == "company_name"


def test_parse_csv_missing_headers(import_service):
    # Test file with no headers (just raw values or empty headers)
    csv_data = "\r\n,,\r\n"
    with pytest.raises(ValueError, match="Parsed file headers are empty"):
        import_service.parse_file(csv_data.encode("utf-8"), "test.csv")


def test_parse_csv_duplicate_headers(import_service):
    # Test CSV with duplicate headers
    csv_data = "Website,Website,Email\r\napex.com,beacon.com,info@apex.com\r\n"
    res = import_service.parse_file(csv_data.encode("utf-8"), "test.csv")
    assert res["headers"] == ["Website", "Website_2", "Email"]


def test_custom_fields_mapping(import_service):
    # Test mapping custom fields
    headers = ["Website", "Email", "ERP Pain Points", "Notes"]
    mappings = import_service.auto_suggest_mappings(headers)
    assert mappings["Website"] == "website"
    assert mappings["Email"] == "contact_email"
    assert mappings["ERP Pain Points"] == "custom_fields.erp_pain_points"
    assert mappings["Notes"] == "custom_fields.notes"


def test_csv_encodings(import_service):
    # Test CSV with different encodings
    content_latin1 = "Company,Website,Email\nApéx,apex.com,info@apex.com\n".encode(
        "latin-1"
    )
    res = import_service.parse_file(content_latin1, "latin1.csv")
    assert "Company" in res["headers"]
    assert len(res["sample_rows"]) == 1


def test_xlsx_parsing(import_service):
    # Create a small valid xlsx file in-memory
    wb = Workbook()
    ws = wb.active
    ws.append(["Company", "Website", "Email"])
    ws.append(["Apex", "apex.com", "info@apex.com"])

    out = io.BytesIO()
    wb.save(out)
    xlsx_bytes = out.getvalue()

    res = import_service.parse_file(xlsx_bytes, "test.xlsx")
    assert res["headers"] == ["Company", "Website", "Email"]
    assert res["total_rows"] == 1
    assert res["sample_rows"][0] == ["Apex", "apex.com", "info@apex.com"]


def test_empty_file(import_service):
    # Empty CSV parsing failure
    with pytest.raises(ValueError):
        import_service.parse_file(b"", "empty.csv")


def test_oversized_file(import_service):
    # Payload exceeding 10MB limit
    huge_bytes = b"x" * (11 * 1024 * 1024)
    with pytest.raises(ValueError, match="exceeds maximum limit"):
        import_service.parse_file(huge_bytes, "huge.csv")


def test_validation_duplicate_rows_in_payload(import_service):
    # Test duplicate rows inside the uploaded payload
    csv_data = "Website,Email\napex.com,info@apex.com\napex.com,info@apex.com\n"
    parse_res = import_service.parse_file(csv_data.encode("utf-8"), "dups.csv")

    mappings = {"Website": "website", "Email": "contact_email"}

    val_res = import_service.validate_records(
        fingerprint=parse_res["fingerprint"],
        field_mapping=mappings,
        user_id="d3b07384-d113-4ec2-a72d-86284f1837b2",
    )

    assert val_res["total_rows"] == 2
    assert val_res["valid_count"] == 1
    assert val_res["error_count"] == 1
    assert (
        "Duplicate lead row inside upload file"
        in val_res["errors_list"][0]["errors"][0]
    )


def test_formula_cells_xlsx(import_service):
    # Ensure formula strings are not evaluated/executed as formulas
    wb = Workbook()
    ws = wb.active
    ws.append(["Company", "Website", "Email"])
    ws.append(["=SUM(A1:A5)", "apex.com", "info@apex.com"])

    out = io.BytesIO()
    wb.save(out)
    xlsx_bytes = out.getvalue()

    res = import_service.parse_file(xlsx_bytes, "formulas.xlsx")
    # In read_only & data_only mode, formula cell returns None or the formula string
    val = res["sample_rows"][0][0]
    assert val == "=SUM(A1:A5)" or val == ""


def test_google_sheet_mapping(import_service):
    # Verify parsing Google Sheet mock rows structure
    mock_rows = [
        ["Row", "Website", "Email", "Company"],
        ["2", "apex.com", "info@apex.com", "Apex"],
    ]
    res = import_service.parse_google_sheet_rows(mock_rows)
    assert res["headers"] == ["Row", "Website", "Email", "Company"]
    assert res["total_rows"] == 1

    mappings = import_service.auto_suggest_mappings(res["headers"])
    assert mappings["Website"] == "website"
    assert mappings["Email"] == "contact_email"
