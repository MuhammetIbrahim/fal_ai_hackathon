"""
game_state.py — Oyun state tanımları
=====================================
Player class + LangGraph GameState TypedDict.
Tüm prototipler buna dayanır.
"""

from __future__ import annotations

from enum import Enum
from typing import TypedDict

from pydantic import BaseModel, Field
from langgraph.graph import MessagesState


# ── Enums ─────────────────────────────────────────────────

class Phase(str, Enum):
    MORNING = "morning"
    DAY = "day"
    HOUSES = "houses"
    CAMPFIRE = "campfire"
    VOTE = "vote"
    NIGHT = "night"
    GAME_OVER = "game_over"


class PlayerType(str, Enum):
    ET_CAN = "et_can"           # gerçek insan
    YANKI_DOGMUS = "yanki_dogmus"  # AI


# ── Player ────────────────────────────────────────────────

class Player(BaseModel):
    """Tek bir oyuncu / karakter."""
    model_config = {"arbitrary_types_allowed": True}

    slot_id: str                                        # P0, P1, P2...
    name: str
    role_title: str
    lore: str
    archetype: str                                      # SupheliSessiz, CekiciManipulator vs.
    archetype_label: str
    player_type: PlayerType
    acting_prompt: str                                  # LLM'e system prompt olarak verilecek
    skill_tier: str | None = None                       # Çaylak, Orta, Uzman (sadece Yankı-Doğmuş)
    skill_tier_label: str | None = None
    is_human: bool = False                              # terminal'den input alan gerçek oyuncu mu?
    alive: bool = True
    chat_history: list[dict] = Field(default_factory=list)
    vote_target: str | None = None                      # oylama sırasında kimi seçti

    @property
    def is_echo_born(self) -> bool:
        return self.player_type == PlayerType.YANKI_DOGMUS

    def add_message(self, role: str, content: str):
        """Konuşma geçmişine mesaj ekle."""
        self.chat_history.append({"role": role, "content": content})

    def __repr__(self):
        status = "alive" if self.alive else "dead"
        ptype = "YANKI" if self.is_echo_born else "ET-CAN"
        return f"<Player {self.name} ({self.role_title}) [{ptype}] {status}>"


# ── Game State (LangGraph) ───────────────────────────────

class GameState(TypedDict, total=False):
    """LangGraph state. Tüm oyun verisi burada akar."""
    messages: list                  # MessagesState uyumu — global konuşma logu
    players: list[Player]           # tüm oyuncular
    phase: str                      # Phase enum value
    round_number: int               # kaçıncı gün
    day_limit: int                  # max gün sayısı
    current_speaker: str | None     # şu an konuşan oyuncu adı
    campfire_history: list[dict]    # bu rounddaki campfire konuşmaları
    house_visits: list[dict]        # bu rounddaki ev ziyaretleri
    exiled_today: str | None        # bugün sürgün edilen
    winner: str | None              # "et_can" veya "yanki_dogmus" veya None


# ── Helper'lar ────────────────────────────────────────────

def get_alive_players(state: GameState) -> list[Player]:
    return [p for p in state["players"] if p.alive]


def get_alive_names(state: GameState) -> list[str]:
    return [p.name for p in state["players"] if p.alive]


def count_by_type(state: GameState) -> tuple[int, int]:
    """(et_can_count, yanki_count) döndür — sadece hayattakiler."""
    alive = get_alive_players(state)
    et = sum(1 for p in alive if p.player_type == PlayerType.ET_CAN)
    yanki = sum(1 for p in alive if p.player_type == PlayerType.YANKI_DOGMUS)
    return et, yanki


def check_win_condition(state: GameState) -> str | None:
    """Oyun bitti mi kontrol et. Bittiyse kazananı döndür."""
    et, yanki = count_by_type(state)

    # Tüm Yankı-Doğmuş sürgün edildi
    if yanki == 0:
        return "et_can"

    # Gün limiti doldu ve en az 1 Yankı-Doğmuş hayatta
    if state.get("round_number", 1) >= state.get("day_limit", 5):
        return "yanki_dogmus"

    # 2 veya daha az kişi kaldıysa ve hala yankı varsa → yankı kazanır
    alive = get_alive_players(state)
    if len(alive) <= 2 and yanki > 0:
        return "yanki_dogmus"

    return None


def find_player(state: GameState, name: str) -> Player | None:
    for p in state["players"]:
        if p.name == name:
            return p
    return None
