from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.database import SQLiteSupabaseClient, supabase

security = HTTPBearer(auto_error=True)


async def require_owner(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    FastAPI dependency to authenticate and authorize the single owner.
    Extracts the bearer token, verifies it with Supabase, and ensures
    the token email matches the configured OWNER_EMAIL.
    """
    token = credentials.credentials

    # 1. Demo Mode Check
    if settings.DEMO_MODE:
        if token == "mock-invalid-token":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, missing or expired authentication token",
            )
        elif token == "mock-expired-token":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
            )
        elif token == "mock-non-owner-token":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Access is restricted to the owner only",
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
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid, missing or expired authentication token",
            )

        user = response.user
        email = user.email
        user_id = user.id

        if not email or email.lower() != settings.OWNER_EMAIL.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Unauthorized: Access is restricted to the owner only",
            )

        return {"id": user_id, "email": email}
    except Exception as e:
        err_msg = str(e).lower()
        if "jwt expired" in err_msg or "expired" in err_msg:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Token has expired"
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Authentication failed: {str(e)}",
        )
