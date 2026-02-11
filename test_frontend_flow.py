"""Test the frontend AI Demo flow through the Vite proxy."""
import asyncio
import json
import sys
import httpx
import websockets


def p(msg):
    print(msg, flush=True)


async def test_ai_demo():
    base = "http://localhost:5173"

    # 1. Create game
    p("Creating game via Vite proxy...")
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{base}/api/game/",
            json={"player_count": 6, "ai_count": 6, "day_limit": 3},
        )
        assert r.status_code == 201, f"Create failed: {r.status_code} {r.text}"
        game_id = r.json()["game_id"]
        settlement = r.json().get("settlement_name", "?")
        p(f"Game: {game_id} — {settlement}")

        # 2. Start game
        p("Starting game (generating characters)...")
        r2 = await client.post(f"{base}/api/game/{game_id}/start", timeout=180)
        assert r2.status_code == 200, f"Start failed: {r2.status_code} {r2.text}"
        p(f"Status: {r2.json().get('message', r2.text[:100])}")

    # 3. Connect WS through Vite proxy
    ws_url = f"ws://localhost:5173/ws/{game_id}/spectator"
    p(f"\nConnecting WS: {ws_url}")

    async with websockets.connect(ws_url, open_timeout=10) as ws:
        p("Connected! Watching game...\n")
        events_seen = set()
        msg_count = 0
        try:
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=120)
                msg = json.loads(raw)
                event = msg.get("event", "?")
                data = msg.get("data", {})
                events_seen.add(event)
                msg_count += 1

                if event == "phase_change":
                    phase = data.get("phase", "?")
                    rnd = data.get("round", "?")
                    p(f"\n{'='*50}")
                    p(f"  PHASE: {phase} — Round {rnd}")
                    p(f"{'='*50}")
                elif event == "campfire_speech":
                    speaker = data.get("speaker", "?")
                    content = (data.get("content", "")[:80] or "").replace("\n", " ")
                    p(f"  [{speaker}]: {content}...")
                elif event == "exile":
                    exiled = data.get("exiled", "?")
                    votes = data.get("votes", {})
                    p(f"  [SURGUN]: {exiled}")
                    p(f"  [Oylar]: {votes}")
                elif event == "game_over":
                    winner = data.get("winner", "?")
                    p(f"\n  [GAME OVER] Winner: {winner}")
                    all_players = data.get("all_players", [])
                    for pl in all_players:
                        name = pl.get("name", "?")
                        role = pl.get("role_title", "?")
                        ptype = pl.get("player_type", "?")
                        alive = pl.get("alive", "?")
                        p(f"    {name} — {role} [{ptype}] {'ALIVE' if alive else 'DEAD'}")
                    break
                elif event == "location_decisions":
                    decisions = data.get("decisions", [])
                    visits = [d for d in decisions if "VISIT" in d.get("choice", "")]
                    p(f"  [location_decisions] {len(decisions)} karar, {len(visits)} visit: {visits}")
                elif event == "house_visit_start":
                    p(f"  [HOUSE_VISIT_START] {data.get('visitor')} → {data.get('host')}")
                elif event == "house_visit_exchange":
                    p(f"  [HOUSE_VISIT_EXCHANGE] {data.get('speaker')}: {(data.get('content',''))[:60]}...")
                elif event == "house_visit_end":
                    p(f"  [HOUSE_VISIT_END] {data.get('visitor')} → {data.get('host')} ({data.get('exchange_count')} exchanges)")
                elif event in (
                    "morning",
                    "sinama",
                    "spotlight_cards",
                    "mini_event",
                    "morning_crisis",
                    "free_roam_start",
                ):
                    p(f"  [{event}] ✓")
                elif event == "connected":
                    p(f"  [{event}] ✓")
                elif event in (
                    "ocak_tepki",
                    "kul_kaymasi",
                    "proposal",
                    "proposal_result",
                    "sinama_echo",
                    "soz_borcu",
                ):
                    p(f"  [{event}] ✓")
                # Skip speech_audio, error, etc.

        except asyncio.TimeoutError:
            p("Timeout waiting for events")
        except websockets.exceptions.ConnectionClosed:
            p("WS connection closed")

        p(f"\nTotal messages: {msg_count}")
        p(f"Events seen: {sorted(events_seen)}")


if __name__ == "__main__":
    asyncio.run(test_ai_demo())
