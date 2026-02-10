"""
main.py — FastAPI Application Factory
======================================
AI vs İnsan: Ocak Yemini Backend API

Bu dosya FastAPI uygulamasını oluşturur ve yapılandırır.
Factory pattern kullanarak test'lerde farklı konfigürasyonlar test edilebilir.

Kullanım:
    # Development mode (hot-reload ile)
    uvicorn src.main:app --reload
    
    # Veya direkt python ile
    python src/main.py
    
    # Production mode
    uvicorn src.main:app --host 0.0.0.0 --port 8000 --workers 4
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import time

from src.core.config import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.
    startup ve shutdown event'lerini yönetir.
    """
    # ═══════════════════════════════════════════════════
    # STARTUP
    # ═══════════════════════════════════════════════════
    settings = get_settings()
    print(f"🚀 Starting {settings.APP_NAME} v{settings.VERSION}")
    print(f"📍 Environment: {settings.ENV}")
    print(f"🗄️  Database Mode: {'In-Memory' if settings.USE_IN_MEMORY_DB else 'Redis'}")
    
    # FAL AI servisini başlat (gerekirse)
    if settings.FAL_KEY:
        print("✅ FAL_KEY configured")
    else:
        print("⚠️  FAL_KEY not set - AI features will be limited")
    
    # In-memory DB'yi başlat
    if settings.USE_IN_MEMORY_DB:
        from src.core.database import init_memory_db
        init_memory_db()
        print("✅ In-memory database initialized")
    
    yield
    
    # ═══════════════════════════════════════════════════
    # SHUTDOWN
    # ═══════════════════════════════════════════════════
    print("👋 Shutting down gracefully...")


def create_app() -> FastAPI:
    """
    FastAPI application factory.
    
    Returns:
        FastAPI: Yapılandırılmış FastAPI instance
    """
    settings = get_settings()
    
    # ═══════════════════════════════════════════════════
    # FastAPI App Oluştur
    # ═══════════════════════════════════════════════════
    app = FastAPI(
        title=settings.APP_NAME,
        version=settings.VERSION,
        description="AI vs İnsan: Ocak Yemini — Sesli AI Hackathon 2026",
        debug=settings.DEBUG,
        lifespan=lifespan,
        docs_url="/docs" if settings.DEBUG else None,  # Production'da docs kapalı
        redoc_url="/redoc" if settings.DEBUG else None,
    )
    
    # ═══════════════════════════════════════════════════
    # CORS Middleware (Frontend için gerekli)
    # ═══════════════════════════════════════════════════
    """
    CORS (Cross-Origin Resource Sharing):
    Frontend farklı bir port'ta çalışırsa (örn: React dev server 3000'de),
    API'ye istek atabilmesi için CORS header'ları gerekir.
    
    Hackathon için tüm origin'lere açık, production'da güvenlik için
    sadece frontend domain'i eklenmelidir.
    """
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=settings.CORS_CREDENTIALS,
        allow_methods=settings.CORS_METHODS,
        allow_headers=settings.CORS_HEADERS,
    )
    
    # ═══════════════════════════════════════════════════
    # Request Timing Middleware (Debug için)
    # ═══════════════════════════════════════════════════
    @app.middleware("http")
    async def add_process_time_header(request: Request, call_next):
        """Her request'in süresini header'a ekler."""
        start_time = time.time()
        response = await call_next(request)
        process_time = time.time() - start_time
        response.headers["X-Process-Time"] = f"{process_time:.4f}s"
        return response
    
    # ═══════════════════════════════════════════════════
    # Global Exception Handler
    # ═══════════════════════════════════════════════════
    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Tüm yakalanmamış exception'ları handle eder."""
        if settings.DEBUG:
            # Development'ta detaylı hata göster
            import traceback
            return JSONResponse(
                status_code=500,
                content={
                    "error": "Internal Server Error",
                    "detail": str(exc),
                    "traceback": traceback.format_exc(),
                }
            )
        else:
            # Production'da genel mesaj
            return JSONResponse(
                status_code=500,
                content={"error": "Internal Server Error"}
            )
    
    # ═══════════════════════════════════════════════════
    # Health Check Endpoint
    # ═══════════════════════════════════════════════════
    @app.get("/health", tags=["system"])
    def health_check():
        """
        Sistem sağlık kontrolü.
        Load balancer ve monitoring araçları için.
        """
        return {
            "status": "ok",
            "app": settings.APP_NAME,
            "version": settings.VERSION,
            "environment": settings.ENV,
            "db_mode": "in-memory" if settings.USE_IN_MEMORY_DB else "redis",
        }
    
    @app.get("/", tags=["system"])
    def root():
        """Ana endpoint - API bilgisi döner."""
        return {
            "message": "AI vs İnsan: Ocak Yemini API",
            "version": settings.VERSION,
            "docs": "/docs" if settings.DEBUG else "disabled",
        }
    
    # ═══════════════════════════════════════════════════
    # Router'ları Dahil Et
    # ═══════════════════════════════════════════════════
    from src.apps.game.router import router as game_router
    
    app.include_router(game_router)
    
    # İleride eklenecekler:
    # from src.apps.lobby.router import router as lobby_router
    # from src.apps.ws.router import router as ws_router
    # app.include_router(lobby_router)
    # app.include_router(ws_router)
    
    return app


# ═══════════════════════════════════════════════════
# Application Instance (uvicorn için)
# ═══════════════════════════════════════════════════
app = create_app()


# ═══════════════════════════════════════════════════
# CLI Entry Point (python src/main.py)
# ═══════════════════════════════════════════════════
if __name__ == "__main__":
    import uvicorn
    settings = get_settings()
    
    print("=" * 60)
    print(f"🎮 {settings.APP_NAME}")
    print("=" * 60)
    print(f"📡 Starting server at http://{settings.HOST}:{settings.PORT}")
    print(f"📚 API Docs: http://{settings.HOST}:{settings.PORT}/docs")
    print("=" * 60)
    
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,  # Development'ta hot-reload aktif
        log_level="info" if settings.DEBUG else "warning",
    )
