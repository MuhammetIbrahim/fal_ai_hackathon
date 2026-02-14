"""
schema.py — Lobby Request/Response Models
==========================================
Lobi oluşturma, katılma endpoint'leri için Pydantic modeller.
"""

from pydantic import BaseModel, Field
from typing import List


# ═══════════════════════════════════════════════════
# REQUEST MODELS
# ═══════════════════════════════════════════════════

class LobbyCreateRequest(BaseModel):
    """
    Yeni lobi oluşturma isteği.
    """
    host_name: str = Field(..., min_length=1, max_length=30, description="Lobi sahibinin adı")
    max_players: int = Field(default=6, ge=3, le=10, description="Maksimum oyuncu sayısı")
    ai_count: int = Field(default=4, ge=0, le=9, description="AI oyuncu sayısı (kalan slotlar AI ile doldurulur)")
    day_limit: int = Field(default=5, ge=3, le=10, description="Maksimum gün sayısı")
    
    class Config:
        json_schema_extra = {
            "example": {
                "host_name": "Efe",
                "max_players": 6,
                "ai_count": 4,
                "day_limit": 5,
            }
        }


class JoinRequest(BaseModel):
    """
    Lobiye katılma isteği.
    """
    player_name: str = Field(..., min_length=2, max_length=30, description="Oyuncu adı")
    
    class Config:
        json_schema_extra = {
            "example": {
                "player_name": "Ahmet",
            }
        }


# ═══════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════

class LobbyPlayer(BaseModel):
    """
    Lobideki bir oyuncu.
    """
    slot_id: str = Field(..., description="Oyuncu slot ID (P0, P1, ...)")
    name: str = Field(..., description="Oyuncu adı")
    is_host: bool = Field(..., description="Lobi sahibi mi?")
    is_human: bool = Field(..., description="İnsan oyuncu mu? (False ise AI)")
    ready: bool = Field(..., description="Hazır mı?")


class LobbyResponse(BaseModel):
    """
    Lobi durumu.
    """
    lobby_code: str = Field(..., description="6 haneli lobi kodu (ABC123)")
    host: str = Field(..., description="Lobi sahibinin adı")
    players: List[LobbyPlayer] = Field(..., description="Lobideki oyuncular")
    max_players: int = Field(..., description="Maksimum oyuncu sayısı")
    ai_count: int = Field(..., description="AI oyuncu sayısı")
    day_limit: int = Field(..., description="Maksimum gün sayısı")
    status: str = Field(..., description="Lobi durumu: waiting | starting | in_game")
    game_id: str | None = Field(None, description="Oyun başladıysa game_id")
    
    class Config:
        json_schema_extra = {
            "example": {
                "lobby_code": "ABC123",
                "host": "Efe",
                "players": [
                    {"slot_id": "P0", "name": "Efe", "is_host": True, "is_human": True, "ready": True},
                    {"slot_id": "P1", "name": "Ahmet", "is_host": False, "is_human": True, "ready": False},
                ],
                "max_players": 6,
                "ai_count": 4,
                "day_limit": 5,
                "status": "waiting",
                "game_id": None,
            }
        }


class JoinResponse(BaseModel):
    """
    Lobiye katılma sonucu.
    """
    slot_id: str = Field(..., description="Atanan slot ID")
    lobby_code: str = Field(..., description="Lobi kodu")
    player_name: str = Field(..., description="Oyuncu adı")
    
    class Config:
        json_schema_extra = {
            "example": {
                "slot_id": "P1",
                "lobby_code": "ABC123",
                "player_name": "Ahmet",
            }
        }


class LobbyStartResponse(BaseModel):
    """
    Lobi başlatma sonucu.
    """
    game_id: str = Field(..., description="Oluşturulan oyun ID'si")
    lobby_code: str = Field(..., description="Lobi kodu")
    message: str = Field(..., description="Başarı mesajı")
    
    class Config:
        json_schema_extra = {
            "example": {
                "game_id": "550e8400-e29b-41d4-a716-446655440000",
                "lobby_code": "ABC123",
                "message": "Game started! All players will be notified via WebSocket.",
            }
        }
