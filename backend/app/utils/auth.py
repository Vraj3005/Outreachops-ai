import os

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import SQLiteSupabaseClient, supabase

security = HTTPBearer(auto_error=True)


async def require_owner(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency to authenticate and authorize the single owner.
    Extracts the bearer token, verifies it with Supabase, and ensures
    the token email matches the configured OWNER_EMAIL.
    """
    token = credentials.credentials

    # Failed attempts rate limiting configuration
    from app.services.rate_limit_service import RateLimitService

    limiter = RateLimitService()
    client_ip = request.client.host if (request and request.client) else "unknown-ip"
    limit_key = f"auth_fail:{client_ip}"

    # Check if the IP is already blocked
    # In order to check without incrementing yet, we can query values of 'rate_limits' directly.
    # But for simplicity, we query a dummy key check if it's already rate limited.
    # Check database count of rate_limits for this key, bypassing during test runs
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

    # 3. Real Supabase JWT Verification
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

        return {"id": user_id, "email": email}
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
