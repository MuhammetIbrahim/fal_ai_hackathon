from pydantic import Field
from pydantic_settings import BaseSettings


class APISettings(BaseSettings):
    # FAL AI
    FAL_KEY: str = Field("", alias="FAL_KEY")

    # Multi-tenancy: API key → tenant_id
    API_KEYS: dict[str, str] = {
        "demo-key-123": "tenant_demo",
        "test-key-456": "tenant_test",
    }

    # App
    APP_NAME: str = "Character AI API"
    VERSION: str = "0.1.0"
    DEBUG: bool = True
    HOST: str = "0.0.0.0"
    PORT: int = 9000
    CORS_ORIGINS: list[str] = ["*"]

    # LLM Model config
    GENERATION_MODEL: str = "google/gemini-2.5-pro"
    DIALOGUE_MODEL: str = "google/gemini-2.5-flash"
    VALIDATION_MODEL: str = "google/gemini-2.5-flash"

    # Orchestrator
    ORCHESTRATOR_MODEL: str = "google/gemini-2.5-flash"
    ORCHESTRATOR_TEMPERATURE: float = 0.3

    # Temperature config
    GENERATION_TEMPERATURE: float = 1.0
    DIALOGUE_TEMPERATURE: float = 0.9
    VALIDATION_TEMPERATURE: float = 0.0
    MODERATION_TEMPERATURE: float = 0.1

    # Job TTL
    JOB_TTL_HOURS: int = 24

    class Config:
        env_file = ".env"
        env_prefix = "API_"
        extra = "ignore"
        populate_by_name = True


_settings: APISettings | None = None


def get_api_settings() -> APISettings:
    global _settings
    if not _settings:
        _settings = APISettings()
    return _settings
