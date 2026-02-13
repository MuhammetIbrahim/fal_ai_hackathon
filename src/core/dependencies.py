from src.core.config import get_settings


def init_fal():
    """Character AI API client'i configure et. App startup'ta cagirilir."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

    from src.services.api_client import configure
    settings = get_settings()
    configure(
        api_url=settings.CHARACTER_API_URL,
        api_key=settings.CHARACTER_API_KEY,
    )
