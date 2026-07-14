from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class OutreachOpsException(Exception):
    """Base exception class for OutreachOps AI application errors."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        details: dict = None,
        error_code: str = "INTERNAL_ERROR",
    ):
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        self.error_code = error_code
        super().__init__(message)


class MissingCredentialsError(OutreachOpsException):
    def __init__(self, message: str = "Missing credentials file", details: dict = None):
        super().__init__(
            message,
            status_code=500,
            details=details,
            error_code="MISSING_CREDENTIALS",
        )


class GmailAuthExpiredError(OutreachOpsException):
    def __init__(self, message: str = "Gmail OAuth expired", details: dict = None):
        super().__init__(
            message, status_code=401, details=details, error_code="AUTH_EXPIRED"
        )


class GeminiQuotaError(OutreachOpsException):
    def __init__(self, message: str = "Gemini quota exceeded", details: dict = None):
        super().__init__(
            message, status_code=429, details=details, error_code="QUOTA_EXCEEDED"
        )


class GoogleSheetTabError(OutreachOpsException):
    def __init__(self, message: str = "Google Sheet missing tab", details: dict = None):
        super().__init__(
            message, status_code=404, details=details, error_code="TAB_NOT_FOUND"
        )


class InvalidEmailError(OutreachOpsException):
    def __init__(self, message: str = "Invalid recipient email", details: dict = None):
        super().__init__(
            message, status_code=400, details=details, error_code="VALIDATION_ERROR"
        )


class OutreachOpsTimeoutError(OutreachOpsException):
    def __init__(self, message: str = "Request timed out", details: dict = None):
        super().__init__(
            message, status_code=504, details=details, error_code="TIMEOUT"
        )


class ConnectionFailedError(OutreachOpsException):
    def __init__(self, message: str = "Connection to service failed", details: dict = None):
        super().__init__(
            message, status_code=502, details=details, error_code="CONNECTION_FAILED"
        )


def register_error_handlers(app: FastAPI) -> None:
    """Registers standard handlers in the FastAPI app instance."""

    @app.exception_handler(OutreachOpsException)
    async def outreach_ops_exception_handler(
        request: Request, exc: OutreachOpsException
    ):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": exc.__class__.__name__,
                "error_code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        )
