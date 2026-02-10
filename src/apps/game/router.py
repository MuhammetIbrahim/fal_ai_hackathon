"""
router.py — Game REST API Endpoints
====================================
Oyun yönetimi için HTTP endpoint'leri.

ENDPOINT'LER:
-------------
POST   /api/game/          → Yeni oyun oluştur
GET    /api/game/{id}      → Oyun durumunu getir
POST   /api/game/{id}/start → Oyunu başlat (karakterleri üret)

FASTAPI ROUTER:
---------------
Router, endpoint'leri gruplandırır ve organize eder.
main.py'de app.include_router() ile dahil edilir.

DEPENDENCY INJECTION:
---------------------
game_engine fonksiyonları direkt kullanılır.
İleride WebSocket manager eklenince buraya inject edilecek.
"""

from fastapi import APIRouter, HTTPException, status

from src.apps.game.schema import (
    GameCreateRequest,
    GameCreateResponse,
    GameStateResponse,
    GameStartResponse,
    GameLogResponse,
)
from src.core.game_loop import start_game_loop, is_game_running
from src.core.game_engine import (
    create_new_game,
    get_public_game_info,
    start_game,
)


# ═══════════════════════════════════════════════════
# ROUTER SETUP
# ═══════════════════════════════════════════════════

router = APIRouter(
    prefix="/api/game",
    tags=["game"],
    responses={
        404: {"description": "Game not found"},
        400: {"description": "Bad request"},
    },
)


# ═══════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════

@router.post(
    "/",
    response_model=GameCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Yeni oyun oluştur",
    description="""
    Yeni bir oyun oluşturur ve world seed üretir.
    
    Oyun "waiting" statusunda döner — henüz karakterler oluşturulmamıştır.
    Karakterleri üretmek için POST /game/{id}/start endpoint'ini kullanın.
    
    **Not:** game_id belirtilmezse otomatik UUID üretilir.
    """,
)
async def create_game_endpoint(request: GameCreateRequest):
    """
    Yeni oyun oluştur.
    
    Args:
        request: Oyun konfigürasyonu
        
    Returns:
        GameCreateResponse: Oyun bilgisi ve world seed
        
    Raises:
        HTTPException 400: Geçersiz parametreler
        HTTPException 409: game_id zaten mevcut
    """
    try:
        game_data = await create_new_game(
            game_id=request.game_id,
            player_count=request.player_count,
            ai_count=request.ai_count,
            day_limit=request.day_limit,
        )
        
        # Response oluştur
        world_seed = game_data["world_seed"]
        return GameCreateResponse(
            game_id=game_data["game_id"],
            world_brief=(
                f"{world_seed['place_variants']['settlement_name']} köyü, "
                f"{world_seed['season']} mevsimi. {world_seed['myth_variant']['rumor']}"
            ),
            settlement_name=world_seed["place_variants"]["settlement_name"],
            status=game_data["status"],
            config=game_data["config"],
        )
        
    except ValueError as e:
        # Validation hatası
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )
    except Exception as e:
        # Beklenmeyen hata
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Oyun oluşturulurken hata: {str(e)}",
        )


@router.get(
    "/{game_id}",
    response_model=GameStateResponse,
    summary="Oyun durumunu getir",
    description="""
    Oyunun anlık durumunu getirir.
    
    Gizli bilgiler filtrelenir:
    - AI acting prompt'ları görünmez
    - Oyuncu tipleri (AI/İnsan) gizlidir
    
    Frontend bu endpoint'i kullanarak oyun durumunu gösterir.
    """,
)
async def get_game_endpoint(game_id: str):
    """
    Oyun durumunu getir.
    
    Args:
        game_id: Oyun ID'si
        
    Returns:
        GameStateResponse: Oyun durumu (public bilgiler)
        
    Raises:
        HTTPException 404: Oyun bulunamadı
    """
    game_info = await get_public_game_info(game_id)
    
    if not game_info:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game {game_id} not found",
        )
    
    return GameStateResponse(**game_info)


@router.post(
    "/{game_id}/start",
    response_model=GameStartResponse,
    summary="Oyunu başlat",
    description="""
    Oyunu başlatır — karakterleri üretir ve state'i initialize eder.
    
    ⚠️ **UYARI:** Bu işlem LLM çağrıları yapar (acting prompt'ları için).
    FAL_KEY environment variable'ı set olmalıdır.
    
    İşlem ~30-60 saniye sürebilir.
    
    Oyun "waiting" → "running" durumuna geçer.
    """,
)
async def start_game_endpoint(game_id: str):
    """
    Oyunu başlat.
    
    Args:
        game_id: Başlatılacak oyunun ID'si
        
    Returns:
        GameStartResponse: İşlem durumu
        
    Raises:
        HTTPException 404: Oyun bulunamadı
        HTTPException 400: Oyun zaten başlamış veya geçersiz durum
        HTTPException 500: LLM çağrısı başarısız
    """
    try:
        result = await start_game(game_id)
        
        # ═══ GAME LOOP BAŞLAT (Background Task) ═══
        if not is_game_running(game_id) and result.get("state"):
            start_game_loop(game_id, result["state"])
        
        return GameStartResponse(
            game_id=result["game_id"],
            status=result["status"],
            message=f"Oyun başlatıldı. {len(result['players'])} karakter oluşturuldu. Game loop çalışıyor.",
        )
        
    except ValueError as e:
        # Oyun bulunamadı veya zaten başlamış
        if "not found" in str(e):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(e),
            )
    except Exception as e:
        # LLM hatası vs.
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Oyun başlatılırken hata: {str(e)}",
        )


@router.get(
    "/{game_id}/log",
    response_model=GameLogResponse,
    summary="Oyun log'unu getir",
    description="""
    Bitmiş bir oyunun detaylı log'unu getirir.
    
    Round-by-round tüm konuşmalar, ziyaretler, oylamalar ve sürgünler.
    Replay ve analiz için kullanılır.
    
    **Not:** Sadece bitmiş (finished) oyunlar için kullanılabilir.
    """,
)
async def get_game_log_endpoint(game_id: str):
    """
    Oyun log'unu getir.
    
    Args:
        game_id: Oyun ID'si
        
    Returns:
        GameLogResponse: Detaylı oyun logu
        
    Raises:
        HTTPException 404: Log bulunamadı
    """
    from src.core.database import db, GAME_LOGS
    
    log_data = db.get(GAME_LOGS, game_id)
    
    if not log_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Game log not found: {game_id}",
        )
    
    return GameLogResponse(**log_data)

