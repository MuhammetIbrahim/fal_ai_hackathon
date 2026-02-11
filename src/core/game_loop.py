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

async def _generate_and_broadcast_audio(
    game_id: str,
    speaker: str,
    content: str,
    target_player_id: str | None = None,
) -> None:
    """TTS uret, audio URL'yi WS event olarak gonder. Hata olursa sessizce logla."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
        from fal_services import tts_generate
        result = await tts_generate(content)
        event = {
            "event": "speech_audio",
            "data": {
                "speaker": speaker,
                "audio_url": result.audio_url,
                "duration": result.audio_duration_sec,
            }
        }
        if target_player_id:
            await manager.send_to(game_id, target_player_id, event)
        else:
            await manager.broadcast(game_id, event)
    except Exception as e:
        logger.warning(f"TTS failed for {speaker}: {e}")


# ═══════════════════════════════════════════════════
# GLOBAL: Game-Specific Input Queues
# ═══════════════════════════════════════════════════

# game_id → player_id → Queue
_player_input_queues: Dict[str, Dict[str, asyncio.Queue]] = {}

# Running game tasks
_running_games: Dict[str, asyncio.Task] = {}


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

async def _wait_for_human_input(
    game_id: str,
    player_id: str,
    event_type: str,
    timeout: float = 60.0,
    extra_data: dict | None = None,
) -> str | None:
    """Insan oyuncudan input bekle (WebSocket ile)."""
    queue = get_input_queue(game_id, player_id)

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

    logger.info(f"Waiting for {event_type} from {player_id} (timeout: {timeout}s)")

    try:
        input_data = await asyncio.wait_for(queue.get(), timeout=timeout)

        if input_data.get("event") == event_type:
            content = input_data.get("content") or input_data.get("target") or input_data.get("choice")
            logger.info(f"Received {event_type} from {player_id}")
            return content
        else:
            logger.warning(f"Wrong event type from {player_id}: {input_data.get('event')}")
            return None

    except asyncio.TimeoutError:
        logger.warning(f"Timeout: {player_id} did not respond to {event_type}")
        return None


# ═══════════════════════════════════════════════════
# MAIN: Game Loop Runner
# ═══════════════════════════════════════════════════

async def _game_loop_runner(game_id: str, state: Any):
    """
    Asenkron game loop — Prototype akisini adim adim WS broadcast ile calistirir.
    """
    logger.info(f"Game loop starting: {game_id}")

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
            INITIAL_CAMPFIRE_TURNS, FREE_ROAM_ROUNDS,
            CAMPFIRE_TURNS_PER_ROUND, CLOSING_CAMPFIRE_TURNS,
            ROOM_EXCHANGES,
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

            # ═══════════════════════════════════════
            # 2. SERBEST DOLASIM FAZI (Free Phase)
            # ═══════════════════════════════════════
            state["phase"] = Phase.CAMPFIRE.value

            # ── 2a. OPENING CAMPFIRE ──
            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "campfire_open",
                    "round": round_n,
                    "segment": "opening",
                    "max_turns": INITIAL_CAMPFIRE_TURNS,
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
            )

            logger.info(f"Opening campfire completed — {INITIAL_CAMPFIRE_TURNS} turns")

            # ── 2b. FREE ROAM ROUNDS ──
            for roam_round in range(1, FREE_ROAM_ROUNDS + 1):
                alive = get_alive_players(state)
                alive_names = [p.name for p in alive]

                await manager.broadcast(game_id, {
                    "event": "free_roam_start",
                    "data": {
                        "round": round_n,
                        "roam_round": roam_round,
                        "total_roam_rounds": FREE_ROAM_ROUNDS,
                    }
                })

                # Konum kararlari
                locations: dict[str, str] = {n: "campfire" for n in alive_names}

                # AI oyuncular concurrent karar verir
                ai_tasks = []
                ai_players = []
                for p in alive:
                    if p.is_human:
                        pass  # Insanlar WS'den beklenecek
                    else:
                        ai_tasks.append(generate_location_decision(p, state, locations))
                        ai_players.append(p)

                # Insan oyunculardan konum karari bekle (paralel)
                human_tasks = []
                human_players = []
                for p in alive:
                    if p.is_human:
                        human_tasks.append(
                            _wait_for_human_input(
                                game_id=game_id,
                                player_id=p.slot_id,
                                event_type="location_choice",
                                timeout=30.0,
                                extra_data={"alive_players": alive_names},
                            )
                        )
                        human_players.append(p)

                # Hepsini paralel calistir
                all_results = await asyncio.gather(
                    asyncio.gather(*ai_tasks) if ai_tasks else asyncio.sleep(0),
                    asyncio.gather(*human_tasks) if human_tasks else asyncio.sleep(0),
                )

                ai_decisions = list(all_results[0]) if ai_tasks else []
                human_choices = list(all_results[1]) if human_tasks else []

                # AI kararlarini uygula
                for decision in ai_decisions:
                    name = decision["name"]
                    if decision["decision"] == "home":
                        locations[name] = "home"
                    elif decision["decision"] == "visit":
                        locations[name] = f"visiting:{decision['target']}"
                    else:
                        locations[name] = "campfire"

                # Insan kararlarini uygula
                for player, choice in zip(human_players, human_choices):
                    if not choice:
                        locations[player.name] = "campfire"
                    elif choice.upper() == "HOME":
                        locations[player.name] = "home"
                    elif choice.upper().startswith("VISIT") and "|" in choice:
                        target = choice.split("|", 1)[1].strip()
                        if target in alive_names and target != player.name:
                            locations[player.name] = f"visiting:{target}"
                        else:
                            locations[player.name] = "campfire"
                    else:
                        locations[player.name] = "campfire"

                # Konum duzeltmeleri (prototype ile ayni logic)
                for name, loc in list(locations.items()):
                    if loc.startswith("visiting:"):
                        target = loc.split(":")[1]
                        if locations.get(target) != "home":
                            locations[name] = "campfire"
                        else:
                            other_visitors = [n for n, l in locations.items()
                                              if l == f"visiting:{target}" and n != name]
                            if other_visitors:
                                locations[name] = "campfire"

                # Minimum hareket: hic oda gorusmesi yoksa 1 cift zorla esle
                actual_visits = [(n, l.split(":")[1]) for n, l in locations.items()
                                 if l.startswith("visiting:")]
                if not actual_visits and len(alive_names) >= 4:
                    campfire_pool = [n for n, l in locations.items() if l == "campfire"]
                    home_pool = [n for n, l in locations.items() if l == "home"]
                    if len(campfire_pool) >= 2 and not home_pool:
                        pair = random_module.sample(campfire_pool, 2)
                        locations[pair[0]] = "home"
                        locations[pair[1]] = f"visiting:{pair[0]}"
                    elif home_pool and campfire_pool:
                        target_home = random_module.choice(home_pool)
                        visitor = random_module.choice(campfire_pool)
                        locations[visitor] = f"visiting:{target_home}"

                # Konum sonuclarini hesapla
                campfire_people = [n for n, l in locations.items() if l == "campfire"]
                home_people = [n for n, l in locations.items() if l == "home"]
                visits = [(n, l.split(":")[1]) for n, l in locations.items()
                          if l.startswith("visiting:")]

                # Broadcast konum kararlari
                decisions_data = []
                for name in alive_names:
                    loc = locations[name]
                    if loc == "campfire":
                        decisions_data.append({"player": name, "choice": "CAMPFIRE"})
                    elif loc == "home":
                        decisions_data.append({"player": name, "choice": "HOME"})
                    elif loc.startswith("visiting:"):
                        target = loc.split(":")[1]
                        decisions_data.append({"player": name, "choice": f"VISIT|{target}"})

                await manager.broadcast(game_id, {
                    "event": "location_decisions",
                    "data": {
                        "roam_round": roam_round,
                        "decisions": decisions_data,
                        "campfire_people": campfire_people,
                        "home_people": home_people,
                        "visits": [{"visitor": v, "host": h} for v, h in visits],
                    }
                })

                # Hareket duyurusu campfire_history'ye ekle
                movement_parts = []
                for n in home_people:
                    movement_parts.append(f"{n} evine cekildi")
                for visitor_name, host_name in visits:
                    movement_parts.append(f"{visitor_name}, {host_name}'in evine gitti")

                if movement_parts:
                    movement_msg = "Serbest dolasim: " + ". ".join(movement_parts) + "."
                    state["campfire_history"].append({
                        "type": "narrator",
                        "content": movement_msg,
                        "present": alive_names,
                    })

                # Campfire tartismasi (sadece campfire'dakiler) + Oda gorusmeleri (paralel)
                campfire_task = None
                if len(campfire_people) >= 2:
                    campfire_task = _run_campfire_segment_ws(
                        game_id=game_id,
                        state=state,
                        max_turns=CAMPFIRE_TURNS_PER_ROUND,
                        participant_names=campfire_people,
                        generate_campfire_speech=generate_campfire_speech,
                        get_alive_players=get_alive_players,
                        find_player=find_player,
                        maybe_update_campfire_summary=maybe_update_campfire_summary,
                        get_reaction=get_reaction,
                        orchestrator_pick=orchestrator_pick,
                        check_moderation=check_moderation,
                    )

                room_tasks = []
                for visitor_name, host_name in visits:
                    visitor_player = find_player(state, visitor_name)
                    host_player = find_player(state, host_name)
                    if visitor_player and host_player:
                        room_tasks.append(
                            _run_room_conversation_ws(
                                game_id=game_id,
                                state=state,
                                owner=host_player,
                                visitor=visitor_player,
                                max_exchanges=ROOM_EXCHANGES,
                                generate_1v1_speech=generate_1v1_speech,
                            )
                        )

                # Campfire + Room tasks paralel calistir
                all_tasks = []
                if campfire_task:
                    all_tasks.append(campfire_task)
                all_tasks.extend(room_tasks)
                if all_tasks:
                    await asyncio.gather(*all_tasks)

                # Evinde yalniz bekleyenler
                for n in home_people:
                    has_visitor = any(vn == n for _, vn in visits)
                    if not has_visitor:
                        await manager.send_to(
                            game_id,
                            find_player(state, n).slot_id if find_player(state, n) else "",
                            {
                                "event": "home_alone",
                                "data": {"message": f"{n} evinde yalniz bekledi — kimse gelmedi."},
                            }
                        )

                logger.info(f"Free roam {roam_round}/{FREE_ROAM_ROUNDS} completed")

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

            await manager.broadcast(game_id, {
                "event": "phase_change",
                "data": {
                    "phase": "vote",
                    "round": round_n,
                    "alive_players": alive_names,
                    "message": "Surgun edilecek kisiyi secin!",
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

            # Oylari say
            vote_map = {}
            for p in alive:
                if p.vote_target:
                    vote_map[p.name] = p.vote_target

            votes_list = [v for v in vote_map.values()]
            tally = Counter(votes_list)

            exiled_name = None
            if tally:
                top_vote, top_count = tally.most_common(1)[0]
                tied = [name for name, count in tally.items() if count == top_count]
                if len(tied) == 1:
                    exiled_name = top_vote

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

                await manager.broadcast(game_id, {
                    "event": "exile",
                    "data": {
                        "exiled": exiled_name,
                        "exiled_type": player.player_type.value if player else "unknown",
                        "exiled_role": player.role_title if player else "unknown",
                        "votes": vote_map,
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

            # Sonraki gune gec
            state["round_number"] = round_n + 1
            state["exiled_today"] = None
            for p in state["players"]:
                p.vote_target = None

    except Exception as e:
        logger.error(f"Game loop error: {e}", exc_info=True)

        await manager.broadcast(game_id, {
            "event": "error",
            "data": {
                "code": "game_loop_error",
                "message": str(e),
            }
        })

    finally:
        if game_id in _player_input_queues:
            del _player_input_queues[game_id]

        if game_id in _running_games:
            del _running_games[game_id]

        logger.info(f"Game loop ended: {game_id}")


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

    # ── Ilk konusmaci (onceki konusma yoksa random sec) ──
    recent_speeches = [m for m in state["campfire_history"]
                       if m["type"] == "speech" and m["name"] in participant_names]

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
            message = await generate_campfire_speech(state, first)

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

            await manager.broadcast(game_id, {
                "event": "campfire_speech",
                "data": {
                    "speaker": first.name,
                    "role_title": first.role_title,
                    "content": message,
                    "turn": 1,
                    "max_turns": max_turns,
                    "participants": participant_names,
                }
            })

            # TTS fire-and-forget (AI only)
            if not first.is_human:
                asyncio.create_task(_generate_and_broadcast_audio(game_id, first.name, message))

        turns_done = 1

    # ── Sonraki turlar: orchestrator ile konusmaci sec ──
    while turns_done < max_turns:
        turns_done += 1

        last_speeches = [m for m in state["campfire_history"]
                         if m["type"] == "speech" and m["name"] in participant_names]
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
            for p in participants:
                if p.is_human and p.name != last_speech["name"]:
                    reactions.append({"name": p.name, "wants": True, "reason": "insan oyuncu"})

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
            message = await generate_campfire_speech(state, speaker)

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

        # Broadcast
        await manager.broadcast(game_id, {
            "event": "campfire_speech",
            "data": {
                "speaker": speaker.name,
                "role_title": speaker.role_title,
                "content": message,
                "turn": turns_done,
                "max_turns": max_turns,
                "participants": participant_names,
            }
        })

        # TTS fire-and-forget (AI only)
        if not speaker.is_human:
            asyncio.create_task(_generate_and_broadcast_audio(game_id, speaker.name, message))

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
) -> None:
    """
    1v1 oda gorusmesi — her exchange ilgili 2 oyuncuya unicast edilir.
    """
    campfire_summary = state.get("campfire_rolling_summary", "") or "(Ozet yok)"

    exchanges = []
    speakers = [visitor, owner]  # Misafir once konusur

    # Gorusme basladigini bildir
    for p in [visitor, owner]:
        await manager.send_to(game_id, p.slot_id, {
            "event": "house_visit_start",
            "data": {
                "visitor": visitor.name,
                "host": owner.name,
                "max_exchanges": max_exchanges,
            }
        })

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
            speech_content = await generate_1v1_speech(
                state, current, opponent, exchanges, campfire_summary
            )

        exchange_entry = {
            "speaker": current.name,
            "role_title": current.role_title,
            "content": speech_content,
        }
        exchanges.append(exchange_entry)
        current.add_message("assistant", speech_content)

        # Unicast: sadece 2 oyuncuya gonder
        for p in [visitor, owner]:
            await manager.send_to(game_id, p.slot_id, {
                "event": "house_visit_exchange",
                "data": {
                    "speaker": current.name,
                    "role_title": current.role_title,
                    "content": speech_content,
                    "turn": turn + 1,
                    "max_exchanges": max_exchanges,
                    "visitor": visitor.name,
                    "host": owner.name,
                }
            })

        # TTS fire-and-forget (AI only, unicast to human player)
        if not current.is_human:
            human_p = visitor if visitor.is_human else (owner if owner.is_human else None)
            if human_p:
                asyncio.create_task(_generate_and_broadcast_audio(
                    game_id, current.name, speech_content, target_player_id=human_p.slot_id
                ))

    # Visit data kaydet
    visit_data = {
        "type": "room_visit",
        "owner": owner.name,
        "visitor": visitor.name,
        "exchanges": exchanges,
    }
    state["house_visits"].append(visit_data)

    # Gorusme bitti
    for p in [visitor, owner]:
        await manager.send_to(game_id, p.slot_id, {
            "event": "house_visit_end",
            "data": {
                "visitor": visitor.name,
                "host": owner.name,
                "exchange_count": len(exchanges),
            }
        })

    logger.info(f"Room visit done: {visitor.name} -> {owner.name} ({len(exchanges)} exchanges)")
