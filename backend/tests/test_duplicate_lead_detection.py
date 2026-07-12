from app.services.sheets_service import SheetsService


def test_demo_leads_import_duplication(mocker):
    # Set DEMO_MODE = True
    mocker.patch("app.services.sheets_service.settings.DEMO_MODE", True)

    # Mock supabase client
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.sheets_service.supabase", mock_supabase)

    # Mock duplicate checks to return existing lead for the first one, and empty for the rest
    first_check_res = mocker.MagicMock()
    first_check_res.data = [{"id": "existing-uuid"}]  # Duplicate

    other_check_res = mocker.MagicMock()
    other_check_res.data = []  # New lead

    # Configure execute side effect
    mock_supabase.table().select().eq().eq().eq().execute.side_effect = [
        first_check_res,
        other_check_res,
        other_check_res,
        other_check_res,
        other_check_res,
    ]

    # Mock insert execute
    mock_supabase.table().insert().execute.return_value = mocker.MagicMock()

    service = SheetsService()
    res = service.import_leads(user_id="demo-user-id")

    # Total mock leads processed is 5. 1 is duplicate, 4 should be imported.
    assert res["imported"] == 4
    assert res["skipped_duplicates"] == 1
    assert res["total_processed"] == 5
    assert mock_supabase.table().insert().execute.call_count == 4
