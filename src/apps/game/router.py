from fastapi import APIRouter, HTTPException

from src.apps.game.schema import (
    GameCreateRequest, GameCreateResponse,
    GameStateResponse,
)
from src.apps.game.service import create_game, get_game_state, start_game
from src.prototypes.world_gen import generate_world_seed, render_world_brief

router = APIRouter(prefix="/game", tags=["game"])


@router.post("/", response_model=GameCreateResponse)
async def create_game_endpoint(req: GameCreateRequest):
    """Yeni oyun olustur."""
    game = await create_game(
        game_id=req.game_id,
        player_count=req.player_count,
        ai_count=req.ai_count,
        day_limit=req.day_limit,
    )
    world_seed = generate_world_seed(game.game_id)
    return GameCreateResponse(
        game_id=game.game_id,
        world_brief=render_world_brief(world_seed),
        settlement_name=world_seed.place_variants.settlement_name,
        status=game.status,
    )


@router.get("/{game_id}", response_model=GameStateResponse)
async def get_game_endpoint(game_id: str):
    """Oyun durumunu getir."""
    try:
        state = await get_game_state(game_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return state


@router.post("/{game_id}/start")
async def start_game_endpoint(game_id: str):
    """Oyunu baslat."""
    try:
        game = await start_game(game_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"game_id": game.game_id, "status": game.status}
