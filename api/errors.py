from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class APIError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict | None = None):
        self.code = code
        self.message = message
        self.status = status
        self.details = details or {}
        super().__init__(message)


class NotFoundError(APIError):
    def __init__(self, code: str = "NOT_FOUND", message: str = "Resource not found", details: dict | None = None):
        super().__init__(code, message, 404, details)


class ValidationError(APIError):
    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "Invalid input", details: dict | None = None):
        super().__init__(code, message, 422, details)


class ServiceError(APIError):
    def __init__(self, code: str = "SERVICE_ERROR", message: str = "External service error", details: dict | None = None):
        super().__init__(code, message, 502, details)


class TenantError(APIError):
    def __init__(self, code: str = "INVALID_API_KEY", message: str = "Invalid or missing API key", details: dict | None = None):
        super().__init__(code, message, 401, details)


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def api_error_handler(request: Request, exc: APIError):
        return JSONResponse(
            status_code=exc.status,
            content={
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                }
            },
        )

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": str(exc) if app.debug else "Internal server error",
                    "details": {},
                }
            },
        )
