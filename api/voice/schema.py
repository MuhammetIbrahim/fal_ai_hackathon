from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str = Field(..., description="Sese cevrilecek metin")
    voice: str = Field("alloy", description="Ses ID (alloy, zeynep, ali)")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Konusma hizi")
    response_format: str = Field("mp3", description="Cikti formati (mp3)")


class STTRequest(BaseModel):
    audio_url: str | None = Field(None, description="Public audio URL")
    audio_base64: str | None = Field(None, description="Base64-encoded audio")


class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    preview_url: str | None = None


class VoiceListResponse(BaseModel):
    voices: list[VoiceInfo]


class TTSSyncResponse(BaseModel):
    audio_url: str
    inference_time_ms: float | None = None
    audio_duration_sec: float | None = None


class TTSStreamRequest(BaseModel):
    text: str = Field(..., description="Sese cevrilecek metin")
    voice: str = Field("alloy", description="Ses ID (alloy, zeynep, ali)")
    speed: float = Field(1.0, ge=0.5, le=2.0, description="Konusma hizi")
