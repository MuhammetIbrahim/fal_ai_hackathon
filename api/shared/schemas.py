from pydantic import BaseModel
from typing import Any


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: dict = {}


class ErrorResponse(BaseModel):
    error: ErrorDetail


class PaginatedResponse(BaseModel):
    items: list[Any]
    total: int
    limit: int
    offset: int


class JobStatusResponse(BaseModel):
    job_id: str
    status: str  # pending | processing | completed | failed
    type: str
    result: dict | None = None
    error: dict | None = None
    created_at: str
    completed_at: str | None = None
