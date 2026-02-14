"""
game_loop.py — WebSocket Entegrasyonlu Asenkron Game Loop
===========================================================
Prototype'in run_full_game akisini adim adim WebSocket broadcast ile calistirir.

Akis:
  ROUND LOOP:
    1. MORNING — run_morning(state) → broadcast morning
    2. FREE PHASE:
       a. Opening Campfire (INITIAL_CAMPFIRE_TURNS)
       b. Free Roam Rounds (FREE_ROAM_ROUNDS x):
          - Konum karari (AI: LLM, Human: WS input)
          - Campfire tartismasi (sadece orada olanlar)
          - Oda gorusmeleri (1v1, unicast)
       c. Closing Campfire (CLOSING_CAMPFIRE_TURNS)
    3. CAMPFIRE SUMMARY — summarize_campfire()
    4. VOTE — Her oyuncu oy verir → broadcast exile
    5. WIN CHECK → broadcast game_over veya sonraki gune gec
"""

import asyncio
import logging
import random as random_module
import uuid as _uuid
from typing import Dict, Optional, Any
from collections import Counter
import sys
from pathlib import Path

from src.apps.ws.service import manager
from src.core.database import db, GAMES, GAME_LOGS

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════
# TTS Helper — fire-and-forget audio generation
# ═══════════════════════════════════════════════════

import re as _re

def _clean_text_for_tts(text: str) -> str:
    """TTS icin metni temizle — okunmasi zor karakterleri kaldir."""
    # Remove bracketed content like [Fenris sessiz kaldi]
    text = _re.sub(r'\[.*?\]', '', text)
    # Remove asterisks (bold/italic markup)
    text = _re.sub(r'\*+', '', text)
    # Remove parenthetical stage directions
    text = _re.sub(r'\([^)]{1,50}\)', '', text)
    # Remove emoji
    text = _re.sub(r'[^\w\s.,!?;:\'"…\-—]', '', text, flags=_re.UNICODE)
    # Collapse multiple spaces
    text = _re.sub(r'\s+', ' ', text).strip()
    return text


_tts_path_added = False

async def _generate_audio_url(
    content: str,
    voice: str = "alloy",
    speed: float = 1.0,
) -> tuple[str | None, float]:
    """TTS uret, (audio_url, duration_sec) don. Hata → (None, 0).
    Senkron: await et, text ile birlikte gonder.
    voice: 'alloy' | 'zeynep' | 'ali'
    """
    try:
        global _tts_path_added
        if not _tts_path_added:
            sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
            _tts_path_added = True
        from src.services.api_client import tts_generate

        clean_content = _clean_text_for_tts(content)
        if not clean_content or len(clean_content) < 3:
            return None, 0.0

        result = await tts_generate(clean_content, speed=speed, voice=voice)
        return result.audio_url, result.audio_duration_sec or 0.0
    except Exception as e:
        logger.warning(f"TTS generation failed: {e}")
        return None, 0.0


async def _rewrite_human_speech(text: str, character, state: dict) -> str:
    """Insan metnini direkt dondur — rewrite yok, STT → TTS direkt."""
    return text


async def _stt_keepalive(transcribe_fn, silent_wav: bytes, game_id: str):
    """Background: fal.ai STT cold-start'i onlemek icin periyodik ping gonder.
    Oyun bitene kadar her 12 saniyede bir sessiz WAV gonderir."""
    while True:
        try:
            await transcribe_fn(silent_wav, language="tr")
            logger.warning("[WARMUP] STT keepalive OK")
        except Exception as e:
            logger.warning(f"[WARMUP] STT keepalive failed: {e}")
        await asyncio.sleep(12)
        # Oyun bittiyse dur
        try:
            game = db[GAMES].find_one({"game_id": game_id})
            if not game or game.get("status") == "finished":
                logger.warning("[WARMUP] Game ended, stopping STT keepalive")
                return
        except Exception:
            pass


async def _generate_and_broadcast_audio(
    game_id: str,
    speaker: str,
    content: str,
    context: str = "campfire",
    voice: str = "alloy",
    speed: float = 0.9,
) -> None:
    """Legacy fire-and-forget wrapper — sadece institution gibi eski kodlarda kullanilir."""
    audio_url, duration = await _generate_audio_url(content, voice=voice, speed=speed)
    if audio_url:
        await manager.broadcast(game_id, {
            "event": "speech_audio",
            "data": {
                "speaker": speaker,
                "audio_url": audio_url,
                "duration": duration,
                "context": context,
            }
        })


# ═══════════════════════════════════════════════════
# GLOBAL: Game-Specific Input Queues
# ═══════════════════════════════════════════════════

# game_id → player_id → Queue
_player_input_queues: Dict[str, Dict[str, asyncio.Queue]] = {}

# Running game tasks
_running_games: Dict[str, asyncio.Task] = {}

# Per-game interrupt events — human player signals immediate wakeup
_human_interrupt_events: Dict[str, asyncio.Event] = {}


def get_interrupt_event(game_id: str) -> asyncio.Event:
    if game_id not in _human_interrupt_events:
        _human_interrupt_events[game_id] = asyncio.Event()
    return _human_interrupt_events[game_id]


def signal_human_interrupt(game_id: str):
    """Called from WS router when human sends speak/speak_audio/interrupt."""
    event = get_interrupt_event(game_id)
    event.set()


async def _interruptible_sleep(game_id: str, duration: float) -> bool:
    """Sleep that can be cut short by human input.
    Returns True if interrupted, False if timed out normally."""
    event = get_interrupt_event(game_id)
    event.clear()
    try:
        await asyncio.wait_for(event.wait(), timeout=duration)
        return True
    except asyncio.TimeoutError:
        return False


async def _race_ai_generation(game_id: str, coro) -> tuple:
    """Race an AI generation coroutine against human interrupt event.
    Returns (result, False) on normal completion, (None, True) if interrupted."""
    event = get_interrupt_event(game_id)
    event.clear()

    gen_task = asyncio.create_task(coro)
    interrupt_task = asyncio.create_task(event.wait())

    done, pending = await asyncio.wait(
        [gen_task, interrupt_task],
        return_when=asyncio.FIRST_COMPLETED,
    )

    for t in pending:
        t.cancel()

    if interrupt_task in done:
        try:
            await gen_task
        except (asyncio.CancelledError, Exception):
            pass
        return None, True

    try:
        await interrupt_task
    except (asyncio.CancelledError, Exception):
        pass
    return gen_task.result(), False


def get_input_queue(game_id: str, player_id: str) -> asyncio.Queue:
    """
    Oyuncu icin input queue getir/olustur.
    WebSocket router bu queue'ya mesaj koyar.
    Game loop bu queue'dan mesaj bekler.
    """
    if game_id not in _player_input_queues:
        _player_input_queues[game_id] = {}

    if player_id not in _player_input_queues[game_id]:
        _player_input_queues[game_id][player_id] = asyncio.Queue()

    return _player_input_queues[game_id][player_id]


def is_game_running(game_id: str) -> bool:
    """Oyun loop'u calisiyor mu?"""
    return game_id in _running_games and not _running_games[game_id].done()


# ═══════════════════════════════════════════════════
# MAIN: Game Loop Starter
# ═══════════════════════════════════════════════════

def start_game_loop(game_id: str, state: Any):
    """Game loop'u background task olarak baslat."""
    if is_game_running(game_id):
        logger.warning(f"Game {game_id} already running")
        return _running_games[game_id]

    task = asyncio.create_task(_game_loop_runner(game_id, state))
    _running_games[game_id] = task

    logger.info(f"Game loop task created: {game_id}")
    return task


# ═══════════════════════════════════════════════════
# HELPER: Save State & Log
# ═══════════════════════════════════════════════════

def _save_state(game_id: str, state: Any):
    """Game state'i database'e kaydet."""
    from src.core.game_engine import _serialize_state

    game_data = db.get(GAMES, game_id)
    if game_data:
        game_data["state"] = _serialize_state(state)
        game_data["status"] = "running"
        db.update(GAMES, game_id, game_data)


def _save_log(game_id: str, log_data: dict):
    """Game log kaydet."""
    db.insert(GAME_LOGS, game_id, log_data)


# ═══════════════════════════════════════════════════
# HELPER: Wait for Human Input
# ═══════════════════════════════════════════════════

async def _process_human_interjection(
    game_id: str,
    state: Any,
    human_player,
    participant_names: list[str],
    turns_done: int,
    max_turns: int,
    event_type: str = "speak",
) -> bool:
    """
    Non-blocking: Human queue'da mesaj varsa hemen isle ve broadcast et.
    True donerse human konustu, False donerse kuyrukta mesaj yoktu.
    """
    queue = get_input_queue(game_id, human_player.slot_id)

    # Drain queue — skip non-matching events (put them back)
    found_data = None
    stashed = []
    while True:
        try:
            input_data = queue.get_nowait()
        except asyncio.QueueEmpty:
            break
        if input_data.get("event") == event_type and input_data.get("content"):
            found_data = input_data
            break
        else:
            stashed.append(input_data)

    # Put back non-matching messages
    for item in stashed:
        await queue.put(item)

    if not found_data:
        return False

    content = found_data.get("content", "")
    logger.warning(f"[INTERJECT] Processing human interjection: '{content[:50]}'")

    # Rewrite in character voice
    message = await _rewrite_human_speech(content, human_player, state)

    # Add to history
    state["campfire_history"].append({
        "type": "speech", "name": human_player.name,
        "role_title": human_player.role_title, "content": message,
        "present": list(participant_names),
    })
    human_player.add_message("assistant", message)

    # TTS
    audio_url, audio_duration = await _generate_audio_url(
        message, voice=getattr(human_player, 'voice_id', 'alloy'),
        speed=getattr(human_player, 'voice_speed', 1.0),
    )

    # Broadcast
    await manager.broadcast(game_id, {
        "event": "campfire_speech",
        "data": {
            "speaker": human_player.name,
            "role_title": human_player.role_title,
            "content": message,
            "turn": turns_done,
            "max_turns": max_turns,
            "participants": participant_names,
            "audio_url": audio_url,
            "audio_duration": audio_duration,
        }
    })

    # Wait for audio (interruptible)
    wait_time = min(max(audio_duration * 0.95, 2.0), 10.0) if audio_duration > 0 else 2.0
    interrupted = await _interruptible_sleep(game_id, wait_time)
    if interrupted:
        logger.warning(f"[INTERRUPT] Human interjection audio wait interrupted")

    return True


async def _wait_for_human_input(
    game_id: str,
    player_id: str,
    event_type: str,
    timeout: float = 60.0,
    extra_data: dict | None = None,
) -> str | None:
    """Insan oyuncudan input bekle (WebSocket ile).
    Non-matching event'leri queue'ya geri koyar, kaybolma yok."""
    queue = get_input_queue(game_id, player_id)

    logger.warning(f"[WAIT] START: waiting for '{event_type}' from {player_id}, qsize={queue.qsize()}")

    your_turn_data = {
        "action_required": event_type,
        "timeout_seconds": timeout,
    }
    if extra_data:
        your_turn_data.update(extra_data)

    await manager.send_to(game_id, player_id, {
        "event": "your_turn",
        "data": your_turn_data,
    })

    import time as _time
    deadline = _time.monotonic() + timeout

    while True:
        remaining = deadline - _time.monotonic()
        if remaining <= 0:
            logger.warning(f"[WAIT] TIMEOUT: {player_id} did not respond to {event_type}")
            return None

        try:
            input_data = await asyncio.wait_for(queue.get(), timeout=remaining)
        except asyncio.TimeoutError:
            logger.warning(f"[WAIT] TIMEOUT: {player_id} did not respond to {event_type}")
            return None

        got_event = input_data.get("event", "")
        logger.warning(f"[WAIT] Got from queue: event='{got_event}' (expected='{event_type}')")

        if got_event == event_type:
            content = input_data.get("content") or input_data.get("target") or input_data.get("choice")
            logger.warning(f"[WAIT] MATCH! content='{(content or '')[:50]}'")
            return content
        else:
            # Wrong event type — put it back so it's not lost
            await queue.put(input_data)
            logger.warning(f"[WAIT] Re-queued non-matching event '{got_event}', continuing to wait...")
            # Small sleep to avoid busy loop if queue has only wrong events
            await asyncio.sleep(0.1)


# ═══════════════════════════════════════════════════
# MAIN: Game Loop Runner
# ═══════════════════════════════════════════════════

async def _game_loop_runner(game_id: str, state: Any):
    """
    Asenkron game loop — Prototype akisini adim adim WS broadcast ile calistirir.
    """
    logger.warning(f"🟢 GAME LOOP STARTING: {game_id}")

    # ═══ Lazy Import Game Engine ═══
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src" / "prototypes"))
        from game_state import (  # type: ignore
            Phase, get_alive_players, get_alive_names, find_player,
            check_win_condition, count_by_type,
        )
        from game import (  # type: ignore
            run_morning, exile_player, summarize_campfire,
            generate_campfire_speech, generate_vote,
            generate_1v1_speech, generate_location_decision,
            maybe_update_campfire_summary, update_cumulative_summary,
            get_reaction, orchestrator_pick, check_moderation,
            generate_spotlight_cards, generate_sinama_event, check_ocak_tepki,
            generate_institution_scene, generate_public_mini_event,
            generate_private_mini_event,
            # Katman 3
            generate_night_move, generate_omen_vote,
            resolve_night_phase, resolve_omen_choice,
            apply_kamu_baskisi_to_votes, use_kalkan,
            # Katman 4
            generate_morning_crisis, generate_campfire_proposal,
            resolve_proposal_vote, check_soz_borcu, check_soz_borcu_verdict,
            generate_omen_interpretation, generate_house_entry_event,
            generate_sinama_echo, generate_proposal_speech, generate_proposal_vote_ai,
            INITIAL_CAMPFIRE_TURNS, FREE_ROAM_ROUNDS,
            CAMPFIRE_TURNS_PER_ROUND, CLOSING_CAMPFIRE_TURNS,
            ROOM_EXCHANGES, INSTITUTION_LOCATIONS,
            NIGHT_MOVES, OMENS,
        )
    except ImportError as e:
        logger.error(f"Failed to import game engine: {e}")
        await manager.broadcast(game_id, {
            "event": "error",
            "data": {
                "code": "import_error",
                "message": f"Game engine import failed: {str(e)}",
            }
        })
        return

    day_limit = state.get("day_limit", 5)

    # ═══ STT Pre-warm — fal.ai serverless cold start'i onlemek icin ═══
    try:
        from src.services.api_client import transcribe_audio
        # 0.5sn sessiz WAV ile warm-up (fal.ai makinesini uyandirir)
        import base64
        silent_wav = base64.b64decode(
            "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA="
        )
        asyncio.create_task(_stt_keepalive(transcribe_audio, silent_wav, game_id))
        logger.warning("[WARMUP] STT keepalive started (every 12s)")
    except Exception as e:
        logger.warning(f"[WARMUP] STT pre-warm failed to start: {e}")

    # ═══ WS Bağlantı Bekleme — client'ların bağlanması için kısa süre ═══
    await asyncio.sleep(3.0)

    # ═══ Character Reveal — broadcast ile gonder (send_to zamanlama sorunu yaratiyordu) ═══
    for p in state["players"]:
        if p.is_human:
            await manager.broadcast(game_id, {
                "event": "character_reveal",
                "data": {
                    "target_player": p.slot_id,
                    "name": p.name,
                    "role_title": p.role_title,
                    "lore": p.lore,
                    "archetype_label": p.archetype_label,
                    "player_type": p.player_type.value,
                    "institution": p.institution,
                    "institution_label": p.institution_label,
                    "public_tick": p.public_tick,
                    "alibi_anchor": p.alibi_anchor,
                    "speech_color": p.speech_color,
                    "avatar_url": p.avatar_url,
                }
            })

    # Tüm bağlı oyunculara (spectator dahil) oyuncu listesini gönder
    await manager.broadcast(game_id, {
        "event": "players_update",
        "data": {
            "players": [
                {
                    "slot_id": p.slot_id,
                    "name": p.name,
                    "role_title": p.role_title,
                    "alive": p.alive,
                    "color": None,
                    "institution_label": p.institution_label,
                    "public_tick": p.public_tick,
                    "alibi_anchor": p.alibi_anchor,
                    "speech_color": p.speech_color,
                    "lore": p.lore,
                    "archetype_label": p.archetype_label,
                    "avatar_url": p.avatar_url,
                }
                for p in state["players"]
            ]
        }
    })

    # Sahne arka planlarini gonder
    scene_backgrounds = state.get("scene_backgrounds", {})
    if scene_backgrounds:
        await manager.broadcast(game_id, {
            "event": "scene_backgrounds",
            "data": scene_backgrounds,
        })

    await asyncio.sleep(2)  # Karakter gösterimini okumak için bekle

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

            logger.info(f"Round {round_n}/{day_limit} — Game {game_id}")

            et, yanki = count_by_type(state)

            # Round icin temizlik (prototype ile ayni)
            state["campfire_history"] = []
            state["house_visits"] = []
            state["campfire_rolling_summary"] = ""
            state["_summary_cursor"] = 0

            # ═══════════════════════════════════════
            # 1. SABAH FAZI
            # ═══════════════════════════════════════
            state["phase"] = Phase.MORNING.value

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

            state = await run_morning(state)

            morning_msg = ""
            if state["campfire_history"]:
                morning_msg = state["campfire_history"][-1]["content"]

            # Gunun alametleri (run_morning state'e kaydetti)
            day_omens = state.get("_day_omens", [])

            await manager.broadcast(game_id, {
                "event": "morning",
                "data": {
                    "round": round_n,
                    "content": morning_msg,
                    "omens": [
                        {"id": o["id"], "label": o["label"], "icon": o["icon"]}
                        for o in day_omens
                    ],
                }
            })

            logger.info(f"Morning phase completed — Round {round_n}")

            # ── SINAMA EVENT (Katman 1) ──
            try:
                sinama = await generate_sinama_event(state)
                if sinama:
                    await manager.broadcast(game_id, {
                        "event": "sinama",
                        "data": sinama,
                    })
                    await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Sinama generation failed: {e}")

            # ── BUYUK KRIZ EVENT (Katman 4) ──
            try:
                crisis = await generate_morning_crisis(state)
                if crisis:
                    await manager.broadcast(game_id, {
                        "event": "morning_crisis",
                        "data": crisis,
                    })
                    await asyncio.sleep(2)
            except Exception as e:
                logger.warning(f"Crisis generation failed: {e}")

            # ── KAMU MINI EVENT (Katman 2) ──
            try:
                mini_event = await generate_public_mini_event(state)
                if mini_event:
                    await manager.broadcast(game_id, {
                        "event": "mini_event",
                        "data": mini_event,
                    })
                    await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Mini event generation failed: {e}")

            # ── SPOTLIGHT KARTLARI (Katman 1) ──
            try:
                spotlight_cards = await generate_spotlight_cards(state)
                if spotlight_cards:
                    await manager.broadcast(game_id, {
                        "event": "spotlight_cards",
                        "data": {"cards": spotlight_cards},
                    })
                    await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Spotlight generation failed: {e}")

            # ═══════════════════════════════════════
            # 2. SERBEST DOLASIM FAZI (Free Phase)
            # ═══════════════════════════════════════
            state["phase"] = Phase.CAMPFIRE.value

            # ── 2a-pre. SOZ BORCU KONTROLU (Katman 4) ──
            forced_speakers = state.get("_forced_speakers", [])
            if forced_speakers:
                damgali = state.get("_ocak_damgasi", [])
                await manager.broadcast(game_id, {
                    "event": "soz_borcu",
                    "data": {
                        "forced_speakers": forced_speakers,
                        "damgali": damgali,
                    }
                })
                await asyncio.sleep(1)
                state["_forced_speakers"] = []  # reset

            # ── 2a-pre. ALAMET YORUMU TURU (Katman 4) ──
            try:
                day_omens = state.get("_day_omens", [])
                if day_omens and round_n >= 2:
                    chosen_omen = day_omens[0]  # ilk alamet
                    omen_interps = []
                    alive = get_alive_players(state)

                    # AI yorumlari concurrent
                    ai_interp_tasks = []
                    ai_interp_players = []
                    for p in alive:
                        if not p.is_human:
                            ai_interp_tasks.append(generate_omen_interpretation(p, state, chosen_omen))
                            ai_interp_players.append(p)

                    if ai_interp_tasks:
                        ai_results = await asyncio.gather(*ai_interp_tasks, return_exceptions=True)
                        for p, interp in zip(ai_interp_players, ai_results):
                            if isinstance(interp, str):
                                omen_interps.append({"speaker": p.name, "text": interp})

                    if omen_interps:
                        await manager.broadcast(game_id, {
                            "event": "omen_interpretation",
                            "data": {
                                "omen": {"id": chosen_omen["id"], "label": chosen_omen["label"], "icon": chosen_omen["icon"]},
                                "interpretations": omen_interps,
                            }
                        })
                        await asyncio.sleep(2)
                        logger.info(f"Omen interpretation round completed — {len(omen_interps)} speeches")
            except Exception as e:
                logger.warning(f"Omen interpretation failed: {e}")

            # ── 2a. OPENING CAMPFIRE ──
            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "campfire_open",
                    "round": round_n,
                    "segment": "opening",
                    "max_turns": INITIAL_CAMPFIRE_TURNS,
                    "proposal": state.get("_current_proposal"),
                }
            })

            await _run_campfire_segment_ws(
                game_id=game_id,
                state=state,
                max_turns=INITIAL_CAMPFIRE_TURNS,
                participant_names=None,  # herkes
                generate_campfire_speech=generate_campfire_speech,
                get_alive_players=get_alive_players,
                find_player=find_player,
                maybe_update_campfire_summary=maybe_update_campfire_summary,
                get_reaction=get_reaction,
                orchestrator_pick=orchestrator_pick,
                check_moderation=check_moderation,
                check_ocak_tepki=check_ocak_tepki,
            )

            logger.info(f"Opening campfire completed — {INITIAL_CAMPFIRE_TURNS} turns")

            # ── 2a-post. SINAMA ECHO (Katman 4) ──
            try:
                sinama_echo = await generate_sinama_echo(state)
                if sinama_echo:
                    await manager.broadcast(game_id, {
                        "event": "sinama_echo",
                        "data": {"content": sinama_echo},
                    })
                    await asyncio.sleep(1)
            except Exception as e:
                logger.warning(f"Sinama echo failed: {e}")

            # ── 2b. FLUID FREE PHASE ──
            _fluid_state_lock = asyncio.Lock()

            await manager.broadcast(game_id, {
                "event": "free_roam_start",
                "data": {
                    "round": round_n,
                    "roam_round": 1,
                    "total_roam_rounds": FREE_ROAM_ROUNDS,
                    "mode": "fluid",
                }
            })

            await _run_fluid_free_phase(
                game_id=game_id,
                state=state,
                state_lock=_fluid_state_lock,
                generate_campfire_speech=generate_campfire_speech,
                generate_location_decision=generate_location_decision,
                generate_1v1_speech=generate_1v1_speech,
                generate_institution_scene=generate_institution_scene,
                generate_private_mini_event=generate_private_mini_event,
                generate_house_entry_event=generate_house_entry_event,
                get_alive_players=get_alive_players,
                find_player=find_player,
                maybe_update_campfire_summary=maybe_update_campfire_summary,
                get_reaction=get_reaction,
                orchestrator_pick=orchestrator_pick,
                check_moderation=check_moderation,
                check_ocak_tepki=check_ocak_tepki,
                free_roam_rounds=FREE_ROAM_ROUNDS,
                campfire_turns_per_round=CAMPFIRE_TURNS_PER_ROUND,
                room_exchanges=ROOM_EXCHANGES,
                institution_locations=INSTITUTION_LOCATIONS,
            )

            logger.info(f"Fluid free phase completed for round {round_n}")

            # ── 2b-post. POLITIK ONERGE (Katman 4) ──
            try:
                proposal = await generate_campfire_proposal(state)
                if proposal:
                    await manager.broadcast(game_id, {
                        "event": "proposal",
                        "data": proposal,
                    })
                    await asyncio.sleep(1)

                    # AI onerge konusmalari (concurrent)
                    alive = get_alive_players(state)
                    ai_proposal_tasks = []
                    ai_proposal_players = []
                    for p in alive:
                        if not p.is_human:
                            ai_proposal_tasks.append(generate_proposal_speech(p, state, proposal))
                            ai_proposal_players.append(p)

                    if ai_proposal_tasks:
                        ai_speeches = await asyncio.gather(*ai_proposal_tasks, return_exceptions=True)
                        for p, speech in zip(ai_proposal_players, ai_speeches):
                            if isinstance(speech, str):
                                state["campfire_history"].append({
                                    "type": "speech",
                                    "name": p.name,
                                    "role_title": p.role_title,
                                    "content": speech,
                                })
                                # Sync TTS for proposal speeches too
                                p_audio_url, p_audio_dur = await _generate_audio_url(
                                    speech, voice=getattr(p, 'voice_id', 'alloy'),
                                    speed=getattr(p, 'voice_speed', 1.0),
                                )
                                await manager.broadcast(game_id, {
                                    "event": "campfire_speech",
                                    "data": {
                                        "speaker": p.name,
                                        "content": speech,
                                        "audio_url": p_audio_url,
                                        "audio_duration": p_audio_dur,
                                    },
                                })
                                wait_time = min(max(p_audio_dur * 0.95, 2.0), 10.0) if p_audio_dur > 0 else 2.0
                                await asyncio.sleep(wait_time)

                    # Insan onerge oyu bekle
                    human_proposal_tasks = []
                    human_proposal_players = []
                    for p in alive:
                        if p.is_human:
                            human_proposal_tasks.append(
                                _wait_for_human_input(
                                    game_id=game_id,
                                    player_id=p.slot_id,
                                    event_type="proposal_vote",
                                    timeout=30.0,
                                )
                            )
                            human_proposal_players.append(p)

                    # AI onerge oylari concurrent
                    ai_vote_tasks = []
                    ai_vote_players = []
                    for p in alive:
                        if not p.is_human:
                            ai_vote_tasks.append(generate_proposal_vote_ai(p, state, proposal))
                            ai_vote_players.append(p)

                    vote_results = await asyncio.gather(
                        asyncio.gather(*ai_vote_tasks) if ai_vote_tasks else asyncio.sleep(0),
                        asyncio.gather(*human_proposal_tasks) if human_proposal_tasks else asyncio.sleep(0),
                    )

                    ai_votes = list(vote_results[0]) if ai_vote_tasks else []
                    human_votes = list(vote_results[1]) if human_proposal_tasks else []

                    proposal_votes = {}
                    for p, v in zip(ai_vote_players, ai_votes):
                        proposal_votes[p.name] = v if v in ("a", "b") else "a"
                    for p, v in zip(human_proposal_players, human_votes):
                        proposal_votes[p.name] = v if v in ("a", "b") else "a"

                    proposal_result = resolve_proposal_vote(state, proposal_votes)
                    await manager.broadcast(game_id, {
                        "event": "proposal_result",
                        "data": proposal_result,
                    })
                    await asyncio.sleep(2)
                    logger.info(f"Proposal vote completed — {proposal_result['winner_text']}")

            except Exception as e:
                logger.warning(f"Proposal system failed: {e}")

            # ── 2c. CLOSING CAMPFIRE ──
            alive = get_alive_players(state)
            alive_names = [p.name for p in alive]

            donus_msg = "Herkes ates basina dondu. Oylama zamani yaklasıyor."
            state["campfire_history"].append({
                "type": "narrator",
                "content": donus_msg,
                "present": alive_names,
            })

            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "campfire_close",
                    "round": round_n,
                    "segment": "closing",
                    "max_turns": CLOSING_CAMPFIRE_TURNS,
                }
            })

            await _run_campfire_segment_ws(
                game_id=game_id,
                state=state,
                max_turns=CLOSING_CAMPFIRE_TURNS,
                participant_names=None,  # herkes
                generate_campfire_speech=generate_campfire_speech,
                get_alive_players=get_alive_players,
                find_player=find_player,
                maybe_update_campfire_summary=maybe_update_campfire_summary,
                get_reaction=get_reaction,
                orchestrator_pick=orchestrator_pick,
                check_moderation=check_moderation,
                check_ocak_tepki=check_ocak_tepki,
            )

            logger.info(f"Closing campfire completed")

            # ═══════════════════════════════════════
            # 3. CAMPFIRE OZETI
            # ═══════════════════════════════════════
            campfire_summary = await summarize_campfire(state["campfire_history"], round_n)
            logger.info(f"Campfire summary ready ({len(campfire_summary)} chars)")

            # ═══════════════════════════════════════
            # 4. OYLAMA FAZI
            # ═══════════════════════════════════════
            state["phase"] = Phase.VOTE.value

            alive = get_alive_players(state)
            alive_names = get_alive_names(state)

            # Kamu baskisi bilgisi vote broadcast'ine ekle
            baskisi_target = state.get("_kamu_baskisi", {}).get("target") if state.get("_kamu_baskisi") else None
            # Oyuncunun kalkan hakkini kontrol et
            human_player = next((p for p in alive if p.is_human), None)
            can_use_kalkan = (
                human_player is not None
                and baskisi_target == human_player.name
                and human_player.name not in state.get("_kalkan_used", [])
            )

            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "vote",
                    "round": round_n,
                    "alive_players": alive_names,
                    "message": "Surgun edilecek kisiyi secin!",
                    "baskisi_target": baskisi_target,
                    "can_use_kalkan": can_use_kalkan,
                }
            })

            # AI oylar (concurrent)
            ai_vote_tasks = []
            ai_vote_players = []
            for p in alive:
                if not p.is_human:
                    ai_vote_tasks.append(generate_vote(state, p, campfire_summary))
                    ai_vote_players.append(p)

            # Insan oylar (concurrent)
            human_vote_tasks = []
            human_vote_players = []
            for p in alive:
                if p.is_human:
                    human_vote_tasks.append(
                        _wait_for_human_input(
                            game_id=game_id,
                            player_id=p.slot_id,
                            event_type="vote",
                            timeout=60.0,
                            extra_data={"alive_players": alive_names},
                        )
                    )
                    human_vote_players.append(p)

            # Hepsini paralel
            vote_results = await asyncio.gather(
                asyncio.gather(*ai_vote_tasks) if ai_vote_tasks else asyncio.sleep(0),
                asyncio.gather(*human_vote_tasks) if human_vote_tasks else asyncio.sleep(0),
            )

            ai_votes = list(vote_results[0]) if ai_vote_tasks else []
            human_votes = list(vote_results[1]) if human_vote_tasks else []

            # Oylari ata
            for p, vote in zip(ai_vote_players, ai_votes):
                p.vote_target = vote

            for p, vote in zip(human_vote_players, human_votes):
                if vote and vote in alive_names and vote != p.name:
                    p.vote_target = vote
                else:
                    others = [n for n in alive_names if n != p.name]
                    p.vote_target = random_module.choice(others) if others else None

            # Oylari say (Katman 3: kamu baskisi etkisi)
            vote_map = {}
            for p in alive:
                if p.vote_target:
                    vote_map[p.name] = p.vote_target

            # Kamu baskisi: hedefin oylari 2x sayilir (kalkan kullanilmadiysa)
            adjusted_votes = apply_kamu_baskisi_to_votes(state, vote_map)
            tally = Counter(adjusted_votes)

            exiled_name = None
            if tally:
                top_vote, top_count = tally.most_common(1)[0]
                tied = [name for name, count in tally.items() if count == top_count]
                if len(tied) == 1:
                    exiled_name = top_vote
                elif len(tied) >= 2:
                    # Beraberlikte rastgele birini sec (oyun ilerlemesi icin)
                    exiled_name = random_module.choice(tied)
                    logger.info(f"Vote tie between {tied} — randomly chose {exiled_name}")

            # ═══════════════════════════════════════
            # 5. SURGUN
            # ═══════════════════════════════════════
            round_data = {
                "round": round_n,
                "campfire_history": list(state["campfire_history"]),
                "house_visits": list(state["house_visits"]),
                "votes": vote_map,
                "exiled": None,
                "exiled_type": None,
            }

            if exiled_name:
                player = exile_player(state, exiled_name)
                round_data["exiled"] = exiled_name
                round_data["exiled_type"] = player.player_type.value if player else None

                remaining = get_alive_names(state)
                await manager.broadcast(game_id, {
                    "event": "exile",
                    "data": {
                        "exiled": exiled_name,
                        "exiled_type": player.player_type.value if player else "unknown",
                        "exiled_role": player.role_title if player else "unknown",
                        "votes": vote_map,
                        "active_players": remaining,
                        "message": f"{exiled_name} surgun edildi!",
                    }
                })

                logger.info(f"{exiled_name} exiled ({player.player_type.value if player else 'unknown'})")
            else:
                await manager.broadcast(game_id, {
                    "event": "exile",
                    "data": {
                        "exiled": None,
                        "votes": vote_map,
                        "message": "Beraberlik! Kimse surgun edilmedi.",
                    }
                })

            # Cumulative summary guncelle (cross-round memory)
            vote_result_text = f"Surgun: {exiled_name}" if exiled_name else "Kimse surgun edilmedi (berabere)"
            state["cumulative_summary"] = await update_cumulative_summary(
                state.get("cumulative_summary", ""),
                round_n,
                campfire_summary,
                vote_result_text,
            )
            logger.info(f"Cumulative summary updated")

            game_log["rounds"].append(round_data)

            # State kaydet
            _save_state(game_id, state)

            # ═══════════════════════════════════════
            # 6. KAZANAN KONTROL
            # ═══════════════════════════════════════
            winner = check_win_condition(state)
            if winner:
                state["winner"] = winner
                state["phase"] = Phase.GAME_OVER.value

                et, yanki = count_by_type(state)
                final_alive = [
                    {"name": p.name, "role_title": p.role_title, "player_type": p.player_type.value}
                    for p in get_alive_players(state)
                ]
                all_players = [
                    {
                        "name": p.name,
                        "role_title": p.role_title,
                        "player_type": p.player_type.value,
                        "alive": p.alive,
                    }
                    for p in state["players"]
                ]

                await manager.broadcast(game_id, {
                    "event": "game_over",
                    "data": {
                        "winner": winner,
                        "et_can_count": et,
                        "yanki_dogmus_count": yanki,
                        "final_alive": final_alive,
                        "all_players": all_players,
                        "total_rounds": round_n,
                    }
                })

                logger.info(f"Game over: {winner} wins!")

                game_log["winner"] = winner
                game_log["total_rounds"] = round_n
                _save_log(game_id, game_log)

                game_data = db.get(GAMES, game_id)
                if game_data:
                    game_data["status"] = "finished"
                    game_data["winner"] = winner
                    db.update(GAMES, game_id, game_data)

                break

            # ═══════════════════════════════════════
            # 7. GECE FAZI (Katman 3)
            # ═══════════════════════════════════════
            state["phase"] = Phase.NIGHT.value
            alive = get_alive_players(state)

            # Gunun 3 alameti (gece secimi icin)
            day_omens = state.get("_day_omens", [])

            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "night",
                    "round": round_n,
                    "night_moves": NIGHT_MOVES,
                    "omen_options": [
                        {"id": o["id"], "label": o["label"], "icon": o["icon"]}
                        for o in day_omens
                    ],
                    "baskisi_target": state.get("_kamu_baskisi", {}).get("target") if state.get("_kamu_baskisi") else None,
                }
            })

            # AI gece hamleleri (concurrent)
            ai_night_tasks = []
            ai_night_players = []
            for p in alive:
                if not p.is_human:
                    ai_night_tasks.append(generate_night_move(p, state))
                    ai_night_players.append(p)

            # Insan gece hamlesi (WS)
            human_night_tasks = []
            human_night_players = []
            for p in alive:
                if p.is_human:
                    human_night_tasks.append(
                        _wait_for_human_input(
                            game_id=game_id,
                            player_id=p.slot_id,
                            event_type="night_move",
                            timeout=45.0,
                        )
                    )
                    human_night_players.append(p)

            # AI alamet oylamasi (concurrent)
            ai_omen_tasks = []
            for p in alive:
                if not p.is_human and day_omens:
                    ai_omen_tasks.append(generate_omen_vote(p, state, day_omens))

            # Insan alamet secimi (WS)
            human_omen_tasks = []
            for p in alive:
                if p.is_human and day_omens:
                    human_omen_tasks.append(
                        _wait_for_human_input(
                            game_id=game_id,
                            player_id=p.slot_id,
                            event_type="omen_choice",
                            timeout=30.0,
                        )
                    )

            # Hepsini paralel calistir
            night_results = await asyncio.gather(
                asyncio.gather(*ai_night_tasks) if ai_night_tasks else asyncio.sleep(0),
                asyncio.gather(*human_night_tasks) if human_night_tasks else asyncio.sleep(0),
                asyncio.gather(*ai_omen_tasks) if ai_omen_tasks else asyncio.sleep(0),
                asyncio.gather(*human_omen_tasks) if human_omen_tasks else asyncio.sleep(0),
            )

            ai_night_decisions = list(night_results[0]) if ai_night_tasks else []
            human_night_choices = list(night_results[1]) if human_night_tasks else []
            ai_omen_choices = list(night_results[2]) if ai_omen_tasks else []
            human_omen_choices = list(night_results[3]) if human_omen_tasks else []

            # Insan gece hamlesini parse et
            all_night_decisions = list(ai_night_decisions)
            for p, choice in zip(human_night_players, human_night_choices):
                if choice and "|" in choice:
                    parts = choice.split("|", 1)
                    move_id = parts[0].strip().lower()
                    target = parts[1].strip()
                    all_night_decisions.append({"name": p.name, "move": move_id, "target": target})
                else:
                    # Fallback
                    others = [pp.name for pp in alive if pp.name != p.name]
                    if others:
                        all_night_decisions.append({"name": p.name, "move": "itibar_kirigi", "target": random_module.choice(others)})

            # Gece hamlelerini coz
            night_result = resolve_night_phase(state, all_night_decisions)

            # Alamet secimini coz
            all_omen_votes = list(ai_omen_choices)
            for choice in human_omen_choices:
                if choice and day_omens:
                    # Validate
                    valid_ids = [o["id"] for o in day_omens]
                    all_omen_votes.append(choice if choice in valid_ids else day_omens[0]["id"])

            omen_result = None
            if day_omens and all_omen_votes:
                omen_result = resolve_omen_choice(state, all_omen_votes, day_omens)

            # Broadcast gece sonucu
            await manager.broadcast(game_id, {
                "event": "night_result",
                "data": {
                    "winning_move": night_result.get("winning_move"),
                    "target": night_result.get("target"),
                    "effect_text": night_result.get("effect_text", "Gece sessiz gecti."),
                    "chosen_omen": omen_result.get("chosen_omen") if omen_result else None,
                    "ui_update": {
                        "object_id": night_result.get("target"),
                    } if night_result.get("winning_move") == "sahte_iz" else None,
                }
            })

            await asyncio.sleep(3)  # Gece sahnesini gostermek icin bekle

            logger.info(f"Night phase completed — Move: {night_result.get('winning_move')}")

            # State kaydet
            _save_state(game_id, state)

            # Sonraki gune gec
            state["round_number"] = round_n + 1
            state["exiled_today"] = None
            for p in state["players"]:
                p.vote_target = None

    except Exception as e:
        import traceback
        logger.error(f"💀 GAME LOOP CRASH: {e}")
        logger.error(traceback.format_exc())

        try:
            await manager.broadcast(game_id, {
                "event": "error",
                "data": {
                    "code": "game_loop_error",
                    "message": str(e),
                }
            })
        except Exception:
            pass

    finally:
        if game_id in _player_input_queues:
            del _player_input_queues[game_id]

        if game_id in _human_interrupt_events:
            del _human_interrupt_events[game_id]

        if game_id in _running_games:
            del _running_games[game_id]

        logger.warning(f"🔴 GAME LOOP ENDED: {game_id}")


# ═══════════════════════════════════════════════════
# HELPER: Campfire Segment (WS broadcast per speech)
# ═══════════════════════════════════════════════════

async def _run_campfire_segment_ws(
    game_id: str,
    state: Any,
    max_turns: int,
    participant_names: list[str] | None,
    generate_campfire_speech,
    get_alive_players,
    find_player,
    maybe_update_campfire_summary=None,
    get_reaction=None,
    orchestrator_pick=None,
    check_moderation=None,
    check_ocak_tepki=None,
) -> None:
    """
    Campfire tartisma segmenti — prototype akisinin birebir WS versiyonu.

    Akis:
      1. Ilk konusmaci: kimse konusmadiysa random sec
      2. Her turda: diger oyunculardan tepki al → orchestrator sec → konustur
      3. Her konusma moderator'den gecer
      4. Her konusma WS ile broadcast edilir
    """
    alive = get_alive_players(state)

    if participant_names:
        participants = [p for p in alive if p.name in participant_names]
    else:
        participants = alive
        participant_names = [p.name for p in alive]

    if len(participants) < 2:
        return

    ws_dict = state.get("world_seed")
    use_orchestrator = get_reaction is not None and orchestrator_pick is not None
    turns_done = 0

    human_names = [p.name for p in participants if p.is_human]
    logger.warning(f"[CAMPFIRE] Starting segment: max_turns={max_turns}, participants={participant_names}, humans={human_names}")

    # ── Ilk konusmaci (onceki konusma yoksa random sec) ──
    recent_speeches = [m for m in state["campfire_history"]
                       if m.get("type") == "speech" and m.get("name") in participant_names]

    if not recent_speeches:
        # AI olmayan (human) ilk konusmaci olabilir
        ai_participants = [p for p in participants if not p.is_human]
        first = random_module.choice(ai_participants) if ai_participants else participants[0]

        if first.is_human:
            message = await _wait_for_human_input(
                game_id=game_id,
                player_id=first.slot_id,
                event_type="speak",
                timeout=30.0,
            )
            if not message:
                message = f"[{first.name} sessiz kaldi]"
            else:
                message = await _rewrite_human_speech(message, first, state)
        else:
            message = await generate_campfire_speech(state, first, participant_names=participant_names)

        # Moderator check
        mod_ok = True
        if check_moderation:
            mod_ok, mod_reason = await check_moderation(first.name, message, ws_dict)
            if not mod_ok:
                state["campfire_history"].append({
                    "type": "moderator", "content": mod_reason,
                    "present": list(participant_names),
                })
                await manager.broadcast(game_id, {
                    "event": "moderator_warning",
                    "data": {"speaker": first.name, "reason": mod_reason}
                })

        if mod_ok:
            state["campfire_history"].append({
                "type": "speech", "name": first.name,
                "role_title": first.role_title, "content": message,
                "present": list(participant_names),
            })
            first.add_message("assistant", message)

            # TTS senkron — text + audio birlikte gonder (herkes icin)
            audio_url, audio_duration = await _generate_audio_url(
                message, voice=getattr(first, 'voice_id', 'alloy'),
                speed=getattr(first, 'voice_speed', 1.0),
            )

            await manager.broadcast(game_id, {
                "event": "campfire_speech",
                "data": {
                    "speaker": first.name,
                    "role_title": first.role_title,
                    "content": message,
                    "turn": 1,
                    "max_turns": max_turns,
                    "participants": participant_names,
                    "audio_url": audio_url,
                    "audio_duration": audio_duration,
                }
            })

            # Audio suresi kadar bekle — interruptible (human aninda soz alabilsin)
            wait_time = min(max(audio_duration * 0.95, 2.0), 10.0) if audio_duration > 0 else 2.0
            interrupted = await _interruptible_sleep(game_id, wait_time)
            if interrupted:
                logger.warning(f"[INTERRUPT] Sleep interrupted by human input (first speaker)")

            # Human interjection check — ilk konusma sonrasi
            human_p = next((p for p in participants if p.is_human), None)
            if human_p and not first.is_human:
                interjected = await _process_human_interjection(
                    game_id, state, human_p, participant_names, 1, max_turns,
                )
                if interjected:
                    turns_done += 1

            # Ocak Tepki kontrolu (Katman 1+2)
            if check_ocak_tepki:
                try:
                    tepki = await check_ocak_tepki(first.name, message, state)
                    if tepki:
                        state["campfire_history"].append({
                            "type": "narrator",
                            "content": tepki["message"],
                        })
                        await manager.broadcast(game_id, {
                            "event": "ocak_tepki",
                            "data": tepki,
                        })
                        # Kul Kaymasi ise ozel flash broadcast
                        if tepki.get("type") == "kul_kaymasi":
                            await manager.broadcast(game_id, {
                                "event": "kul_kaymasi",
                                "data": {
                                    "speaker": tepki["speaker"],
                                    "question": tepki.get("forced_question", ""),
                                },
                            })
                except Exception as e:
                    logger.warning(f"Ocak tepki check failed: {e}")

        turns_done = 1

    # ── Sonraki turlar: orchestrator ile konusmaci sec ──
    while turns_done < max_turns:
        turns_done += 1

        last_speeches = [m for m in state["campfire_history"]
                         if m.get("type") == "speech" and m.get("name") in participant_names]
        if not last_speeches:
            break
        last_speech = last_speeches[-1]

        # Konusmaci secimi
        if use_orchestrator:
            # Prototype akisi: tepki topla → orchestrator sec
            others = [p for p in participants
                      if p.name != last_speech["name"] and not p.is_human]

            if others:
                import asyncio as _aio
                reaction_tasks = [get_reaction(p, last_speech, state) for p in others]
                reactions = list(await _aio.gather(*reaction_tasks))
            else:
                reactions = []

            # Insan oyuncular icin otomatik "WANT" ekle (her zaman konusma hakki var)
            human_participants = []
            for p in participants:
                if p.is_human and p.name != last_speech["name"]:
                    reactions.append({"name": p.name, "wants": True, "reason": "insan oyuncu — oncelikli"})
                    human_participants.append(p)

            # Check if human player hasn't spoken recently — force their turn every 3rd turn
            force_human = False
            if human_participants:
                human_name = human_participants[0].name
                recent_speakers = [m["name"] for m in state["campfire_history"][-3:]
                                   if m.get("type") == "speech"]
                if human_name not in recent_speakers and turns_done % 3 == 0:
                    force_human = True
                    logger.info(f"Forcing human turn for {human_name} (hasn't spoken in 3 turns)")

            if force_human:
                action, name = "NEXT", human_participants[0].name
            else:
                action, name = await orchestrator_pick(state, reactions)

            if action == "END":
                break

            # Secilen kisi participant olmali
            if name not in participant_names:
                wanters = [r for r in reactions if r["wants"] and r["name"] in participant_names]
                if wanters:
                    name = wanters[0]["name"]
                else:
                    break

            speaker = find_player(state, name)
            if not speaker or not speaker.alive:
                continue
        else:
            # Fallback: round-robin
            speaker = participants[turns_done % len(participants)]

        # Konusma uret
        logger.warning(f"[CAMPFIRE] Turn {turns_done}/{max_turns}: speaker={speaker.name} is_human={speaker.is_human}")
        if speaker.is_human:
            message = await _wait_for_human_input(
                game_id=game_id,
                player_id=speaker.slot_id,
                event_type="speak",
                timeout=30.0,
            )
            if not message:
                message = f"[{speaker.name} sessiz kaldi]"
            else:
                logger.warning(f"[CAMPFIRE] Human: '{message[:80]}' → TTS direkt")
        else:
            message, gen_cancelled = await _race_ai_generation(
                game_id,
                generate_campfire_speech(state, speaker, participant_names=participant_names),
            )
            if gen_cancelled:
                logger.warning(f"[INTERRUPT] AI generation cancelled (campfire loop)")
                human_p = next((p for p in participants if p.is_human), None)
                if human_p:
                    await _process_human_interjection(
                        game_id, state, human_p, participant_names, turns_done, max_turns,
                    )
                continue

        # Moderator check
        mod_ok = True
        if check_moderation:
            mod_ok, mod_reason = await check_moderation(speaker.name, message, ws_dict)
            if not mod_ok:
                state["campfire_history"].append({
                    "type": "moderator", "content": mod_reason,
                    "present": list(participant_names),
                })
                await manager.broadcast(game_id, {
                    "event": "moderator_warning",
                    "data": {"speaker": speaker.name, "reason": mod_reason}
                })
                continue  # Bu tur sayilmaz, tekrar dene

        # History'ye ekle
        state["campfire_history"].append({
            "type": "speech", "name": speaker.name,
            "role_title": speaker.role_title, "content": message,
            "present": list(participant_names),
        })
        speaker.add_message("assistant", message)

        # TTS senkron — text + audio birlikte gonder (herkes icin)
        audio_url, audio_duration = await _generate_audio_url(
            message, voice=getattr(speaker, 'voice_id', 'alloy'),
            speed=getattr(speaker, 'voice_speed', 1.0),
        )

        # Broadcast text + audio together
        await manager.broadcast(game_id, {
            "event": "campfire_speech",
            "data": {
                "speaker": speaker.name,
                "role_title": speaker.role_title,
                "content": message,
                "turn": turns_done,
                "max_turns": max_turns,
                "participants": participant_names,
                "audio_url": audio_url,
                "audio_duration": audio_duration,
            }
        })

        # Audio suresi kadar bekle — interruptible (human aninda soz alabilsin)
        wait_time = min(max(audio_duration * 0.95, 2.0), 10.0) if audio_duration > 0 else 2.0
        interrupted = await _interruptible_sleep(game_id, wait_time)
        if interrupted:
            logger.warning(f"[INTERRUPT] Sleep interrupted by human input (campfire loop)")

        # ── Human interjection check — her AI konusmasindan sonra ──
        if not speaker.is_human:
            human_p = next((p for p in participants if p.is_human), None)
            if human_p:
                interjected = await _process_human_interjection(
                    game_id, state, human_p, participant_names, turns_done, max_turns,
                )
                if interjected:
                    turns_done += 1

        # Ocak Tepki kontrolu (Katman 1+2)
        if check_ocak_tepki:
            try:
                tepki = await check_ocak_tepki(speaker.name, message, state)
                if tepki:
                    state["campfire_history"].append({
                        "type": "narrator",
                        "content": tepki["message"],
                    })
                    await manager.broadcast(game_id, {
                        "event": "ocak_tepki",
                        "data": tepki,
                    })
                    # Kul Kaymasi ise ozel flash broadcast
                    if tepki.get("type") == "kul_kaymasi":
                        await manager.broadcast(game_id, {
                            "event": "kul_kaymasi",
                            "data": {
                                "speaker": tepki["speaker"],
                                "question": tepki.get("forced_question", ""),
                            },
                        })
            except Exception as e:
                logger.warning(f"Ocak tepki check failed: {e}")

        # Rolling summary guncelle
        if maybe_update_campfire_summary:
            await maybe_update_campfire_summary(state)

    logger.info(f"Campfire segment done: {turns_done} turns, {len(participants)} participants")


# ═══════════════════════════════════════════════════
# HELPER: Room Conversation (1v1, unicast)
# ═══════════════════════════════════════════════════

async def _run_room_conversation_ws(
    game_id: str,
    state: Any,
    owner: Any,
    visitor: Any,
    max_exchanges: int,
    generate_1v1_speech,
    generate_house_entry_event=None,
) -> None:
    """
    1v1 oda gorusmesi — her exchange ilgili 2 oyuncuya unicast edilir.
    """
    import uuid
    
    campfire_summary = state.get("campfire_rolling_summary", "") or "(Ozet yok)"
    visit_id = uuid.uuid4().hex  # Benzersiz ziyaret ID'si

    exchanges = []
    speakers = [visitor, owner]  # Misafir once konusur

    # Gorusme basladigini bildir (broadcast — spectator dahil herkes gorur)
    logger.info(f"🏠 Room visit START: {visitor.name} → {owner.name} (broadcast)")
    await manager.broadcast(game_id, {
        "event": "house_visit_start",
        "data": {
            "visit_id": visit_id,
            "visitor": visitor.name,
            "host": owner.name,
            "max_exchanges": max_exchanges,
        }
    })

    # ── HOUSE ENTRY EVENT (Katman 4) ──
    try:
        if generate_house_entry_event is None:
            raise ValueError("generate_house_entry_event not passed")
        entry_event = await generate_house_entry_event(state, visitor.name, owner.name)
        if entry_event:
            await manager.broadcast(game_id, {
                "event": "house_entry_event",
                "data": {"content": entry_event, "visitor": visitor.name, "host": owner.name},
            })
    except Exception as e:
        logger.warning(f"House entry event failed: {e}")

    for turn in range(max_exchanges):
        current = speakers[turn % 2]
        opponent = speakers[(turn + 1) % 2]

        # Insan oyuncu ise WS'den bekle
        if current.is_human:
            speech_content = await _wait_for_human_input(
                game_id=game_id,
                player_id=current.slot_id,
                event_type="visit_speak",
                timeout=30.0,
            )
            if not speech_content:
                speech_content = f"[{current.name} sessiz kaldi]"
            else:
                speech_content = await _rewrite_human_speech(speech_content, current, state)
        else:
            speech_content, gen_cancelled = await _race_ai_generation(
                game_id,
                generate_1v1_speech(state, current, opponent, exchanges, campfire_summary),
            )
            if gen_cancelled:
                logger.warning(f"[INTERRUPT] AI generation cancelled (room visit)")
                # Human interrupted during AI generation — skip rest, interjection handled after sleep
                human_in_visit = next((p for p in [visitor, owner] if p.is_human), None)
                if human_in_visit:
                    hq = get_input_queue(game_id, human_in_visit.slot_id)
                    found_data = None
                    stashed = []
                    while True:
                        try:
                            item = hq.get_nowait()
                        except asyncio.QueueEmpty:
                            break
                        if item.get("content") and item.get("event") in ("visit_speak", "speak"):
                            found_data = item
                            break
                        else:
                            stashed.append(item)
                    for item in stashed:
                        await hq.put(item)
                    if found_data:
                        h_content = found_data["content"]
                        h_msg = await _rewrite_human_speech(h_content, human_in_visit, state)
                        exchanges.append({"speaker": human_in_visit.name, "role_title": human_in_visit.role_title, "content": h_msg})
                        human_in_visit.add_message("assistant", h_msg)
                        h_audio_url, h_audio_dur = await _generate_audio_url(
                            h_msg, voice=getattr(human_in_visit, 'voice_id', 'alloy'),
                            speed=getattr(human_in_visit, 'voice_speed', 1.0),
                        )
                        await manager.broadcast(game_id, {
                            "event": "house_visit_exchange",
                            "data": {
                                "visit_id": visit_id,
                                "speaker": human_in_visit.name,
                                "role_title": human_in_visit.role_title,
                                "content": h_msg,
                                "turn": turn + 1,
                                "max_exchanges": max_exchanges,
                                "visitor": visitor.name,
                                "host": owner.name,
                                "audio_url": h_audio_url,
                                "audio_duration": h_audio_dur,
                                "context": f"visit:{owner.name}:{visitor.name}",
                            }
                        })
                continue

        exchange_entry = {
            "speaker": current.name,
            "role_title": current.role_title,
            "content": speech_content,
        }
        exchanges.append(exchange_entry)
        current.add_message("assistant", speech_content)

        # TTS senkron — text + audio birlikte gonder (herkes icin)
        audio_url, audio_duration = await _generate_audio_url(
            speech_content, voice=getattr(current, 'voice_id', 'alloy'),
            speed=getattr(current, 'voice_speed', 1.0),
        )

        visit_context = f"visit:{owner.name}:{visitor.name}"

        # Broadcast: herkes gorur (spectator dahil), audio dahil
        await manager.broadcast(game_id, {
            "event": "house_visit_exchange",
            "data": {
                "visit_id": visit_id,
                "speaker": current.name,
                "role_title": current.role_title,
                "content": speech_content,
                "turn": turn + 1,
                "max_exchanges": max_exchanges,
                "visitor": visitor.name,
                "host": owner.name,
                "audio_url": audio_url,
                "audio_duration": audio_duration,
                "context": visit_context,
            }
        })

        # Audio suresi kadar bekle — interruptible (human aninda soz alabilsin)
        wait_time = min(max(audio_duration * 0.95, 2.0), 10.0) if audio_duration > 0 else 2.0
        interrupted = await _interruptible_sleep(game_id, wait_time)
        if interrupted:
            logger.warning(f"[INTERRUPT] Sleep interrupted by human input (room visit)")

        # ── Human interjection check — 1v1 gorusme ──
        human_in_visit = next((p for p in [visitor, owner] if p.is_human), None)
        if human_in_visit and not current.is_human:
            hq = get_input_queue(game_id, human_in_visit.slot_id)
            # Drain queue for matching event, re-queue non-matching
            found_visit_data = None
            stashed_visit = []
            while True:
                try:
                    input_data = hq.get_nowait()
                except asyncio.QueueEmpty:
                    break
                if input_data.get("content") and input_data.get("event") in ("visit_speak", "speak"):
                    found_visit_data = input_data
                    break
                else:
                    stashed_visit.append(input_data)
            for item in stashed_visit:
                await hq.put(item)

            if found_visit_data:
                h_content = found_visit_data["content"]
                logger.warning(f"[VISIT-INTERJECT] Human interjection: '{h_content[:50]}'")
                h_msg = await _rewrite_human_speech(h_content, human_in_visit, state)
                h_entry = {"speaker": human_in_visit.name, "role_title": human_in_visit.role_title, "content": h_msg}
                exchanges.append(h_entry)
                human_in_visit.add_message("assistant", h_msg)
                h_audio_url, h_audio_dur = await _generate_audio_url(
                    h_msg, voice=getattr(human_in_visit, 'voice_id', 'alloy'),
                    speed=getattr(human_in_visit, 'voice_speed', 1.0),
                )
                await manager.broadcast(game_id, {
                    "event": "house_visit_exchange",
                    "data": {
                        "visit_id": visit_id,
                        "speaker": human_in_visit.name,
                        "role_title": human_in_visit.role_title,
                        "content": h_msg,
                        "turn": turn + 1,
                        "max_exchanges": max_exchanges,
                        "visitor": visitor.name,
                        "host": owner.name,
                        "audio_url": h_audio_url,
                        "audio_duration": h_audio_dur,
                        "context": visit_context,
                    }
                })
                h_wait = min(max(h_audio_dur * 0.95, 2.0), 10.0) if h_audio_dur > 0 else 2.0
                await _interruptible_sleep(game_id, h_wait)

    # Visit data kaydet
    visit_data = {
        "type": "room_visit",
        "visit_id": visit_id,
        "owner": owner.name,
        "visitor": visitor.name,
        "exchanges": exchanges,
    }
    state["house_visits"].append(visit_data)

    # Gorusme bitti (broadcast)
    await manager.broadcast(game_id, {
        "event": "house_visit_end",
        "data": {
            "visit_id": visit_id,
            "visitor": visitor.name,
            "host": owner.name,
            "exchange_count": len(exchanges),
        }
    })

    logger.info(f"Room visit done: {visitor.name} -> {owner.name} ({len(exchanges)} exchanges)")


# ═══════════════════════════════════════════════════
# HELPER: Institution Visit (Katman 2)
# ═══════════════════════════════════════════════════

async def _run_institution_visit_ws(
    game_id: str,
    state: Any,
    player: Any,
    location_id: str,
    generate_institution_scene,
    generate_private_mini_event,
) -> None:
    """
    Kurum lokasyonu ziyareti — sahne uret, UI guncelle, broadcast et.
    """
    # Baslangic bildir
    await manager.send_to(game_id, player.slot_id, {
        "event": "institution_visit_start",
        "data": {
            "player": player.name,
            "location_id": location_id,
        }
    })

    # Sahne uret
    try:
        scene_result = await generate_institution_scene(player, location_id, state)
        narrative = scene_result.get("narrative", "")
        ui_update = scene_result.get("ui_update")

        # UI update varsa broadcast et
        if ui_update and isinstance(ui_update, dict):
            await manager.broadcast(game_id, {
                "event": "ui_object_update",
                "data": ui_update,
            })

        # Sahne narrative gonder
        await manager.send_to(game_id, player.slot_id, {
            "event": "institution_visit_scene",
            "data": {
                "player": player.name,
                "location_id": location_id,
                "narrative": narrative,
            }
        })

        # TTS fire-and-forget (institution visits are less critical for sync)
        if narrative:
            asyncio.create_task(_generate_and_broadcast_audio(
                game_id, "Anlatici", narrative, context=f"institution:{location_id}"
            ))

        # Ozel mini event kontrolu
        try:
            private_event = await generate_private_mini_event(player, location_id, state)
            if private_event:
                await manager.send_to(game_id, player.slot_id, {
                    "event": "mini_event",
                    "data": private_event,
                })
        except Exception as e:
            logger.warning(f"Private mini event failed: {e}")

    except Exception as e:
        logger.warning(f"Institution scene generation failed: {e}")

    # Bitis bildir
    await manager.send_to(game_id, player.slot_id, {
        "event": "institution_visit_end",
        "data": {
            "player": player.name,
            "location_id": location_id,
        }
    })

    logger.info(f"Institution visit done: {player.name} -> {location_id}")


# ═══════════════════════════════════════════════════════════════
# FLUID FREE PHASE — Session Manager, Persistent Campfire & Loop
# ═══════════════════════════════════════════════════════════════


class _FluidSessionManager:
    """Tracks player states during the Fluid Free Phase.

    Player states
    ─────────────
      IDLE        – not in any session, eligible for a new location decision
      CAMPFIRE    – participating in the persistent campfire
      ROOM:<tag>  – in a 1-on-1 room conversation
      INST:<loc>  – visiting an institution
    """

    def __init__(self, alive_names: list[str]):
        self._lock = asyncio.Lock()
        self._states: dict[str, str] = {n: "IDLE" for n in alive_names}
        self._campfire_set: set[str] = set()
        self._cf_turn_counts: dict[str, int] = {}
        self._sessions_done: int = 0
        # Events for cross-task signalling
        self._idle_event = asyncio.Event()
        self._idle_event.set()
        self._cf_changed = asyncio.Event()

    # ── state transitions ──

    async def join_campfire(self, name: str) -> None:
        async with self._lock:
            self._states[name] = "CAMPFIRE"
            self._campfire_set.add(name)
            self._cf_turn_counts.setdefault(name, 0)
            self._cf_changed.set()

    async def leave_campfire(self, name: str) -> None:
        async with self._lock:
            self._campfire_set.discard(name)
            if self._states.get(name) == "CAMPFIRE":
                self._states[name] = "IDLE"
            self._cf_changed.set()
            self._idle_event.set()

    async def enter_session(self, names: list[str], tag: str) -> None:
        async with self._lock:
            for n in names:
                self._states[n] = tag
                self._campfire_set.discard(n)
            self._cf_changed.set()

    async def finish_session(self, names: list[str]) -> None:
        async with self._lock:
            for n in names:
                self._states[n] = "IDLE"
                self._campfire_set.discard(n)
            self._sessions_done += 1
            self._idle_event.set()

    async def record_campfire_turn(self, participants: list[str]) -> None:
        async with self._lock:
            for n in participants:
                self._cf_turn_counts[n] = self._cf_turn_counts.get(n, 0) + 1

    async def reset_campfire_turns(self, name: str) -> None:
        async with self._lock:
            self._cf_turn_counts[name] = 0

    # ── queries ──

    async def get_idle(self) -> list[str]:
        async with self._lock:
            return [n for n, s in self._states.items() if s == "IDLE"]

    async def get_campfire_participants(self) -> list[str]:
        async with self._lock:
            return list(self._campfire_set)

    async def get_campfire_veterans(self, threshold: int) -> list[str]:
        async with self._lock:
            return [
                n for n in self._campfire_set
                if self._cf_turn_counts.get(n, 0) >= threshold
            ]

    async def player_state(self, name: str) -> str:
        async with self._lock:
            return self._states.get(name, "IDLE")

    @property
    def sessions_done(self) -> int:
        return self._sessions_done

    # ── wait helpers ──

    async def wait_for_idle(self, timeout: float = 2.0) -> None:
        self._idle_event.clear()
        try:
            await asyncio.wait_for(self._idle_event.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass

    async def wait_for_cf_change(self, timeout: float = 3.0) -> None:
        self._cf_changed.clear()
        try:
            await asyncio.wait_for(self._cf_changed.wait(), timeout=timeout)
        except asyncio.TimeoutError:
            pass


# ───────────────────────────────────────────────────
# Persistent Campfire — runs continuously,
# players join / leave dynamically between turns
# ───────────────────────────────────────────────────

async def _run_persistent_campfire_ws(
    game_id: str,
    state: Any,
    sm: _FluidSessionManager,
    phase_done: asyncio.Event,
    state_lock: asyncio.Lock,
    max_total_turns: int,
    veteran_threshold: int,
    # engine functions
    generate_campfire_speech,
    get_alive_players,
    find_player,
    maybe_update_campfire_summary=None,
    get_reaction=None,
    orchestrator_pick=None,
    check_moderation=None,
    check_ocak_tepki=None,
) -> None:
    """Persistent campfire that runs until *phase_done* is set or the turn budget
    is exhausted.  Participants are re-evaluated each turn so players can join or
    leave between turns."""

    ws_dict = state.get("world_seed")
    use_orchestrator = get_reaction is not None and orchestrator_pick is not None
    total_turns = 0

    while not phase_done.is_set() and total_turns < max_total_turns:
        # ── refresh participant list every turn ──
        participant_names = await sm.get_campfire_participants()

        if len(participant_names) < 2:
            # Wait for more people (or phase end)
            await sm.wait_for_cf_change(timeout=3.0)
            continue

        participants = [find_player(state, n) for n in participant_names]
        participants = [p for p in participants if p and p.alive]
        participant_names = [p.name for p in participants]

        if len(participants) < 2:
            await asyncio.sleep(1)
            continue

        total_turns += 1

        # ── pick speaker ──
        speaker = None
        recent_speeches = [
            m for m in state["campfire_history"]
            if m.get("type") == "speech" and m.get("name") in participant_names
        ]

        if use_orchestrator and recent_speeches:
            last_speech = recent_speeches[-1]
            others = [p for p in participants
                      if p.name != last_speech["name"] and not p.is_human]

            reactions = []
            if others:
                reaction_tasks = [get_reaction(p, last_speech, state) for p in others]
                raw = await asyncio.gather(*reaction_tasks, return_exceptions=True)
                reactions = [r for r in raw if isinstance(r, dict)]

            # humans always eligible
            for p in participants:
                if p.is_human and p.name != last_speech["name"]:
                    reactions.append({"name": p.name, "wants": True, "reason": "insan oyuncu"})

            # force human every 3rd turn
            human_parts = [p for p in participants
                           if p.is_human and p.name != last_speech["name"]]
            force_human = False
            if human_parts:
                h_name = human_parts[0].name
                recent_speakers = [
                    m["name"] for m in state["campfire_history"][-3:]
                    if m.get("type") == "speech"
                ]
                if h_name not in recent_speakers and total_turns % 3 == 0:
                    force_human = True

            if force_human:
                action, name = "NEXT", human_parts[0].name
            else:
                action, name = await orchestrator_pick(state, reactions)

            if action == "END":
                # orchestrator says stop — skip turn, don't break the loop
                await asyncio.sleep(1)
                continue

            if name in participant_names:
                speaker = find_player(state, name)
            else:
                wanters = [r for r in reactions
                           if r.get("wants") and r["name"] in participant_names]
                if wanters:
                    speaker = find_player(state, wanters[0]["name"])

        if not speaker:
            ai_parts = [p for p in participants if not p.is_human]
            speaker = random_module.choice(ai_parts) if ai_parts else participants[0]

        if not speaker or not speaker.alive:
            continue

        # ── generate speech ──
        logger.warning(f"[PERSISTENT-CF] Turn {total_turns}: speaker={speaker.name} is_human={speaker.is_human}")
        if speaker.is_human:
            message = await _wait_for_human_input(
                game_id=game_id,
                player_id=speaker.slot_id,
                event_type="speak",
                timeout=30.0,
            )
            if not message:
                message = f"[{speaker.name} sessiz kaldi]"
            else:
                logger.warning(f"[PERSISTENT-CF] Human: '{message[:80]}' → TTS direkt")
        else:
            message, gen_cancelled = await _race_ai_generation(
                game_id,
                generate_campfire_speech(state, speaker, participant_names=participant_names),
            )
            if gen_cancelled:
                logger.warning(f"[INTERRUPT] AI generation cancelled (persistent campfire)")
                human_p = next((p for p in participants if p.is_human), None)
                if human_p:
                    await _process_human_interjection(
                        game_id, state, human_p, participant_names, total_turns, max_total_turns,
                    )
                continue

        # moderator
        mod_ok = True
        if check_moderation:
            mod_ok, mod_reason = await check_moderation(speaker.name, message, ws_dict)
            if not mod_ok:
                async with state_lock:
                    state["campfire_history"].append({
                        "type": "moderator", "content": mod_reason,
                        "present": list(participant_names),
                    })
                await manager.broadcast(game_id, {
                    "event": "moderator_warning",
                    "data": {"speaker": speaker.name, "reason": mod_reason},
                })
                continue

        # record
        async with state_lock:
            state["campfire_history"].append({
                "type": "speech", "name": speaker.name,
                "role_title": speaker.role_title, "content": message,
                "present": list(participant_names),
            })
        speaker.add_message("assistant", message)

        # TTS senkron (herkes icin)
        audio_url, audio_duration = await _generate_audio_url(
            message,
            voice=getattr(speaker, "voice_id", "alloy"),
            speed=getattr(speaker, "voice_speed", 1.0),
        )

        await manager.broadcast(game_id, {
            "event": "campfire_speech",
            "data": {
                "speaker": speaker.name,
                "role_title": speaker.role_title,
                "content": message,
                "turn": total_turns,
                "max_turns": max_total_turns,
                "participants": participant_names,
                "audio_url": audio_url,
                "audio_duration": audio_duration,
            },
        })

        wait_time = min(max(audio_duration * 0.95, 2.0), 10.0) if audio_duration > 0 else 2.0
        interrupted = await _interruptible_sleep(game_id, wait_time)
        if interrupted:
            logger.warning(f"[INTERRUPT] Sleep interrupted by human input (persistent campfire)")

        # ── Human interjection check — persistent campfire ──
        if not speaker.is_human:
            human_p = next((p for p in participants if p.is_human), None)
            if human_p:
                interjected = await _process_human_interjection(
                    game_id, state, human_p, participant_names, total_turns, max_total_turns,
                )
                if interjected:
                    total_turns += 1

        # ocak tepki
        if check_ocak_tepki:
            try:
                tepki = await check_ocak_tepki(speaker.name, message, state)
                if tepki:
                    async with state_lock:
                        state["campfire_history"].append({
                            "type": "narrator", "content": tepki["message"],
                        })
                    await manager.broadcast(game_id, {
                        "event": "ocak_tepki", "data": tepki,
                    })
                    if tepki.get("type") == "kul_kaymasi":
                        await manager.broadcast(game_id, {
                            "event": "kul_kaymasi",
                            "data": {
                                "speaker": tepki["speaker"],
                                "question": tepki.get("forced_question", ""),
                            },
                        })
            except Exception as e:
                logger.warning(f"Persistent campfire ocak tepki failed: {e}")

        # rolling summary
        if maybe_update_campfire_summary:
            await maybe_update_campfire_summary(state)

        # track turns per participant
        await sm.record_campfire_turn(participant_names)

        # eject veterans (exceeded turn threshold → IDLE → new decision)
        veterans = await sm.get_campfire_veterans(veteran_threshold)
        for vet in veterans:
            await sm.leave_campfire(vet)
            await sm.reset_campfire_turns(vet)
            logger.info(f"Campfire veteran ejected: {vet} (after {veteran_threshold} turns)")

    logger.info(f"Persistent campfire finished: {total_turns} total turns")


# ───────────────────────────────────────────────────
# Fluid Free Phase — orchestrates all sessions
# ───────────────────────────────────────────────────

async def _run_fluid_free_phase(
    game_id: str,
    state: Any,
    state_lock: asyncio.Lock,
    # engine functions
    generate_campfire_speech,
    generate_location_decision,
    generate_1v1_speech,
    generate_institution_scene,
    generate_private_mini_event,
    generate_house_entry_event,
    get_alive_players,
    find_player,
    maybe_update_campfire_summary=None,
    get_reaction=None,
    orchestrator_pick=None,
    check_moderation=None,
    check_ocak_tepki=None,
    # constants
    free_roam_rounds: int = 3,
    campfire_turns_per_round: int = 3,
    room_exchanges: int = 4,
    institution_locations: list | None = None,
) -> None:
    """Fluid Free Phase — parallel, reactive session management.

    Instead of fixed sequential rounds, sessions run independently.
    When a room conversation ends, those players immediately get a new
    location decision without waiting for the campfire or other rooms.

    Architecture
    ────────────
    ┌─ Persistent Campfire (background task) ──────────┐
    │  Runs continuously. Players join when they choose │
    │  CAMPFIRE, leave when ejected or phase ends.      │
    └───────────────────────────────────────────────────┘
    ┌─ Decision Loop (main coroutine) ─────────────────┐
    │  Watches for IDLE players, collects decisions,    │
    │  spawns room / institution tasks.  When a task    │
    │  finishes → players → IDLE → next decision wave.  │
    └───────────────────────────────────────────────────┘
    """

    alive = get_alive_players(state)
    alive_names = [p.name for p in alive]

    # ── Session manager ──
    sm = _FluidSessionManager(alive_names)

    # ── Quotas ──
    max_campfire_turns = free_roam_rounds * campfire_turns_per_round
    max_private_sessions = free_roam_rounds * max(2, len(alive_names) // 3)
    veteran_threshold = campfire_turns_per_round  # eject after N consecutive turns

    phase_done = asyncio.Event()
    active_tasks: set[asyncio.Task] = set()
    wave_counter = 0

    valid_institution_ids = [loc["id"] for loc in (institution_locations or [])]

    # ── task helper ──
    def _spawn(coro) -> asyncio.Task:
        task = asyncio.create_task(coro)
        active_tasks.add(task)
        task.add_done_callback(active_tasks.discard)
        return task

    # ── room session wrapper ──
    async def _room_session(visitor_name: str, host_name: str) -> None:
        visitor_p = find_player(state, visitor_name)
        host_p = find_player(state, host_name)
        if visitor_p and host_p:
            try:
                await _run_room_conversation_ws(
                    game_id=game_id,
                    state=state,
                    owner=host_p,
                    visitor=visitor_p,
                    max_exchanges=room_exchanges,
                    generate_1v1_speech=generate_1v1_speech,
                    generate_house_entry_event=generate_house_entry_event,
                )
            except Exception as e:
                logger.warning(f"Room session {visitor_name}→{host_name} failed: {e}")
        await sm.finish_session([visitor_name, host_name])
        logger.info(f"Room done → {visitor_name}, {host_name} now IDLE")

    # ── institution session wrapper ──
    async def _inst_session(player_name: str, loc_id: str) -> None:
        p = find_player(state, player_name)
        if p:
            try:
                await _run_institution_visit_ws(
                    game_id=game_id,
                    state=state,
                    player=p,
                    location_id=loc_id,
                    generate_institution_scene=generate_institution_scene,
                    generate_private_mini_event=generate_private_mini_event,
                )
            except Exception as e:
                logger.warning(f"Institution visit {player_name}→{loc_id} failed: {e}")
        await sm.finish_session([player_name])

    # ─────────────────────────────────────────────
    # Decision wave: collect decisions from IDLE
    # players, correct locations, dispatch sessions
    # ─────────────────────────────────────────────
    async def _run_decision_wave(idle_names: list[str]) -> None:
        nonlocal wave_counter
        wave_counter += 1

        alive_now = get_alive_players(state)
        alive_names_now = [p.name for p in alive_now]
        idle_names = [n for n in idle_names if n in alive_names_now]
        if not idle_names:
            return

        # Build location context for the LLM prompt (who is where right now)
        locations_ctx: dict[str, str] = {}
        for n in alive_names_now:
            s = await sm.player_state(n)
            if s == "CAMPFIRE":
                locations_ctx[n] = "campfire"
            elif s.startswith("ROOM") or s.startswith("INST"):
                locations_ctx[n] = "busy"
            else:
                locations_ctx[n] = "campfire"  # IDLE shown as campfire for context

        # ── collect decisions (AI concurrent + human WS) ──
        ai_tasks: list = []
        ai_players: list = []
        human_tasks: list = []
        human_players: list = []

        for n in idle_names:
            p = find_player(state, n)
            if not p or not p.alive:
                continue
            if p.is_human:
                human_tasks.append(
                    _wait_for_human_input(
                        game_id=game_id,
                        player_id=p.slot_id,
                        event_type="location_choice",
                        timeout=30.0,
                        extra_data={"alive_players": alive_names_now},
                    )
                )
                human_players.append(p)
            else:
                ai_tasks.append(generate_location_decision(p, state, locations_ctx))
                ai_players.append(p)

        all_results = await asyncio.gather(
            asyncio.gather(*ai_tasks) if ai_tasks else asyncio.sleep(0),
            asyncio.gather(*human_tasks) if human_tasks else asyncio.sleep(0),
        )

        ai_decisions = list(all_results[0]) if ai_tasks else []
        human_choices = list(all_results[1]) if human_tasks else []

        # ── apply decisions ──
        wave_locs: dict[str, str] = {n: "campfire" for n in idle_names}

        for decision in ai_decisions:
            name = decision["name"]
            if name not in wave_locs:
                continue
            if decision["decision"] == "home":
                wave_locs[name] = "home"
            elif decision["decision"] == "visit":
                wave_locs[name] = f"visiting:{decision['target']}"
            elif decision["decision"] == "institution":
                wave_locs[name] = f"institution:{decision['target']}"
            else:
                wave_locs[name] = "campfire"

        for player, choice in zip(human_players, human_choices):
            if not choice:
                wave_locs[player.name] = "campfire"
            elif choice.upper() == "HOME":
                wave_locs[player.name] = "home"
            elif choice.upper().startswith("VISIT") and "|" in choice:
                target = choice.split("|", 1)[1].strip()
                if target in alive_names_now and target != player.name:
                    wave_locs[player.name] = f"visiting:{target}"
                else:
                    wave_locs[player.name] = "campfire"
            elif choice.upper().startswith("INSTITUTION") and "|" in choice:
                loc_id = choice.split("|", 1)[1].strip().lower()
                if loc_id in valid_institution_ids:
                    wave_locs[player.name] = f"institution:{loc_id}"
                else:
                    wave_locs[player.name] = "campfire"
            else:
                wave_locs[player.name] = "campfire"

        # ── location corrections ──
        # 1) Visitor target must be "home" in THIS wave
        for name, loc in list(wave_locs.items()):
            if loc.startswith("visiting:"):
                target = loc.split(":")[1]
                if wave_locs.get(target) != "home":
                    wave_locs[name] = "campfire"

        # 2) Max 1 visitor per home
        visited_homes: set[str] = set()
        for name, loc in list(wave_locs.items()):
            if loc.startswith("visiting:"):
                target = loc.split(":")[1]
                if target in visited_homes:
                    wave_locs[name] = "campfire"
                else:
                    visited_homes.add(target)

        # 3) Minimum visit enforcement (keep gameplay dynamic)
        actual_visits = [
            (n, l.split(":")[1]) for n, l in wave_locs.items()
            if l.startswith("visiting:")
        ]
        campfire_pool = [n for n, l in wave_locs.items() if l == "campfire"]
        home_pool = [n for n, l in wave_locs.items() if l == "home"]
        available_homes = [h for h in home_pool if h not in visited_homes]

        target_visit_count = max(1, len(idle_names) // 3)
        while len(actual_visits) < target_visit_count and len(campfire_pool) >= 2:
            if available_homes:
                target_home = random_module.choice(available_homes)
                vis = random_module.choice(campfire_pool)
                wave_locs[vis] = f"visiting:{target_home}"
                campfire_pool.remove(vis)
                available_homes.remove(target_home)
                visited_homes.add(target_home)
                actual_visits.append((vis, target_home))
            else:
                pair = random_module.sample(campfire_pool, 2)
                wave_locs[pair[0]] = "home"
                wave_locs[pair[1]] = f"visiting:{pair[0]}"
                campfire_pool.remove(pair[0])
                campfire_pool.remove(pair[1])
                visited_homes.add(pair[0])
                actual_visits.append((pair[1], pair[0]))
            actual_visits = [
                (n, l.split(":")[1]) for n, l in wave_locs.items()
                if l.startswith("visiting:")
            ]

        # ── compute final groups ──
        campfire_people = [n for n, l in wave_locs.items() if l == "campfire"]
        home_people = [n for n, l in wave_locs.items() if l == "home"]
        visits = [
            (n, l.split(":")[1]) for n, l in wave_locs.items()
            if l.startswith("visiting:")
        ]
        institution_visits = [
            (n, l.split(":")[1]) for n, l in wave_locs.items()
            if l.startswith("institution:")
        ]

        logger.info(
            f"Wave {wave_counter}: campfire={campfire_people}, "
            f"home={home_people}, visits={visits}, inst={institution_visits}"
        )

        # ── broadcast decisions ──
        decisions_data = []
        for name in idle_names:
            loc = wave_locs.get(name, "campfire")
            if loc == "campfire":
                decisions_data.append({"player": name, "choice": "CAMPFIRE"})
            elif loc == "home":
                decisions_data.append({"player": name, "choice": "HOME"})
            elif loc.startswith("visiting:"):
                target = loc.split(":")[1]
                decisions_data.append({"player": name, "choice": f"VISIT|{target}"})
            elif loc.startswith("institution:"):
                lid = loc.split(":")[1]
                decisions_data.append({"player": name, "choice": f"INSTITUTION|{lid}"})

        # Merge with existing campfire for the broadcast
        existing_cf = await sm.get_campfire_participants()
        combined_campfire = list(set(existing_cf + campfire_people))

        await manager.broadcast(game_id, {
            "event": "location_decisions",
            "data": {
                "roam_round": wave_counter,
                "decisions": decisions_data,
                "campfire_people": combined_campfire,
                "home_people": home_people,
                "visits": [{"visitor": v, "host": h} for v, h in visits],
                "institution_visits": [
                    {"player": p, "location": l} for p, l in institution_visits
                ],
            },
        })

        # narrator movement
        gone_count = len(home_people) + len(visits) + len(institution_visits)
        if gone_count > 0:
            movement_msg = (
                f"Serbest dolasim: {gone_count} kisi ates basindan ayrildi. "
                f"Geriye kalanlar burada konusmaya devam ediyor."
            )
            async with state_lock:
                state["campfire_history"].append({
                    "type": "narrator",
                    "content": movement_msg,
                    "present": combined_campfire,
                })

        # ── dispatch sessions ──
        for n in campfire_people:
            await sm.join_campfire(n)

        for visitor_name, host_name in visits:
            await sm.enter_session(
                [visitor_name, host_name],
                f"ROOM:{visitor_name}:{host_name}",
            )
            _spawn(_room_session(visitor_name, host_name))

        for p_name, loc_id in institution_visits:
            await sm.enter_session([p_name], f"INST:{loc_id}")
            _spawn(_inst_session(p_name, loc_id))

        # home people without a visitor → immediately IDLE again
        for n in home_people:
            has_visitor = any(hn == n for _, hn in visits)
            if not has_visitor:
                p = find_player(state, n)
                if p:
                    await manager.send_to(game_id, p.slot_id, {
                        "event": "home_alone",
                        "data": {
                            "message": f"{n} evinde yalniz bekledi — kimse gelmedi.",
                        },
                    })
                await sm.finish_session([n])

    # ═════════════════════════════════════════════════
    # Start the two concurrent engines
    # ═════════════════════════════════════════════════

    # 1) Persistent campfire (background)
    campfire_task = _spawn(
        _run_persistent_campfire_ws(
            game_id=game_id,
            state=state,
            sm=sm,
            phase_done=phase_done,
            state_lock=state_lock,
            max_total_turns=max_campfire_turns,
            veteran_threshold=veteran_threshold,
            generate_campfire_speech=generate_campfire_speech,
            get_alive_players=get_alive_players,
            find_player=find_player,
            maybe_update_campfire_summary=maybe_update_campfire_summary,
            get_reaction=get_reaction,
            orchestrator_pick=orchestrator_pick,
            check_moderation=check_moderation,
            check_ocak_tepki=check_ocak_tepki,
        )
    )

    # 2) Decision dispatch loop (main coroutine)
    try:
        # Wave 0: all players start IDLE — collect initial decisions
        await _run_decision_wave(alive_names)

        while not phase_done.is_set():
            # Quota check
            if sm.sessions_done >= max_private_sessions:
                logger.info(
                    f"Private session quota reached "
                    f"({sm.sessions_done}/{max_private_sessions})"
                )
                phase_done.set()
                break

            # Wait for idle players (sessions finishing triggers this)
            idle = await sm.get_idle()
            if not idle:
                await sm.wait_for_idle(timeout=3.0)
                continue

            # New decision wave for the freshly idle players
            await _run_decision_wave(idle)

    except Exception as e:
        logger.error(f"Fluid free phase decision loop error: {e}")
    finally:
        phase_done.set()

    # ── cleanup: drain active tasks ──
    if active_tasks:
        done, pending = await asyncio.wait(active_tasks, timeout=30.0)
        for t in pending:
            t.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

    logger.info(
        f"Fluid free phase done: {wave_counter} waves, "
        f"{sm.sessions_done} private sessions completed"
    )
