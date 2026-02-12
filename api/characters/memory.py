from api import store


async def get_memory(tenant_id: str, char_id: str) -> dict:
    exchanges = await store.get_exchanges(tenant_id, char_id)
    return {"character_id": char_id, "exchanges": exchanges, "total": len(exchanges)}


async def add_to_memory(tenant_id: str, char_id: str, exchange: dict) -> None:
    await store.add_exchange(tenant_id, char_id, exchange)
