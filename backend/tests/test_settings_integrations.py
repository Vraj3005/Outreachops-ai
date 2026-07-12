import pytest
from app.utils.crypto import encrypt_val, decrypt_val
from app.schemas.settings import OwnerSettingsBase

def test_encryption_decryption():
    secret_text = "AIzaSyTestGeminiKey12345!"
    
    # Encrypt
    enc = encrypt_val(secret_text)
    assert enc != secret_text
    assert len(enc) > 10
    
    # Decrypt
    dec = decrypt_val(enc)
    assert dec == secret_text

def test_settings_hour_window_validation():
    # 1. Valid settings format
    valid_data = {
        "business_name": "Pitbull",
        "website": "pitbull.com",
        "sender_name": "Vraj",
        "sender_email": "vraj@gmail.com",
        "allowed_send_start": "08:30",
        "allowed_send_end": "18:15",
        "daily_send_limit": 100,
        "minimum_send_spacing_seconds": 30
    }
    obj = OwnerSettingsBase(**valid_data)
    assert obj.allowed_send_start == "08:30"
    
    # 2. Invalid allowed hours format
    invalid_data = dict(valid_data, allowed_send_start="8:30 AM")
    with pytest.raises(ValueError):
         OwnerSettingsBase(**invalid_data)

def test_settings_email_validation():
    valid_data = {
        "business_name": "Pitbull",
        "website": "pitbull.com",
        "sender_name": "Vraj",
        "sender_email": "invalid-email-address",
        "allowed_send_start": "09:00",
        "allowed_send_end": "17:00"
    }
    with pytest.raises(ValueError):
         OwnerSettingsBase(**valid_data)

def test_settings_daily_limit_bounds():
    valid_data = {
        "business_name": "Pitbull",
        "website": "pitbull.com",
        "sender_name": "Vraj",
        "sender_email": "vraj@gmail.com",
        "allowed_send_start": "09:00",
        "allowed_send_end": "17:00",
        "daily_send_limit": 1200 # Over le=1000 limit
    }
    with pytest.raises(ValueError):
         OwnerSettingsBase(**valid_data)
