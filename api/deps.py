from fastapi import Header

from api.config import get_api_settings
from api.errors import TenantError


async def get_tenant(authorization: str = Header(...)) -> str:
    key = authorization.removeprefix("Bearer ").strip()
    settings = get_api_settings()
    tenant_id = settings.API_KEYS.get(key)
    if not tenant_id:
        raise TenantError()
    return tenant_id
