from fastapi import Request, FastAPI
from fastapi.responses import JSONResponse

class OutreachOpsException(Exception):
    """Base exception class for OutreachOps AI application errors."""
    def __init__(self, message: str, status_code: int = 400, details: dict = None):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(message)

class MissingCredentialsError(OutreachOpsException):
    def __init__(self, message: str = "Missing credentials file", details: dict = None):
        super().__init__(message, status_code=500, details=details)

class GmailAuthExpiredError(OutreachOpsException):
    def __init__(self, message: str = "Gmail OAuth expired", details: dict = None):
        super().__init__(message, status_code=401, details=details)

class GeminiQuotaError(OutreachOpsException):
    def __init__(self, message: str = "Gemini quota exceeded", details: dict = None):
        super().__init__(message, status_code=429, details=details)

class GoogleSheetTabError(OutreachOpsException):
    def __init__(self, message: str = "Google Sheet missing tab", details: dict = None):
        super().__init__(message, status_code=404, details=details)

class InvalidEmailError(OutreachOpsException):
    def __init__(self, message: str = "Invalid recipient email", details: dict = None):
        super().__init__(message, status_code=400, details=details)

def register_error_handlers(app: FastAPI) -> None:
    """Registers standard handlers in the FastAPI app instance."""
    @app.exception_handler(OutreachOpsException)
    async def outreach_ops_exception_handler(request: Request, exc: OutreachOpsException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "message": exc.message,
                "details": exc.details
            }
        )
