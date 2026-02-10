"""
Game service — Oyun olusturma, baslatma, state yonetimi.
Game engine'i cagirir, WS broadcast hook'lari ekler.
"""

import uuid
import sys
from pathlib import Path

# Engine import
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from src.prototypes.world_gen import generate_world_seed, render_world_brief, _make_rng
from src.prototypes.game_state import get_alive_players

from src.apps.game.models import GameRecord, get_game, save_game


async def create_game(
    game_id: str | None,
    player_count: int,
    ai_count: int,
    day_limit: int,
) -> GameRecord:
    """Yeni oyun olustur. World seed uretilir."""
    gid = game_id or str(uuid.uuid4())
    world_seed = generate_world_seed(gid)

    game = GameRecord(
        game_id=gid,
        status="waiting",
        world_seed_json=world_seed.model_dump_json(),
        config={
            "player_count": player_count,
            "ai_count": ai_count,
            "day_limit": day_limit,
        },
    )
    save_game(game)
    return game


async def start_game(game_id: str) -> GameRecord:
    """Oyunu baslat — karakterleri uret, state'i hazirla."""
    game = get_game(game_id)
    if not game:
        raise ValueError(f"Game {game_id} not found")
    if game.status != "waiting":
        raise ValueError(f"Game {game_id} is already {game.status}")

    # TODO: generate_players + init_state + asyncio.create_task(game_loop)
    game.status = "running"
    save_game(game)
    return game


async def get_game_state(game_id: str) -> dict:
    """Public game state dondur (gizli bilgi yok)."""
    game = get_game(game_id)
    if not game:
        raise ValueError(f"Game {game_id} not found")

    world_seed = generate_world_seed(game_id)

    result = {
        "game_id": game_id,
        "status": game.status,
        "phase": game.state.get("phase", "waiting") if game.state else "waiting",
        "round_number": game.state.get("round_number", 0) if game.state else 0,
        "day_limit": game.config.get("day_limit", 5),
        "world_brief": render_world_brief(world_seed),
        "players": [],
    }

    if game.state and "players" in game.state:
        for p in game.state["players"]:
            result["players"].append({
                "slot_id": p.slot_id,
                "name": p.name,
                "role_title": p.role_title,
                "alive": p.alive,
            })

    return result
