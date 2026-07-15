import logging
import os
import time

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import SQLiteSupabaseClient, supabase

logger = logging.getLogger("outreachops.auth")

security = HTTPBearer(auto_error=True)

# In-memory auth cache: token -> (user_dict, expiry_timestamp)
# TTL of 60 seconds to balance security and performance
_auth_cache: dict[str, tuple[dict, float]] = {}
_AUTH_CACHE_TTL = 60  # seconds
_AUTH_CACHE_MAX_SIZE = 50


def _get_cached_auth(token: str) -> dict | None:
    """Return cached auth result if still valid, else None."""
    entry = _auth_cache.get(token)
    if entry and time.time() < entry[1]:
        return entry[0]
    # Expired or missing — remove stale entry
    _auth_cache.pop(token, None)
    return None


def _set_cached_auth(token: str, user_data: dict) -> None:
    """Cache a successful auth result with TTL."""
    # Evict oldest entries if cache is too large
    if len(_auth_cache) >= _AUTH_CACHE_MAX_SIZE:
        oldest_key = min(_auth_cache, key=lambda k: _auth_cache[k][1])
        _auth_cache.pop(oldest_key, None)
    _auth_cache[token] = (user_data, time.time() + _AUTH_CACHE_TTL)


async def require_owner(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency to authenticate and authorize the single owner.
    Extracts the bearer token, verifies it with Supabase, and ensures
    the token email matches the configured OWNER_EMAIL.
    Uses an in-memory cache to avoid repeated Supabase API calls for the same token.
    """
    token = credentials.credentials

    # Failed attempts rate limiting configuration
    from app.services.rate_limit_service import RateLimitService

    limiter = RateLimitService()
    client_ip = request.client.host if (request and request.client) else "unknown-ip"
    limit_key = f"auth_fail:{client_ip}"

    # Check if the IP is already blocked
    is_blocked = False
    if os.getenv("ENV") != "test" and supabase:
        try:
            res = (
                supabase.table("rate_limits")
                .select("value")
                .eq("key", limit_key)
                .execute()
            )
            if res.data and int(res.data[0]["value"]) >= 10:
                is_blocked = True
        except Exception:
            pass

    if is_blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many authentication failures. Please try again later.",
        )

    def record_failure_and_raise(exc: HTTPException):
        # Increment failure count
        if os.getenv("ENV") != "test":
            limiter.is_rate_limited(limit_key, max_requests=10, window_seconds=60)
        raise exc

    # 1. Demo Mode Check
    if settings.DEMO_MODE:
        if token == "mock-invalid-token":
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid, missing or expired authentication token",
                )
            )
        elif token == "mock-expired-token":
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
                )
            )
        elif token == "mock-non-owner-token":
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized: Access is restricted to the owner only",
                )
            )
        elif token not in ("mock-owner-token", "mock-valid-token"):
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid, missing or expired authentication token",
                )
            )

        # Valid Mock token bypass in Demo mode
        return {"id": settings.OWNER_USER_ID, "email": settings.OWNER_EMAIL}

    # 2. Production Supabase Client Check
    if not supabase or isinstance(supabase, SQLiteSupabaseClient):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service connection misconfigured.",
        )

    # 3. Check in-memory cache first (avoids Supabase API round-trip)
    cached = _get_cached_auth(token)
    if cached:
        return cached

    # 4. Real Supabase JWT Verification (cache miss)
    try:
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid, missing or expired authentication token",
                )
            )

        user = response.user
        email = user.email
        user_id = user.id

        if not email or email.lower() != settings.OWNER_EMAIL.lower():
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized: Access is restricted to the owner only",
                )
            )

        # Auto-provision user profile in public.users if missing
        try:
            full_name = "Owner"
            if hasattr(user, "user_metadata") and user.user_metadata:
                full_name = (
                    user.user_metadata.get("full_name")
                    or user.user_metadata.get("name")
                    or "Owner"
                )
            supabase.table("users").upsert(
                {
                    "id": user_id,
                    "email": email,
                    "full_name": full_name,
                }
            ).execute()
        except Exception as ue:
            logger.error(f"Failed to auto-provision user profile: {ue}")

        user_data = {"id": user_id, "email": email}

        # Cache successful auth for subsequent requests
        _set_cached_auth(token, user_data)

        return user_data
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        err_msg = str(e).lower()
        if "jwt expired" in err_msg or "expired" in err_msg:
            record_failure_and_raise(
                HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
                )
            )
        record_failure_and_raise(
            HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Authentication failed: {str(e)}",
            )
        )
