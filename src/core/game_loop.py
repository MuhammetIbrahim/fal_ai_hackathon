"""
game_loop.py — WebSocket Entegrasyonlu Asenkron Game Loop
===========================================================
Game loop'u background task olarak başlatır ve WebSocket event'leri broadcast eder.

NOT: Bu dosya tam implementation içerir ama game engine import'ları lazy yapılmıştır.
Çalıştırma sırasında prototypes/ klasörü PYTHONPATH'e eklenir.
"""

import asyncio
import logging
from typing import Dict, Optional, Any
from collections import Counter
import sys
from pathlib import Path

from src.apps.ws.service import manager
from src.core.database import db, GAMES, GAME_LOGS

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════
# GLOBAL: Game-Specific Input Queues
# ═══════════════════════════════════════════════════

# game_id → player_id → Queue
_player_input_queues: Dict[str, Dict[str, asyncio.Queue]] = {}

# Running game tasks
_running_games: Dict[str, asyncio.Task] = {}


def get_input_queue(game_id: str, player_id: str) -> asyncio.Queue:
    """
    Oyuncu için input queue getir/oluştur.
    WebSocket router bu queue'ya mesaj koyar.
    Game loop bu queue'dan mesaj bekler.
    """
    if game_id not in _player_input_queues:
        _player_input_queues[game_id] = {}
    
    if player_id not in _player_input_queues[game_id]:
        _player_input_queues[game_id][player_id] = asyncio.Queue()
    
    return _player_input_queues[game_id][player_id]


def is_game_running(game_id: str) -> bool:
    """Oyun loop'u çalışıyor mu?"""
    return game_id in _running_games and not _running_games[game_id].done()


# ═══════════════════════════════════════════════════
# MAIN: Game Loop Starter
# ═══════════════════════════════════════════════════

def start_game_loop(game_id: str, state: Any):
    """
    Game loop'u background task olarak başlat.
    
    Args:
        game_id: Oyun ID
        state: GameState (karakterler üretilmiş halde)
    
    Returns:
        asyncio.Task
    """
    if is_game_running(game_id):
        logger.warning(f"⚠️  Game {game_id} already running")
        return _running_games[game_id]
    
    task = asyncio.create_task(_game_loop_runner(game_id, state))
    _running_games[game_id] = task
    
    logger.info(f"🎮 Game loop task created: {game_id}")
    return task


# ═══════════════════════════════════════════════════
# HELPER: Save State
# ═══════════════════════════════════════════════════

def _save_state(game_id: str, state: Any):
    """Game state'i database'e kaydet."""
    from src.core.game_engine import _serialize_state
    
    game_data = db.get(GAMES, game_id)
    if game_data:
        game_data["state"] = _serialize_state(state)
        game_data["status"] = "running"
        db.set(GAMES, game_id, game_data)


def _save_log(game_id: str, log_data: dict):
    """Game log kaydet."""
    db.set(GAME_LOGS, game_id, log_data)


# ═══════════════════════════════════════════════════
# MAIN: Game Loop Runner
# ═══════════════════════════════════════════════════

async def _game_loop_runner(game_id: str, state: Any):
    """
    Asenkron game loop — WebSocket broadcast ile.
    
    Lazy import kullanarak game engine modüllerini çalışma zamanında yükler.
    """
    logger.info(f"🎮 Game loop starting: {game_id}")
    
    # ═══ Lazy Import Game Engine ═══
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "prototypes"))
        from game_state import (  # type: ignore
            Phase, get_alive_players, get_alive_names, find_player,
            check_win_condition, count_by_type,
        )
        from game import (  # type: ignore
            run_morning, exile_player, summarize_campfire, run_house_visits,
            generate_campfire_speech, generate_vote, MAX_CAMPFIRE_TURNS,
        )
    except ImportError as e:
        logger.error(f"❌ Failed to import game engine: {e}")
        await manager.broadcast(game_id, {
            "event": "error",
            "data": {
                "code": "import_error",
                "message": f"Game engine import failed: {str(e)}",
            }
        })
        return
    
    day_limit = state.get("day_limit", 5)
    
    game_log = {
        "game_id": game_id,
        "rounds": [],
        "world_seed": state.get("world_seed"),
        "players_initial": [
            {
                "name": p.name,
                "role_title": p.role_title,
                "player_type": p.player_type.value,
                "archetype_label": p.archetype_label,
            }
            for p in state["players"]
        ],
    }
    
    try:
        while True:
            round_n = state.get("round_number", 1)
            
            logger.info(f"📅 Round {round_n}/{day_limit} — Game {game_id}")
            
            et, yanki = count_by_type(state)
            logger.info(f"  Alive: {et} Et-Can, {yanki} Yanki-Dogmus")
            
            # Broadcast faz değişimi
            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "morning",
                    "round": round_n,
                    "day_limit": day_limit,
                    "alive_et_can": et,
                    "alive_yanki_dogmus": yanki,
                }
            })
            
            # Temizlik
            state["campfire_history"] = []
            state["house_visits"] = []
            
            # ═══ SABAH FAZI ═══
            state["phase"] = Phase.MORNING.value
            state = await run_morning(state)
            
            morning_msg = state["campfire_history"][-1]["content"] if state["campfire_history"] else "Yeni bir gün başlıyor..."
            
            await manager.broadcast(game_id, {
                "event": "morning",
                "data": {
                    "round": round_n,
                    "content": morning_msg,
                }
            })
            
            logger.info(f"🌅 Morning phase completed")
            
            # ═══ CAMPFIRE (Tartışma) ═══
            state["phase"] = Phase.CAMPFIRE.value
            
            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "campfire",
                    "round": round_n,
                }
            })
            
            # Campfire logic (step-by-step)
            alive = get_alive_players(state)
            
            for turn in range(MAX_CAMPFIRE_TURNS):
                speaker = alive[turn % len(alive)]
                
                # İnsan oyuncu ise input bekle
                if not speaker.is_ai:
                    speech_content = await _wait_for_human_input(
                        game_id=game_id,
                        player_id=speaker.slot_id,
                        event_type="speak",
                        timeout=30.0,
                    )
                    
                    if not speech_content:
                        speech_content = "[Sessizlik] — Oyuncu konuşmadı."
                else:
                    # AI konuşması
                    speech_content = await generate_campfire_speech(state, speaker)
                
                # History'ye ekle
                state["campfire_history"].append({
                    "speaker": speaker.name,
                    "role_title": speaker.role_title,
                    "content": speech_content,
                })
                
                # Broadcast
                await manager.broadcast(game_id, {
                    "event": "campfire_speech",
                    "data": {
                        "speaker": speaker.name,
                        "role_title": speaker.role_title,
                        "content": speech_content,
                        "turn": turn + 1,
                    }
                })
            
            logger.info(f"🔥 Campfire phase completed: {len(state['campfire_history'])} speeches")
            
            # ═══ CAMPFIRE ÖZET ═══
            campfire_summary = await summarize_campfire(state["campfire_history"], round_n)
            
            # ═══ EV ZİYARETLERİ ═══
            state["phase"] = Phase.HOUSES.value
            
            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "houses",
                    "round": round_n,
                }
            })
            
            state = await run_house_visits(state, campfire_summary)
            
            # Her visit'i private olarak ilgili oyunculara gönder
            for visit in state["house_visits"]:
                visitor_name = visit["visitor"]
                host_name = visit["host"]
                
                visitor = find_player(state, visitor_name)
                host = find_player(state, host_name)
                
                if visitor and host:
                    visit_data = {
                        "visitor": visitor_name,
                        "host": host_name,
                        "exchanges": visit["exchanges"],
                    }
                    
                    await manager.send_to(game_id, visitor.slot_id, {
                        "event": "house_visit",
                        "data": visit_data,
                    })
                    
                    await manager.send_to(game_id, host.slot_id, {
                        "event": "house_visit",
                        "data": visit_data,
                    })
            
            logger.info(f"🏠 House visits completed: {len(state['house_visits'])} visits")
            
            # ═══ OYLAMA FAZI ═══
            state["phase"] = Phase.VOTE.value
            
            alive_names = get_alive_names(state)
            
            await manager.broadcast(game_id, {
                "event": "vote_phase",
                "data": {
                    "round": round_n,
                    "alive_players": alive_names,
                    "message": "Sürgün edilecek kişiyi seçin!",
                }
            })
            
            # Vote logic (insan oyuncu dahil)
            alive = get_alive_players(state)
            
            for player in alive:
                if not player.is_ai:
                    vote_target = await _wait_for_human_input(
                        game_id=game_id,
                        player_id=player.slot_id,
                        event_type="vote",
                        timeout=30.0,
                    )
                    
                    if not vote_target:
                        import random
                        others = [p.name for p in alive if p.name != player.name]
                        vote_target = random.choice(others) if others else None
                    
                    player.vote_target = vote_target
                else:
                    vote_target = await generate_vote(state, player)
                    player.vote_target = vote_target
            
            # Oyları say
            votes = [p.vote_target for p in alive if p.vote_target]
            exiled_name = None
            if votes:
                vote_counts = Counter(votes)
                exiled_name, _ = vote_counts.most_common(1)[0]
            
            # ═══ SÜRGÜN ═══
            round_data = {
                "round": round_n,
                "campfire_history": list(state["campfire_history"]),
                "house_visits": list(state["house_visits"]),
                "votes": {},
                "exiled": None,
                "exiled_type": None,
            }
            
            if exiled_name:
                player = exile_player(state, exiled_name)
                round_data["exiled"] = exiled_name
                round_data["exiled_type"] = player.player_type.value if player else None
                
                for p in state["players"]:
                    if p.vote_target:
                        round_data["votes"][p.name] = p.vote_target
                
                await manager.broadcast(game_id, {
                    "event": "exile",
                    "data": {
                        "exiled": exiled_name,
                        "exiled_type": player.player_type.value if player else "unknown",
                        "votes": round_data["votes"],
                        "message": f"{exiled_name} sürgün edildi!",
                    }
                })
                
                logger.info(f"⚖️ {exiled_name} exiled ({player.player_type.value if player else 'unknown'})")
            else:
                await manager.broadcast(game_id, {
                    "event": "exile",
                    "data": {
                        "exiled": None,
                        "message": "Kimse sürgün edilmedi.",
                    }
                })
            
            game_log["rounds"].append(round_data)
            
            # State kaydet
            _save_state(game_id, state)
            
            # ═══ KAZANAN KONTROL ═══
            winner = check_win_condition(state)
            if winner:
                state["winner"] = winner
                state["phase"] = Phase.GAME_OVER.value
                
                et, yanki = count_by_type(state)
                final_alive = [p.name for p in get_alive_players(state)]
                
                await manager.broadcast(game_id, {
                    "event": "game_over",
                    "data": {
                        "winner": winner,
                        "et_can_count": et,
                        "yanki_dogmus_count": yanki,
                        "final_alive": final_alive,
                        "total_rounds": round_n,
                    }
                })
                
                logger.info(f"🏆 Game over: {winner} wins!")
                
                # Final log kaydet
                game_log["winner"] = winner
                game_log["total_rounds"] = round_n
                _save_log(game_id, game_log)
                
                # Game status güncelle
                game_data = db.get(GAMES, game_id)
                if game_data:
                    game_data["status"] = "finished"
                    game_data["winner"] = winner
                    db.set(GAMES, game_id, game_data)
                
                break
            
            # Sonraki güne geç
            state["round_number"] = round_n + 1
            state["exiled_today"] = None
            for p in state["players"]:
                p.vote_target = None
    
    except Exception as e:
        logger.error(f"❌ Game loop error: {e}", exc_info=True)
        
        await manager.broadcast(game_id, {
            "event": "error",
            "data": {
                "code": "game_loop_error",
                "message": str(e),
            }
        })
    
    finally:
        # Cleanup
        if game_id in _player_input_queues:
            del _player_input_queues[game_id]
        
        if game_id in _running_games:
            del _running_games[game_id]
        
        logger.info(f"🛑 Game loop ended: {game_id}")


# ═══════════════════════════════════════════════════
# HELPER: Wait for Human Input
# ═══════════════════════════════════════════════════

async def _wait_for_human_input(
    game_id: str,
    player_id: str,
    event_type: str,
    timeout: float = 30.0,
) -> Optional[str]:
    """
    İnsan oyuncudan input bekle (WebSocket ile).
    """
    queue = get_input_queue(game_id, player_id)
    
    # "Your turn" event gönder
    await manager.send_to(game_id, player_id, {
        "event": "your_turn",
        "data": {
            "action_required": event_type,
            "timeout_seconds": timeout,
        }
    })
    
    logger.info(f"⏳ Waiting for {event_type} from {player_id} (timeout: {timeout}s)")
    
    try:
        input_data = await asyncio.wait_for(queue.get(), timeout=timeout)
        
        if input_data.get("event") == event_type:
            content = input_data.get("content") or input_data.get("target")
            logger.info(f"✅ Received {event_type} from {player_id}")
            return content
        else:
            logger.warning(f"⚠️ Wrong event type from {player_id}: {input_data.get('event')}")
            return None
    
    except asyncio.TimeoutError:
        logger.warning(f"⏱️ Timeout: {player_id} did not respond to {event_type}")
        return None
