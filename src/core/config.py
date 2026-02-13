from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # ═══════════════════════════════════════════════════
    # FAL AI Configuration
    # ═══════════════════════════════════════════════════
    FAL_KEY: str = ""

    # ═══════════════════════════════════════════════════
    # Character AI API (B2B API — port 9000)
    # ═══════════════════════════════════════════════════
    CHARACTER_API_URL: str = "http://localhost:9000"
    CHARACTER_API_KEY: str = "demo-key-123"
    
    # ═══════════════════════════════════════════════════
    # Database Configuration
    # ═══════════════════════════════════════════════════
    REDIS_URL: str = "redis://localhost:6379"
    USE_IN_MEMORY_DB: bool = True  # Hackathon için in-memory, production için False
    
    # ═══════════════════════════════════════════════════
    # FastAPI Application Settings
    # ═══════════════════════════════════════════════════
    APP_NAME: str = "AI vs İnsan: Ocak Yemini"
    VERSION: str = "0.1.0"
    ENV: str = "development"  # "development" | "production"
    DEBUG: bool = True
    
    # ═══════════════════════════════════════════════════
    # Server Configuration
    # ═══════════════════════════════════════════════════
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # ═══════════════════════════════════════════════════
    # Game Rules & Limits
    # ═══════════════════════════════════════════════════
    MAX_LOBBIES: int = 100
    MAX_PLAYERS_PER_LOBBY: int = 10
    DEFAULT_PLAYER_COUNT: int = 6
    DEFAULT_AI_COUNT: int = 4
    DEFAULT_DAY_LIMIT: int = 5
    
    # ═══════════════════════════════════════════════════
    # WebSocket Configuration
    # ═══════════════════════════════════════════════════
    WS_HEARTBEAT_INTERVAL: int = 30  # saniye
    WS_MESSAGE_MAX_SIZE: int = 10000  # bytes
    
    # ═══════════════════════════════════════════════════
    # CORS Configuration
    # ═══════════════════════════════════════════════════
    CORS_ORIGINS: list[str] = ["*"]  # Hackathon için tümüne açık
    CORS_CREDENTIALS: bool = True
    CORS_METHODS: list[str] = ["*"]
    CORS_HEADERS: list[str] = ["*"]

    class Config:
        env_file = ".env"


_settings: Settings | None = None


def get_settings() -> Settings:
    """
    Singleton pattern ile Settings instance'ı döner.
    
    FastAPI'de Dependency Injection ile kullanılır:
    
    @app.get("/info")
    def info(settings: Settings = Depends(get_settings)):
        return {"env": settings.ENV}
    """
    global _settings
    if not _settings:
        _settings = Settings()
    return _settings
