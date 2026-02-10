from src.core.config import get_settings


def init_fal():
    """FAL_KEY'i configure et. App startup'ta cagirilir."""
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

    from fal_services import configure
    settings = get_settings()
    if settings.FAL_KEY:
        configure(settings.FAL_KEY)
