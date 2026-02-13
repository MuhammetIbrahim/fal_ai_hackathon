from pydantic import BaseModel, Field


class CreateConversationRequest(BaseModel):
    character_ids: list[str] = Field(..., min_length=2, description="Katilimci karakter ID'leri (min 2)")
    world_id: str | None = Field(None, description="Dunya ID")
    topic: str | None = Field(None, description="Konusma konusu")
    max_turns: int = Field(20, ge=2, le=100, description="Maksimum tur sayisi")


class TurnRequest(BaseModel):
    user_message: str | None = Field(None, description="Opsiyonel kullanici mesaji (tetikleyici)")
    voice: str = Field("alloy", description="TTS ses ID (stream icin)")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="TTS hizi (stream icin)")


class InjectRequest(BaseModel):
    message: str = Field(..., description="Enjekte edilecek mesaj")
    sender_name: str = Field("Anlatici", description="Gonderen adi")


class ConversationMessage(BaseModel):
    role: str  # karakter | kullanici | anlatici | sistem
    character_id: str | None = None
    character_name: str | None = None
    content: str


class ReactionDetail(BaseModel):
    character_id: str
    character_name: str
    reaction: str
    wants_to_speak: bool


class TurnResponse(BaseModel):
    conversation_id: str
    turn_number: int
    speaker: ConversationMessage
    reactions: list[ReactionDetail]
    orchestrator_reason: str


class ConversationResponse(BaseModel):
    id: str
    character_ids: list[str]
    topic: str | None = None
    status: str  # active | ended
    turns: list[dict]
    created_at: str
    updated_at: str | None = None


class ConversationCreatedResponse(BaseModel):
    id: str
    character_ids: list[str]
    status: str
    created_at: str
