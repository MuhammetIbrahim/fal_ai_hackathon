from pydantic import BaseModel


# ── Request ──

class GameCreateRequest(BaseModel):
    game_id: str | None = None
    player_count: int = 6
    ai_count: int = 4
    day_limit: int = 5


# ── Response ──

class PlayerPublic(BaseModel):
    slot_id: str
    name: str
    role_title: str
    alive: bool

class GameCreateResponse(BaseModel):
    game_id: str
    world_brief: str
    settlement_name: str
    status: str             # waiting | running | finished

class GameStateResponse(BaseModel):
    game_id: str
    status: str
    phase: str
    round_number: int
    day_limit: int
    players: list[PlayerPublic]
    world_brief: str

class GameLogResponse(BaseModel):
    game_id: str
    winner: str | None
    total_rounds: int
    rounds: list[dict]
