import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import settings


def get_fernet_key() -> str:
    # Use config key or development fallback
    raw_key = settings.ENCRYPTION_KEY or "dev-fallback-encryption-key-for-local-testing"
    # Generate 32-byte digest of key string
    key_hash = hashlib.sha256(raw_key.encode("utf-8")).digest()
    # Format to Fernet URL-safe base64 key
    return base64.urlsafe_b64encode(key_hash).decode("utf-8")


_fernet = None


def get_fernet_client() -> Fernet:
    global _fernet
    if _fernet is None:
        _fernet = Fernet(get_fernet_key())
    return _fernet


def encrypt_val(val: str) -> str:
    """
    Encrypt values using Fernet symmetric AES key.
    """
    if not val:
        return ""
    client = get_fernet_client()
    return client.encrypt(val.encode("utf-8")).decode("utf-8")


def decrypt_val(encrypted_val: str) -> str:
    """
    Decrypt values from database storage.
    """
    if not encrypted_val:
        return ""
    client = get_fernet_client()
    try:
        return client.decrypt(encrypted_val.encode("utf-8")).decode("utf-8")
    except Exception:
        # Fail silently on decryption errors (e.g. key mismatches) returning empty
        return ""
