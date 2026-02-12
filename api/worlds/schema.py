from pydantic import BaseModel, Field


class CreateWorldRequest(BaseModel):
    name: str | None = Field(None, description="Evren adi (orn: Karanlik Orman, Neon Colu)")
    description: str | None = Field(None, description="Evren ozeti / lore")
    tone: str | None = Field(None, description="Atmosfer (orn: karanlik fantazi, bilim kurgu, komedi)")
    setting: dict | None = Field(None, description="Serbest yapi — yerler, mevsim, atmosfer, harita")
    rules: dict | None = Field(None, description="Konusma kurallari, ritueller, sinirlamalar")
    taboo_words: list[str] | None = Field(None, description="Karakterlerin kullanmamasi gereken kelimeler")
    metadata: dict | None = Field(None, description="Serbest ek veri (studyo bilgisi, proje adi vb.)")


class WorldResponse(BaseModel):
    id: str
    name: str | None = None
    description: str | None = None
    tone: str | None = None
    setting: dict | None = None
    rules: dict | None = None
    taboo_words: list[str] | None = None
    metadata: dict | None = None
    created_at: str
