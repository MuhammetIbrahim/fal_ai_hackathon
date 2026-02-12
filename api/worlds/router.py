from fastapi import APIRouter, Depends

from api.deps import get_tenant
from api.errors import NotFoundError
from api.worlds.schema import CreateWorldRequest, WorldResponse
from api.worlds import service
from api import store

router = APIRouter(prefix="/v1/worlds", tags=["worlds"])


@router.post("", response_model=WorldResponse, status_code=201)
async def create_world(body: CreateWorldRequest, tenant_id: str = Depends(get_tenant)):
    world = await service.create_world(tenant_id, body)
    return world


@router.get("/{world_id}", response_model=WorldResponse)
async def get_world(world_id: str, tenant_id: str = Depends(get_tenant)):
    world = await store.get_world(tenant_id, world_id)
    if not world:
        raise NotFoundError("WORLD_NOT_FOUND", f"World '{world_id}' not found")
    return world
