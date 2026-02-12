from fastapi import APIRouter, Depends

from api.deps import get_tenant
from api.jobs import job_manager
from api.images import service
from api.images.schema import AvatarRequest, BackgroundRequest

router = APIRouter(prefix="/v1/images", tags=["images"])


@router.post("/avatar", status_code=202)
async def create_avatar(body: AvatarRequest, tenant_id: str = Depends(get_tenant)):
    job = job_manager.submit(tenant_id, "avatar", service.avatar(body))
    return {"job_id": job.job_id, "status": job.status}


@router.post("/background", status_code=202)
async def create_background(body: BackgroundRequest, tenant_id: str = Depends(get_tenant)):
    job = job_manager.submit(tenant_id, "background", service.background(body))
    return {"job_id": job.job_id, "status": job.status}
