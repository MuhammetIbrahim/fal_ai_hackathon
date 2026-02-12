from pydantic import BaseModel, Field


class AvatarRequest(BaseModel):
    description: str = Field(..., description="Karakter fiziksel tanimi")
    style: str = Field("pixel_art", description="pixel_art | realistic | anime | painterly")
    custom_style_prompt: str | None = Field(None, description="Serbest stil prompt override")
    world_tone: str = Field("fantazi", description="Dunya atmosferi")
    width: int = Field(512, ge=256, le=1024)
    height: int = Field(512, ge=256, le=1024)
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0)
    num_inference_steps: int = Field(28, ge=10, le=50)
    seed: int | None = Field(None, description="Deterministik uretim icin seed")
    negative_prompt: str | None = Field(None, description="Istenmeyen ogeler")
    model: str = Field("dev", description="dev | schnell | pro")


class BackgroundRequest(BaseModel):
    prompt: str = Field(..., description="Sahne aciklamasi")
    style: str = Field("pixel_art", description="pixel_art | realistic | anime | painterly")
    custom_style_prompt: str | None = Field(None, description="Serbest stil prompt override")
    width: int = Field(1344, ge=512, le=2048)
    height: int = Field(768, ge=512, le=2048)
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0)
    num_inference_steps: int = Field(28, ge=10, le=50)
    seed: int | None = Field(None, description="Deterministik uretim icin seed")
    negative_prompt: str | None = Field(None, description="Istenmeyen ogeler")
    model: str = Field("dev", description="dev | schnell | pro")
