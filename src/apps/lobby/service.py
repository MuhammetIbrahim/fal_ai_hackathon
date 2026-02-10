"""
service.py — Lobby Business Logic
==================================
Lobi oluşturma, katılma, oyun başlatma mantığı.
"""

import random
import string
import logging
from typing import Dict, Optional

from src.apps.lobby.schema import LobbyPlayer, LobbyResponse

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════
# IN-MEMORY LOBBY STORE
# ═══════════════════════════════════════════════════

_lobbies: Dict[str, dict] = {}


# ═══════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════

def _generate_lobby_code() -> str:
    """
    6 haneli benzersiz lobi kodu üret (ABC123 formatında).
    """
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in _lobbies:
            return code


# ═══════════════════════════════════════════════════
# LOBBY SERVICE FUNCTIONS
# ═══════════════════════════════════════════════════

async def create_lobby(host_name: str, max_players: int, ai_count: int, day_limit: int) -> dict:
    """
    Yeni lobi oluştur.
    
    Args:
        host_name: Lobi sahibinin adı
        max_players: Maksimum oyuncu sayısı
        ai_count: AI oyuncu sayısı
        day_limit: Maksimum gün sayısı
    
    Returns:
        Oluşturulan lobi verisi
    """
    code = _generate_lobby_code()
    
    lobby = {
        "lobby_code": code,
        "host": host_name,
        "max_players": max_players,
        "ai_count": ai_count,
        "day_limit": day_limit,
        "players": [
            {
                "slot_id": "P0",
                "name": host_name,
                "is_host": True,
                "is_human": True,
                "ready": True,
            }
        ],
        "status": "waiting",
        "game_id": None,
    }
    
    _lobbies[code] = lobby
    
    logger.info(f"🎮 Lobby created: {code} by {host_name}")
    return lobby


async def get_lobby(lobby_code: str) -> Optional[dict]:
    """
    Lobi durumunu getir.
    
    Args:
        lobby_code: Lobi kodu
    
    Returns:
        Lobi verisi veya None
    """
    return _lobbies.get(lobby_code)


async def join_lobby(lobby_code: str, player_name: str) -> dict:
    """
    Lobiye katıl.
    
    Args:
        lobby_code: Lobi kodu
        player_name: Oyuncu adı
    
    Returns:
        Oyuncu slot bilgisi
    
    Raises:
        ValueError: Lobi bulunamadı, dolu veya oyun başlamış
    """
    lobby = _lobbies.get(lobby_code)
    
    if not lobby:
        raise ValueError(f"Lobby not found: {lobby_code}")
    
    if lobby["status"] != "waiting":
        raise ValueError(f"Lobby is not accepting players (status: {lobby['status']})")
    
    # İnsan oyuncu sayısı kontrolü (AI hariç)
    human_count = sum(1 for p in lobby["players"] if p["is_human"])
    max_human_slots = lobby["max_players"] - lobby["ai_count"]
    
    if human_count >= max_human_slots:
        raise ValueError(f"Lobby is full (max human players: {max_human_slots})")
    
    # Yeni slot ID ata
    slot_id = f"P{len(lobby['players'])}"
    
    player = {
        "slot_id": slot_id,
        "name": player_name,
        "is_host": False,
        "is_human": True,
        "ready": False,
    }
    
    lobby["players"].append(player)
    
    logger.info(f"👤 {player_name} joined lobby {lobby_code} as {slot_id}")
    
    return {
        "slot_id": slot_id,
        "lobby_code": lobby_code,
        "player_name": player_name,
    }


async def start_lobby(lobby_code: str, player_name: str) -> dict:
    """
    Lobiden oyun başlat (sadece host yapabilir).
    
    AI oyuncular otomatik eklenir, game/ service'e devredilir.
    
    Args:
        lobby_code: Lobi kodu
        player_name: İşlemi yapan oyuncu (host olmalı)
    
    Returns:
        Oluşturulan game_id
    
    Raises:
        ValueError: Lobi bulunamadı, host değil, yetersiz oyuncu
    """
    lobby = _lobbies.get(lobby_code)
    
    if not lobby:
        raise ValueError(f"Lobby not found: {lobby_code}")
    
    if lobby["host"] != player_name:
        raise ValueError(f"Only host can start the game")
    
    if lobby["status"] != "waiting":
        raise ValueError(f"Lobby already started (status: {lobby['status']})")
    
    # AI oyuncuları ekle
    human_count = len(lobby["players"])
    ai_needed = lobby["ai_count"]
    
    for i in range(ai_needed):
        slot_id = f"P{human_count + i}"
        ai_name = f"AI_{slot_id}"
        
        lobby["players"].append({
            "slot_id": slot_id,
            "name": ai_name,
            "is_host": False,
            "is_human": False,
            "ready": True,
        })
    
    total_players = human_count + ai_needed
    
    if total_players < 3:
        raise ValueError(f"Not enough players (minimum 3, current: {total_players})")
    
    lobby["status"] = "starting"
    
    logger.info(f"🚀 Starting lobby {lobby_code}: {human_count} humans + {ai_needed} AI = {total_players} total")
    
    # Game service'e devret
    from src.core.game_engine import create_new_game
    
    game_data = await create_new_game(
        game_id=None,  # UUID otomatik üretilecek
        player_count=total_players,
        ai_count=ai_needed,
        day_limit=lobby["day_limit"],
    )
    
    game_id = game_data["game_id"]
    lobby["game_id"] = game_id
    lobby["status"] = "in_game"
    
    logger.info(f"✅ Lobby {lobby_code} → Game {game_id}")
    
    return {
        "game_id": game_id,
        "lobby_code": lobby_code,
        "total_players": total_players,
    }


async def delete_lobby(lobby_code: str) -> None:
    """
    Lobi sil (opsiyonel cleanup).
    """
    if lobby_code in _lobbies:
        del _lobbies[lobby_code]
        logger.info(f"🗑️  Lobby deleted: {lobby_code}")


async def get_all_lobbies() -> list:
    """
    Tüm aktif lobileri getir (debug/admin için).
    """
    return list(_lobbies.values())
