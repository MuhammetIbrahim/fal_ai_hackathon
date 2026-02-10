"""
router.py — Lobby REST Endpoints
=================================
Lobi oluşturma, katılma, başlatma endpoint'leri.
"""

import logging
from fastapi import APIRouter, HTTPException, status

from src.apps.lobby.schema import (
    LobbyCreateRequest,
    LobbyResponse,
    JoinRequest,
    JoinResponse,
    LobbyStartResponse,
)
from src.apps.lobby import service

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# ROUTER SETUP
# ═══════════════════════════════════════════════════

router = APIRouter(prefix="/api/lobby", tags=["lobby"])


# ═══════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════

@router.post("/", response_model=LobbyResponse, status_code=status.HTTP_201_CREATED)
async def create_lobby_endpoint(req: LobbyCreateRequest):
    """
    Yeni lobi oluştur.
    
    6 haneli benzersiz kod döner (ABC123 formatında).
    Host otomatik P0 slot'una atanır.
    
    Returns:
        201: Lobi oluşturuldu
        400: Geçersiz parametreler
    """
    try:
        lobby = await service.create_lobby(
            host_name=req.host_name,
            max_players=req.max_players,
            ai_count=req.ai_count,
            day_limit=req.day_limit,
        )
        return lobby
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Failed to create lobby: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/{lobby_code}", response_model=LobbyResponse)
async def get_lobby_endpoint(lobby_code: str):
    """
    Lobi durumunu getir.
    
    Args:
        lobby_code: 6 haneli lobi kodu
    
    Returns:
        200: Lobi bilgileri
        404: Lobi bulunamadı
    """
    lobby = await service.get_lobby(lobby_code)
    
    if not lobby:
        raise HTTPException(
            status_code=404,
            detail=f"Lobby not found: {lobby_code}"
        )
    
    return lobby


@router.post("/{lobby_code}/join", response_model=JoinResponse)
async def join_lobby_endpoint(lobby_code: str, req: JoinRequest):
    """
    Lobiye katıl.
    
    İnsan oyuncu için slot atanır (P1, P2, ...).
    
    Args:
        lobby_code: Lobi kodu
        req: Oyuncu adı
    
    Returns:
        200: Katılım başarılı
        400: Lobi dolu veya oyun başlamış
        404: Lobi bulunamadı
    """
    try:
        result = await service.join_lobby(lobby_code, req.player_name)
        return result
    
    except ValueError as e:
        # Lobi dolu, oyun başlamış, vb.
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Failed to join lobby {lobby_code}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/{lobby_code}/start", response_model=LobbyStartResponse)
async def start_lobby_endpoint(lobby_code: str, host_name: str):
    """
    Lobiden oyun başlat (sadece host).
    
    AI oyuncular otomatik eklenir, game service'e devredilir.
    
    Args:
        lobby_code: Lobi kodu
        host_name: Host'un adı (authorization için query param)
    
    Returns:
        200: Oyun başlatıldı
        400: Host değil, yetersiz oyuncu
        404: Lobi bulunamadı
    """
    try:
        result = await service.start_lobby(lobby_code, host_name)
        
        return {
            "game_id": result["game_id"],
            "lobby_code": lobby_code,
            "message": f"Game started with {result['total_players']} players!",
        }
    
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    except Exception as e:
        logger.error(f"Failed to start lobby {lobby_code}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/{lobby_code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lobby_endpoint(lobby_code: str):
    """
    Lobi sil (opsiyonel cleanup).
    
    Normal akışta gerek yok — oyun bittikten sonra otomatik silinebilir.
    """
    await service.delete_lobby(lobby_code)


@router.get("/", response_model=list[LobbyResponse])
async def list_lobbies_endpoint():
    """
    Tüm aktif lobileri listele (debug/admin için).
    """
    lobbies = await service.get_all_lobbies()
    return lobbies
