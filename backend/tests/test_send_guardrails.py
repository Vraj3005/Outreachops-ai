import pytest
from app.services.rate_limit_service import RateLimitService

def test_check_daily_limit_under_cap(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.rate_limit_service.supabase", mock_supabase)
    
    # Mock log counts to return 10 sent emails
    res_mock = mocker.MagicMock()
    res_mock.count = 10
    mock_supabase.table().select().eq().eq().gte().execute.return_value = res_mock
    
    rls = RateLimitService()
    rls.limit = 50
    
    # 10 < 50, should allow sending
    assert rls.check_daily_limit(user_id="user-123") is True

def test_check_daily_limit_over_cap(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.rate_limit_service.supabase", mock_supabase)
    
    # Mock log counts to return 50 sent emails
    res_mock = mocker.MagicMock()
    res_mock.count = 50
    mock_supabase.table().select().eq().eq().gte().execute.return_value = res_mock
    
    rls = RateLimitService()
    rls.limit = 50
    
    # 50 >= 50, should block sending
    assert rls.check_daily_limit(user_id="user-123") is False

def test_check_double_email_limit_fresh(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.rate_limit_service.supabase", mock_supabase)
    
    # Mock log count for lead today as 0
    res_mock = mocker.MagicMock()
    res_mock.count = 0
    mock_supabase.table().select().eq().eq().gte().execute.return_value = res_mock
    
    rls = RateLimitService()
    assert rls.check_double_email_limit(lead_id="lead-123") is True

def test_check_double_email_limit_duplicate(mocker):
    mock_supabase = mocker.MagicMock()
    mocker.patch("app.services.rate_limit_service.supabase", mock_supabase)
    
    # Mock log count for lead today as 1
    res_mock = mocker.MagicMock()
    res_mock.count = 1
    mock_supabase.table().select().eq().eq().gte().execute.return_value = res_mock
    
    rls = RateLimitService()
    assert rls.check_double_email_limit(lead_id="lead-123") is False
