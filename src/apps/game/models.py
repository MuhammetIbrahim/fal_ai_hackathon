"""
Game models — Hackathon icin in-memory store.
Production icin SQLModel/SQLAlchemy'e gecilecek.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class GameRecord:
    game_id: str
    status: str = "waiting"         # waiting | running | finished
    world_seed_json: str = ""
    state: dict | None = None       # GameState dict
    config: dict = field(default_factory=lambda: {
        "player_count": 6,
        "ai_count": 4,
        "day_limit": 5,
    })
    winner: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


# In-memory store
_games: dict[str, GameRecord] = {}


def get_game(game_id: str) -> GameRecord | None:
    return _games.get(game_id)


def save_game(game: GameRecord) -> None:
    _games[game.game_id] = game


def list_games() -> list[GameRecord]:
    return list(_games.values())
