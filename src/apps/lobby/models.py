"""
Lobby models — Hackathon icin in-memory store.
Production icin SQLModel/SQLAlchemy'e gecilecek.
"""

from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class LobbyRecord:
    """Lobi kaydı (in-memory)."""
    lobby_code: str
    host: str
    max_players: int = 6
    players: list[dict] = field(default_factory=list)
    status: str = "waiting"  # waiting | starting | in_game
    game_id: str | None = None
    created_at: datetime = field(default_factory=datetime.utcnow)


# In-memory store
_lobbies: dict[str, LobbyRecord] = {}


def get_lobby(lobby_code: str) -> LobbyRecord | None:
    """Lobi getir."""
    return _lobbies.get(lobby_code)


def save_lobby(lobby: LobbyRecord) -> None:
    """Lobi kaydet."""
    _lobbies[lobby.lobby_code] = lobby


def list_lobbies() -> list[LobbyRecord]:
    """Tüm lobileri listele."""
    return list(_lobbies.values())


def delete_lobby(lobby_code: str) -> None:
    """Lobi sil."""
    if lobby_code in _lobbies:
        del _lobbies[lobby_code]
