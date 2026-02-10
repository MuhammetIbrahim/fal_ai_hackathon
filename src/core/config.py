from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    FAL_KEY: str = ""
    REDIS_URL: str = "redis://localhost:6379"
    ENV: str = "development"

    class Config:
        env_file = ".env"


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if not _settings:
        _settings = Settings()
    return _settings
