"""Async job manager + GET /v1/jobs/{id} router."""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from collections.abc import Coroutine
from typing import Any

from fastapi import APIRouter, Depends

from api.deps import get_tenant
from api.errors import NotFoundError
from api.shared.schemas import JobStatusResponse


@dataclass
class Job:
    job_id: str
    tenant_id: str
    type: str  # avatar | background | tts
    status: str = "pending"  # pending → processing → completed | failed
    result: dict | None = None
    error: dict | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None

    def to_response(self) -> JobStatusResponse:
        return JobStatusResponse(
            job_id=self.job_id,
            status=self.status,
            type=self.type,
            result=self.result,
            error=self.error,
            created_at=self.created_at.isoformat(),
            completed_at=self.completed_at.isoformat() if self.completed_at else None,
        )


class JobManager:
    def __init__(self) -> None:
        self._jobs: dict[str, Job] = {}

    def submit(self, tenant_id: str, job_type: str, coro: Coroutine[Any, Any, dict]) -> Job:
        job = Job(job_id=f"job_{uuid.uuid4().hex[:12]}", tenant_id=tenant_id, type=job_type)
        self._jobs[job.job_id] = job
        asyncio.create_task(self._run(job, coro))
        return job

    async def _run(self, job: Job, coro: Coroutine[Any, Any, dict]) -> None:
        job.status = "processing"
        try:
            job.result = await coro
            job.status = "completed"
        except Exception as e:
            job.status = "failed"
            job.error = {"code": "JOB_FAILED", "message": str(e)}
        finally:
            job.completed_at = datetime.now(timezone.utc)

    def get(self, job_id: str, tenant_id: str) -> Job | None:
        job = self._jobs.get(job_id)
        if job and job.tenant_id == tenant_id:
            return job
        return None

    def cleanup_old(self, max_age_hours: int = 24) -> int:
        now = datetime.now(timezone.utc)
        expired = [
            jid for jid, j in self._jobs.items()
            if j.completed_at and (now - j.completed_at).total_seconds() > max_age_hours * 3600
        ]
        for jid in expired:
            del self._jobs[jid]
        return len(expired)


# Singleton
job_manager = JobManager()

# ── Router ───────────────────────────────────────────

jobs_router = APIRouter(prefix="/v1/jobs", tags=["jobs"])


@jobs_router.get("/{job_id}", response_model=JobStatusResponse)
async def get_job_status(job_id: str, tenant_id: str = Depends(get_tenant)):
    job = job_manager.get(job_id, tenant_id)
    if not job:
        raise NotFoundError("JOB_NOT_FOUND", f"Job '{job_id}' not found")
    return job.to_response()
