import uuid

from api import store
from api.worlds.schema import CreateWorldRequest


async def create_world(tenant_id: str, req: CreateWorldRequest) -> dict:
    world_id = uuid.uuid4().hex[:16]
    data = {
        "name": req.name,
        "description": req.description,
        "tone": req.tone,
        "setting": req.setting or {},
        "rules": req.rules or {},
        "taboo_words": req.taboo_words or [],
        "metadata": req.metadata or {},
    }
    return await store.save_world(tenant_id, world_id, data)
