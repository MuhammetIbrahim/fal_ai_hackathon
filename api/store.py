"""Tenant-scoped in-memory store."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


# {tenant_id: {entity_id: entity_dict}}
_characters: dict[str, dict[str, dict]] = {}
_worlds: dict[str, dict[str, dict]] = {}
_memories: dict[str, dict[str, list[dict]]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Characters ───────────────────────────────────────

async def save_character(tenant_id: str, char_id: str, data: dict) -> dict:
    _characters.setdefault(tenant_id, {})[char_id] = {**data, "id": char_id, "created_at": _now()}
    return _characters[tenant_id][char_id]


async def get_character(tenant_id: str, char_id: str) -> dict | None:
    return _characters.get(tenant_id, {}).get(char_id)


async def list_characters(tenant_id: str, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
    bucket = _characters.get(tenant_id, {})
    all_chars = list(bucket.values())
    return all_chars[offset : offset + limit], len(all_chars)


async def update_character(tenant_id: str, char_id: str, updates: dict) -> dict | None:
    char = await get_character(tenant_id, char_id)
    if not char:
        return None
    char.update(updates)
    char["updated_at"] = _now()
    return char


async def delete_character(tenant_id: str, char_id: str) -> bool:
    bucket = _characters.get(tenant_id, {})
    if char_id in bucket:
        del bucket[char_id]
        return True
    return False


# ── Worlds ───────────────────────────────────────────

async def save_world(tenant_id: str, world_id: str, data: dict) -> dict:
    _worlds.setdefault(tenant_id, {})[world_id] = {**data, "id": world_id, "created_at": _now()}
    return _worlds[tenant_id][world_id]


async def get_world(tenant_id: str, world_id: str) -> dict | None:
    return _worlds.get(tenant_id, {}).get(world_id)


# ── Memory ───────────────────────────────────────────

async def add_exchange(tenant_id: str, char_id: str, exchange: dict) -> None:
    _memories.setdefault(tenant_id, {}).setdefault(char_id, []).append(exchange)


async def get_exchanges(tenant_id: str, char_id: str) -> list[dict]:
    return _memories.get(tenant_id, {}).get(char_id, [])


async def clear_memory(tenant_id: str, char_id: str) -> None:
    if tenant_id in _memories and char_id in _memories[tenant_id]:
        _memories[tenant_id][char_id] = []


# ── Conversations ─────────────────────────────────────

_conversations: dict[str, dict[str, dict]] = {}


async def save_conversation(tenant_id: str, conv_id: str, data: dict) -> dict:
    _conversations.setdefault(tenant_id, {})[conv_id] = {**data, "id": conv_id, "created_at": _now()}
    return _conversations[tenant_id][conv_id]


async def get_conversation(tenant_id: str, conv_id: str) -> dict | None:
    return _conversations.get(tenant_id, {}).get(conv_id)


async def update_conversation(tenant_id: str, conv_id: str, updates: dict) -> dict | None:
    conv = await get_conversation(tenant_id, conv_id)
    if not conv:
        return None
    conv.update(updates)
    conv["updated_at"] = _now()
    return conv


async def list_conversations(tenant_id: str, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
    bucket = _conversations.get(tenant_id, {})
    all_convs = list(bucket.values())
    return all_convs[offset : offset + limit], len(all_convs)


async def delete_conversation(tenant_id: str, conv_id: str) -> bool:
    bucket = _conversations.get(tenant_id, {})
    if conv_id in bucket:
        del bucket[conv_id]
        return True
    return False


async def add_conversation_turn(tenant_id: str, conv_id: str, turn: dict) -> None:
    conv = await get_conversation(tenant_id, conv_id)
    if conv:
        conv.setdefault("turns", []).append(turn)
