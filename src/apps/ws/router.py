"""
router.py — WebSocket Router
=============================
WebSocket bağlantılarını yöneten endpoint.

ENDPOINT:
---------
WS /ws/{game_id}/{player_id}

FLOW:
-----
1. Client bağlanır
2. ConnectionManager'a kayıt
3. Event loop (mesaj al/gönder)
4. Disconnect handling
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Optional

from src.apps.ws.service import manager
from src.apps.ws.schema import ClientEvent

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════
# ROUTER SETUP
# ═══════════════════════════════════════════════════

router = APIRouter(tags=["websocket"])


# ═══════════════════════════════════════════════════
# WEBSOCKET ENDPOINT
# ═══════════════════════════════════════════════════

@router.websocket("/ws/{game_id}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    game_id: str,
    player_id: str,
):
    """
    WebSocket bağlantı endpoint'i.
    
    URL Format:
        ws://localhost:8000/ws/{game_id}/{player_id}
        
    Example:
        ws://localhost:8000/ws/game123/P0
        
    Flow:
        1. Client WS bağlantısı açar
        2. Server accept eder ve ConnectionManager'a ekler
        3. Loop: Client'tan mesaj bekler
        4. Mesaj gelince işler (speak, vote, vb.)
        5. Disconnect olunca temizlik yapar
        
    Args:
        websocket: FastAPI WebSocket instance
        game_id: Oyun ID'si
        player_id: Oyuncu ID'si (P0, P1, P2...)
        
    Client Mesaj Formatı:
        {
            "event": "speak",
            "data": {"content": "..."}
        }
        
    Server Mesaj Formatı:
        {
            "event": "campfire_speech",
            "data": {"speaker": "...", "content": "..."}
        }
    """
    logger.info(f"🔌 WebSocket connection attempt: {game_id}/{player_id}")
    
    # ═══ 1. BAĞLANTI KABUL ET ═══
    try:
        await manager.connect(game_id, player_id, websocket)
        logger.info(f"✅ WebSocket connected: {game_id}/{player_id}")
        
        # Hoş geldin mesajı gönder
        await websocket.send_json({
            "event": "connected",
            "data": {
                "message": f"Welcome {player_id}!",
                "game_id": game_id,
                "active_players": manager.get_active_players(game_id),
            }
        })
        
    except Exception as e:
        logger.error(f"❌ Connection failed: {e}")
        return
    
    # ═══ 2. MESAJ LOOP ═══
    try:
        while True:
            # Client'tan mesaj bekle
            data = await websocket.receive_json()
            
            # Mesaj formatı kontrolü
            if not isinstance(data, dict) or "event" not in data:
                await websocket.send_json({
                    "event": "error",
                    "data": {
                        "code": "invalid_format",
                        "message": "Message must be JSON with 'event' field"
                    }
                })
                continue
            
            event_type = data.get("event")
            event_data = data.get("data", {})
            
            logger.info(f"📥 Received from {player_id}: {event_type}")
            
            # ═══ EVENT HANDLING ═══
            await handle_client_event(
                game_id=game_id,
                player_id=player_id,
                event_type=event_type,
                event_data=event_data,
                websocket=websocket,
            )
    
    except WebSocketDisconnect:
        # Normal disconnect
        logger.info(f"🔌 WebSocket disconnected: {game_id}/{player_id}")
        manager.disconnect(game_id, player_id)
        
        # Diğer oyunculara bildir
        await manager.broadcast(
            game_id,
            {
                "event": "player_disconnected",
                "data": {
                    "player_id": player_id,
                    "active_players": manager.get_active_players(game_id),
                }
            }
        )
    
    except Exception as e:
        # Beklenmeyen hata
        logger.error(f"❌ WebSocket error: {e}")
        manager.disconnect(game_id, player_id)


# ═══════════════════════════════════════════════════
# EVENT HANDLERS
# ═══════════════════════════════════════════════════

async def handle_client_event(
    game_id: str,
    player_id: str,
    event_type: str,
    event_data: dict,
    websocket: WebSocket,
):
    """
    Client'tan gelen event'leri işle.
    
    Args:
        game_id: Oyun ID'si
        player_id: Oyuncu ID'si
        event_type: Event tipi (speak, vote, vb.)
        event_data: Event verisi
        websocket: WebSocket instance
        
    Event Types:
        - heartbeat: Bağlantı kontrolü
        - speak: Campfire konuşması
        - vote: Oylama
        - visit_request: Ev ziyareti isteği
        - visit_speak: Ev ziyaretinde konuşma
    """
    
    # ═══ HEARTBEAT ═══
    if event_type == "heartbeat":
        # Basit pong yanıtı
        await websocket.send_json({
            "event": "pong",
            "data": {"timestamp": event_data.get("timestamp")}
        })
        return
    
    # ═══ SPEAK (Campfire Konuşması) ═══
    elif event_type == "speak":
        content = event_data.get("content", "")
        
        if not content:
            await websocket.send_json({
                "event": "error",
                "data": {
                    "code": "empty_content",
                    "message": "Speech content cannot be empty"
                }
            })
            return
        
        # Game loop'un queue'suna gönder
        from src.core.game_loop import get_input_queue
        queue = get_input_queue(game_id, player_id)
        await queue.put({"event": "speak", "content": content})
        
        logger.info(f"🗣️  {player_id} spoke in {game_id}")
    
    # ═══ VOTE (Oylama) ═══
    elif event_type == "vote":
        target = event_data.get("target")
        
        if not target:
            await websocket.send_json({
                "event": "error",
                "data": {
                    "code": "invalid_vote",
                    "message": "Vote target is required"
                }
            })
            return
        
        # Game loop'un queue'suna gönder
        from src.core.game_loop import get_input_queue
        queue = get_input_queue(game_id, player_id)
        await queue.put({"event": "vote", "target": target})
        
        # Confirm mesajı
        await websocket.send_json({
            "event": "vote_confirmed",
            "data": {
                "target": target,
                "voter": player_id,
            }
        })
        
        logger.info(f"🗳️  {player_id} voted for {target} in {game_id}")
    
    # ═══ LOCATION CHOICE (Serbest Dolasim) ═══
    elif event_type == "location_choice":
        choice = event_data.get("choice", "")

        if not choice:
            await websocket.send_json({
                "event": "error",
                "data": {
                    "code": "empty_choice",
                    "message": "Location choice cannot be empty"
                }
            })
            return

        from src.core.game_loop import get_input_queue
        queue = get_input_queue(game_id, player_id)
        await queue.put({"event": "location_choice", "choice": choice})

        logger.info(f"📍 {player_id} chose location: {choice} in {game_id}")

    # ═══ VISIT SPEAK (1v1 konusma) ═══
    elif event_type == "visit_speak":
        content = event_data.get("content", "")

        if not content:
            await websocket.send_json({
                "event": "error",
                "data": {
                    "code": "empty_content",
                    "message": "Visit speech content cannot be empty"
                }
            })
            return

        from src.core.game_loop import get_input_queue
        queue = get_input_queue(game_id, player_id)
        await queue.put({"event": "visit_speak", "content": content})

        logger.info(f"🏠 {player_id} spoke in visit: {game_id}")
    
    # ═══ UNKNOWN EVENT ═══
    else:
        await websocket.send_json({
            "event": "error",
            "data": {
                "code": "unknown_event",
                "message": f"Unknown event type: {event_type}"
            }
        })
        logger.warning(f"⚠️  Unknown event from {player_id}: {event_type}")


# ═══════════════════════════════════════════════════
# HELPER: BROADCAST TO GAME
# ═══════════════════════════════════════════════════

async def broadcast_to_game(game_id: str, event: str, data: dict):
    """
    Oyundaki tüm oyunculara mesaj gönder.
    
    Bu fonksiyon game engine tarafından çağrılabilir.
    
    Args:
        game_id: Oyun ID'si
        event: Event tipi
        data: Event verisi
        
    Example:
        await broadcast_to_game("game123", "phase_change", {
            "phase": "vote",
            "round": 3
        })
    """
    await manager.broadcast(game_id, {"event": event, "data": data})
