"""
schema.py — WebSocket Event Schemas
====================================
WebSocket üzerinden gönderilen mesaj tiplerini tanımlar.

EVENT TİPLERİ:
--------------
Server → Client: Sunucudan oyunculara
Client → Server: Oyunculardan sunucuya

MESAJ FORMATI:
--------------
{
    "event": "event_name",
    "data": {...}
}
"""

from pydantic import BaseModel, Field
from typing import Optional, Any


# ═══════════════════════════════════════════════════
# SERVER → CLIENT EVENTS (Sunucudan Oyunculara)
# ═══════════════════════════════════════════════════

class ServerEvent(BaseModel):
    """
    Sunucudan gelen genel event yapısı.
    
    Tüm server event'leri bu formatı kullanır.
    """
    event: str = Field(description="Event tipi")
    data: dict = Field(description="Event verisi")


class PlayerConnectedEvent(BaseModel):
    """Oyuncu bağlandı bildirimi."""
    event: str = "player_connected"
    data: dict = Field(description="""
    {
        "player_id": "P0",
        "active_players": ["P0", "P1", "P2"]
    }
    """)


class PlayerDisconnectedEvent(BaseModel):
    """Oyuncu ayrıldı bildirimi."""
    event: str = "player_disconnected"
    data: dict = Field(description="""
    {
        "player_id": "P1",
        "active_players": ["P0", "P2"]
    }
    """)


class GamePhaseChangeEvent(BaseModel):
    """
    Oyun fazı değişti.
    
    Use Case: morning → campfire → vote
    """
    event: str = "phase_change"
    data: dict = Field(description="""
    {
        "phase": "campfire",
        "round": 2
    }
    """)


class CampfireSpeechEvent(BaseModel):
    """
    Campfire konuşması (tüm oyuncular duyar).
    
    Use Case: AI veya insan oyuncu konuştuğunda
    """
    event: str = "campfire_speech"
    data: dict = Field(description="""
    {
        "speaker": "Fenris",
        "role_title": "Demirci",
        "content": "Ben dün gece bir şey gördüm..."
    }
    """)


class VotePhaseEvent(BaseModel):
    """
    Oylama fazı başladı.
    
    Use Case: Oyuncular oy verecek
    """
    event: str = "vote_phase"
    data: dict = Field(description="""
    {
        "alive_names": ["Fenris", "Nyx", "Kael"]
    }
    """)


class VoteResultEvent(BaseModel):
    """
    Oylama sonucu.
    
    Use Case: Oyun sürülen oyuncuyu duyurur
    """
    event: str = "vote_result"
    data: dict = Field(description="""
    {
        "exiled": "Fenris",
        "exiled_type": "yanki_dogmus",
        "votes": {"Fenris": 3, "Nyx": 2}
    }
    """)


class GameOverEvent(BaseModel):
    """
    Oyun bitti.
    
    Use Case: Kazanan taraf belirlendi
    """
    event: str = "game_over"
    data: dict = Field(description="""
    {
        "winner": "et_can",
        "final_alive": ["Nyx", "Kael"],
        "total_rounds": 5
    }
    """)


class YourTurnEvent(BaseModel):
    """
    Senin sıran (insan oyuncu için).
    
    Use Case: Insan oyuncuya "şimdi konuş" bildirimi
    """
    event: str = "your_turn"
    data: dict = Field(description="""
    {
        "action": "speak",
        "timeout": 30
    }
    """)


# ═══════════════════════════════════════════════════
# CLIENT → SERVER EVENTS (Oyunculardan Sunucuya)
# ═══════════════════════════════════════════════════

class ClientEvent(BaseModel):
    """
    Oyuncudan gelen genel event yapısı.
    """
    event: str = Field(description="Event tipi")
    data: Optional[dict] = Field(default=None, description="Event verisi")


class SpeakEvent(BaseModel):
    """
    İnsan oyuncu konuşma.
    
    Use Case: Campfire'da insan oyuncu konuştuğunda
    """
    event: str = "speak"
    data: dict = Field(description="""
    {
        "content": "Ben dün gece bir şey duydum..."
    }
    """)


class VoteEvent(BaseModel):
    """
    Oylama.
    
    Use Case: İnsan oyuncu oy verdiğinde
    """
    event: str = "vote"
    data: dict = Field(description="""
    {
        "target": "Fenris"
    }
    """)


class VisitRequestEvent(BaseModel):
    """
    Ev ziyareti isteği.
    
    Use Case: İnsan oyuncu ziyaret etmek istediğinde
    """
    event: str = "visit_request"
    data: dict = Field(description="""
    {
        "target": "Nyx"
    }
    """)


class VisitSpeakEvent(BaseModel):
    """
    Ev ziyaretinde konuşma.
    
    Use Case: 1v1 konuşmada insan oyuncu konuştuğunda
    """
    event: str = "visit_speak"
    data: dict = Field(description="""
    {
        "content": "Sana bir şey sormak istiyorum..."
    }
    """)


class HeartbeatEvent(BaseModel):
    """
    Kalp atışı (bağlantı kontrolü).
    
    Use Case: Client her 30 saniyede bir gönderir
    """
    event: str = "heartbeat"
    data: Optional[dict] = None


# ═══════════════════════════════════════════════════
# ERROR EVENTS
# ═══════════════════════════════════════════════════

class ErrorEvent(BaseModel):
    """
    Hata mesajı.
    
    Use Case: Geçersiz event, timeout, vb.
    """
    event: str = "error"
    data: dict = Field(description="""
    {
        "code": "invalid_event",
        "message": "Unknown event type"
    }
    """)


# ═══════════════════════════════════════════════════
# EVENT TYPE MAPPING
# ═══════════════════════════════════════════════════

# Server event'lerinin mapping'i (gelecekte kullanılabilir)
SERVER_EVENTS = {
    "player_connected": PlayerConnectedEvent,
    "player_disconnected": PlayerDisconnectedEvent,
    "phase_change": GamePhaseChangeEvent,
    "campfire_speech": CampfireSpeechEvent,
    "vote_phase": VotePhaseEvent,
    "vote_result": VoteResultEvent,
    "game_over": GameOverEvent,
    "your_turn": YourTurnEvent,
    "error": ErrorEvent,
}

# Client event'lerinin mapping'i
CLIENT_EVENTS = {
    "speak": SpeakEvent,
    "vote": VoteEvent,
    "visit_request": VisitRequestEvent,
    "visit_speak": VisitSpeakEvent,
    "heartbeat": HeartbeatEvent,
}
