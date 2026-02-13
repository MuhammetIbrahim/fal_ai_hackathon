from pydantic import BaseModel, Field


class LLMGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Kullanici prompt'u / ana icerik")
    system_prompt: str = Field("", description="System instruction")
    model: str = Field("gemini-2.5-flash", description="Model adi")
    temperature: float = Field(0.8, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, description="Maksimum output token sayisi")
    reasoning: bool | None = Field(None, description="Extended thinking aktif mi")


class LLMGenerateResponse(BaseModel):
    output: str


class LLMStreamRequest(BaseModel):
    prompt: str = Field(..., description="Kullanici prompt'u / ana icerik")
    system_prompt: str = Field("", description="System instruction")
    model: str = Field("gemini-2.5-flash", description="Model adi")
    temperature: float = Field(0.8, ge=0.0, le=2.0)
    max_tokens: int | None = Field(None, description="Maksimum output token sayisi")
