"""Character AI API — FastAPI Application Factory."""

from contextlib import asynccontextmanager
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from api.config import get_api_settings
from api.errors import register_error_handlers
from api.jobs import jobs_router, job_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_api_settings()
    print(f"Starting {settings.APP_NAME} v{settings.VERSION}")

    if settings.FAL_KEY:
        import fal_client, os
        os.environ["FAL_KEY"] = settings.FAL_KEY
        print("FAL_KEY configured")

    yield

    cleaned = job_manager.cleanup_old(settings.JOB_TTL_HOURS)
    print(f"Shutdown — cleaned {cleaned} expired jobs")


def create_app() -> FastAPI:
    settings = get_api_settings()

    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.VERSION,
        description="Game-agnostic Character AI API — TTS, STT, LLM dialogue, avatar generation",
        debug=settings.DEBUG,
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Timing middleware
    class TimingMiddleware:
        def __init__(self, app: ASGIApp):
            self.app = app

        async def __call__(self, scope: Scope, receive: Receive, send: Send):
            if scope["type"] != "http":
                await self.app(scope, receive, send)
                return
            start = time.time()

            async def send_with_timing(message):
                if message["type"] == "http.response.start":
                    raw_headers = list(message.get("headers", []))
                    raw_headers.append((b"x-process-time", f"{time.time() - start:.4f}s".encode()))
                    message["headers"] = raw_headers
                await send(message)

            await self.app(scope, receive, send_with_timing)

    app.add_middleware(TimingMiddleware)

    # Error handlers
    register_error_handlers(app)

    # System endpoints
    @app.get("/health", tags=["system"])
    def health():
        return {"status": "ok", "app": settings.APP_NAME, "version": settings.VERSION}

    @app.get("/", tags=["system"])
    def root():
        return {
            "name": settings.APP_NAME,
            "version": settings.VERSION,
            "docs": "/docs",
        }

    # Domain routers
    from api.worlds.router import router as worlds_router
    from api.characters.router import router as characters_router
    from api.voice.router import router as voice_router
    from api.images.router import router as images_router
    from api.conversations.router import router as conversations_router

    app.include_router(worlds_router)
    app.include_router(characters_router)
    app.include_router(voice_router)
    app.include_router(images_router)
    app.include_router(conversations_router)
    app.include_router(jobs_router)

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = get_api_settings()
    uvicorn.run("api.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
