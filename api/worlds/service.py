"""World generation service — auto-generate veya custom world."""

from __future__ import annotations

import uuid

from src.prototypes.world_gen import generate_world_seed, render_world_brief, render_scene_cards

from api import store
from api.worlds.schema import CreateWorldRequest


async def create_world(tenant_id: str, req: CreateWorldRequest) -> dict:
    if req.game_id:
        # Mode 1: Auto-generate — world_gen.py ile deterministik uret
        ws = generate_world_seed(req.game_id)
        world_brief = render_world_brief(ws)
        scene_cards = render_scene_cards(ws)

        data = {
            **ws.model_dump(),
            "world_brief": world_brief,
            "scene_cards": scene_cards,
        }

        # Custom override varsa uzerine yaz
        if req.name:
            data["name"] = req.name
        if req.description:
            data["description"] = req.description
        if req.tone:
            data["tone"] = req.tone
        if req.setting:
            data["setting"] = req.setting
        if req.rules:
            data["rules"] = req.rules
        if req.taboo_words is not None:
            data["taboo_words"] = req.taboo_words
        if req.metadata:
            data["metadata"] = req.metadata

        return await store.save_world(tenant_id, ws.world_seed, data)

    else:
        # Mode 2: Custom world — consumer kendi evrenini supply ediyor
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
