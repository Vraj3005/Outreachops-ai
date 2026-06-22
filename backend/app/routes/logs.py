from typing import List, Dict, Any
from fastapi import APIRouter, Query
from app.schemas.log import SendLog, ErrorLog
from app.crud.logs import get_send_logs, get_error_logs

router = APIRouter(prefix="/logs", tags=["logs"])

DEMO_USER_ID = "d3b07384-d113-4ec2-a72d-86284f1837b2"

@router.get("")
async def read_logs(
    log_type: str = Query("send", description="Log category to query: 'send' or 'error'"),
    limit: int = Query(100, description="Max logs to return")
):
    """
    Get audit send logs or system error logs.
    """
    if log_type == "error":
        return get_error_logs(user_id=DEMO_USER_ID, limit=limit)
    else:
        return get_send_logs(user_id=DEMO_USER_ID, limit=limit)

@router.get("/send", response_model=List[SendLog])
async def read_send_logs_endpoint(
    limit: int = Query(100, description="Max logs to return")
):
    """
    Get audit send logs.
    """
    return get_send_logs(user_id=DEMO_USER_ID, limit=limit)

