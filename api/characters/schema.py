from pydantic import BaseModel, Field


class CreateCharacterRequest(BaseModel):
    name: str | None = Field(None, description="Karakter adi")
    role: str | None = Field(None, description="Rol/meslek (orn: Kasap, Sifaci)")
    archetype: str | None = Field(None, description="Kisilik arketipi (orn: Supheci Sessiz, Saldirgan)")
    world_id: str | None = Field(None, description="Onceden olusturulan world ID")
    world_context: str | None = Field(None, description="Serbest metin dunya bilgisi")
    lore: str | None = Field(None, description="Karakter gecmisi")
    personality: str | None = Field(None, description="Kisilik ozellikleri")
    system_prompt: str | None = Field(None, description="Tam override — verilirse LLM uretimi atlanir")
    skill_tier: str | None = Field(None, description="caylak | orta | uzman")


class BatchCreateRequest(BaseModel):
    count: int = Field(..., ge=1, le=20)
    world_id: str | None = None
    world_context: str | None = None
    roles: list[str] | None = None
    archetypes: list[str] | None = None


class SpeakRequest(BaseModel):
    message: str = Field(..., description="Kullanicinin mesaji")
    context_messages: list[dict] | None = Field(None, description="Onceki konusma [{role, content}]")
    game_context: str | None = Field(None, description="Ek oyun durum bilgisi")
    mood: str | None = Field(None, description="Ruh hali override")
    system_prompt_override: str | None = Field(None, description="Gecici system prompt override")


class ReactRequest(BaseModel):
    message: str = Field(..., description="Tepki verilecek mesaj")
    context: str | None = Field(None, description="Ek baglam")


class UpdateCharacterRequest(BaseModel):
    name: str | None = None
    lore: str | None = None
    personality: str | None = None
    system_prompt: str | None = None


class CharacterResponse(BaseModel):
    id: str
    name: str
    role: str
    archetype: str
    lore: str | None = None
    personality: str | None = None
    acting_prompt: str
    skill_tier: str | None = None
    world_id: str | None = None
    created_at: str
    updated_at: str | None = None


class SpeechResponse(BaseModel):
    character_id: str
    character_name: str
    message: str
    mood: str | None = None
    moderation: dict | None = None


class ReactionResponse(BaseModel):
    character_id: str
    character_name: str
    reaction: str
    wants_to_speak: bool


class MemoryResponse(BaseModel):
    character_id: str
    exchanges: list[dict]
    total: int
