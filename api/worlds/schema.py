from pydantic import BaseModel, Field
from typing import Any


class CreateWorldRequest(BaseModel):
    # Mode 1: Auto-generate — game_id verilirse bizim havuzdan deterministik uret
    game_id: str | None = Field(None, description="Deterministik seed. Verilirse auto-generate calisir")

    # Mode 2: Custom world — consumer kendi evrenini JSON olarak supply eder
    name: str | None = Field(None, description="Evren adi (orn: Neon Wasteland)")
    description: str | None = Field(None, description="Evren ozeti / lore")
    tone: str | None = Field(None, description="Atmosfer (orn: dark fantasy, cyberpunk noir, comedy)")
    setting: dict | None = Field(None, description="Serbest yapi — yerler, mevsim, atmosfer, harita")
    rules: dict | None = Field(None, description="Konusma kurallari, ritueller, sinirlamalar")
    taboo_words: list[str] | None = Field(None, description="Karakterlerin kullanmamasi gereken kelimeler")
    metadata: dict | None = Field(None, description="Serbest ek veri (studio bilgisi, proje adi vb.)")


class WorldResponse(BaseModel):
    id: str
    # Auto-generate alanlari (game_id ile olusturulursa dolu)
    game_id: str | None = None
    world_seed: str | None = None
    tone: str | None = None
    season: str | None = None
    ocak_rengi: str | None = None
    ocak_rengi_mood: str | None = None
    mask_source: str | None = None
    council_style: str | None = None
    myth_variant: dict | None = None
    daily_omens: list[str] | None = None
    place_variants: dict | None = None
    rituals: dict | None = None
    mechanic_skin: dict | None = None
    taboo_words: list[str] | None = None
    world_brief: str | None = None
    scene_cards: dict[str, str] | None = None
    # Custom world alanlari
    name: str | None = None
    description: str | None = None
    setting: dict | None = None
    rules: dict | None = None
    metadata: dict | None = None
    # Common
    created_at: str
