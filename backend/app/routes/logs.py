from fastapi import APIRouter, Depends, Query

from app.crud.logs import get_error_logs, get_send_logs
from app.schemas.log import SendLog
from app.utils.auth import require_owner

router = APIRouter(prefix="/logs", tags=["logs"])


@router.get("")
async def read_logs(
    log_type: str = Query(
        "send", description="Log category to query: 'send' or 'error'"
    ),
    limit: int = Query(100, description="Max logs to return"),
    owner: dict = Depends(require_owner),
):
    """
    Get audit send logs or system error logs.
    """
    if log_type == "error":
        return get_error_logs(user_id=owner["id"], limit=limit)
    else:
        return get_send_logs(user_id=owner["id"], limit=limit)


@router.get("/send", response_model=list[SendLog])
async def read_send_logs_endpoint(
    limit: int = Query(100, description="Max logs to return"),
    owner: dict = Depends(require_owner),
):
    """
    Get audit send logs.
    """
    return get_send_logs(user_id=owner["id"], limit=limit)
