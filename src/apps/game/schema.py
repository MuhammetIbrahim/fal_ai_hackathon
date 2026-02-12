"""
schema.py — Pydantic Request/Response Models
=============================================
API endpoint'lerinin veri modellerini tanımlar.

NEDEN PYDANTIC?
---------------
✅ Otomatik validation (tip kontrolü, değer aralığı)
✅ Otomatik JSON parse
✅ Otomatik API dokümantasyonu (/docs)
✅ IDE autocomplete desteği

KULLANIM:
---------
    @router.post("/", response_model=GameCreateResponse)
    async def endpoint(request: GameCreateRequest):
        # request otomatik parse edilir
        # response otomatik serialize edilir
"""

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════
# REQUEST MODELS — Client'tan gelen veri
# ═══════════════════════════════════════════════════

class GameCreateRequest(BaseModel):
    """
    Oyun oluşturma isteği.
    
    Example:
        {
            "player_count": 6,
            "ai_count": 4,
            "day_limit": 5
        }
    """
    game_id: str | None = Field(
        default=None,
        description="Özel oyun ID'si. None ise otomatik UUID üretilir."
    )
    player_count: int = Field(
        default=6,
        ge=3,
        le=10,
        description="Toplam oyuncu sayısı (AI + İnsan)"
    )
    ai_count: int = Field(
        default=4,
        ge=1,
        description="AI oyuncu sayısı"
    )
    day_limit: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Maximum gün limiti"
    )


# ═══════════════════════════════════════════════════
# RESPONSE MODELS — Client'a dönen veri
# ═══════════════════════════════════════════════════

class GameCreateResponse(BaseModel):
    """
    Oyun oluşturma yanıtı.
    
    Oyun "waiting" statusunda döner.
    Henüz karakterler oluşturulmamıştır.
    """
    game_id: str = Field(description="Oyun ID'si")
    world_brief: str = Field(description="Dünya özeti (köy adı, mevsim vb.)")
    settlement_name: str = Field(description="Köy adı")
    status: str = Field(description="Oyun durumu: waiting | running | finished")
    config: dict = Field(description="Oyun konfigürasyonu")


class PlayerPublic(BaseModel):
    """
    Oyuncu bilgisi (public — gizli bilgi yok).
    
    AI mi insan mı bilgisi GİZLİ (oyun sırasında belli olmamalı).
    """
    slot_id: str = Field(description="P0, P1, P2...")
    name: str = Field(description="Karakter adı")
    role_title: str = Field(description="Karakter rolü (Demirci, Avcı vb.)")
    alive: bool = Field(description="Hayatta mı?")
    avatar_url: str | None = Field(default=None, description="FLUX-generated portrait URL")


class GameStateResponse(BaseModel):
    """
    Oyun durumu yanıtı.
    
    Frontend'e oyunun anlık durumunu gösterir.
    """
    game_id: str
    status: str = Field(description="waiting | running | finished")
    phase: str | None = Field(default=None, description="morning | campfire | vote vb.")
    round_number: int | None = Field(default=None, description="Kaçıncı gün")
    day_limit: int | None = Field(default=None, description="Max gün sayısı")
    players: list[PlayerPublic] | None = Field(default=None, description="Oyuncular")
    world_brief: str | None = Field(default=None, description="Dünya özeti")


class GameStartResponse(BaseModel):
    """Oyun başlatma yanıtı."""
    game_id: str
    status: str
    message: str = Field(description="İşlem mesajı")


class RoundLog(BaseModel):
    """Bir round'un log'u."""
    round: int
    campfire_history: list[dict]
    house_visits: list[dict]
    votes: dict[str, str]
    exiled: str | None
    exiled_type: str | None


class GameLogResponse(BaseModel):
    """
    Oyun log'u yanıtı — bitmiş oyunun tüm detayları.
    
    Replay ve analiz için kullanılır.
    """
    game_id: str
    winner: str | None = Field(description="Kazanan taraf: et_can | yanki_dogmus")
    total_rounds: int = Field(description="Toplam round sayısı")
    rounds: list[RoundLog] = Field(description="Her round'un detaylı logu")
    world_seed: dict | None = Field(default=None, description="Dünya seed'i")
    players_initial: list[dict] | None = Field(default=None, description="Başlangıçtaki oyuncular")
