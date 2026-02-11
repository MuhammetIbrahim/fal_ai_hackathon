"""Quick AI demo test — create game, start, connect WS, watch events."""
import sys
import asyncio
import json
import httpx
import websockets

# Force unbuffered output
sys.stdout.reconfigure(line_buffering=True)

API = "http://localhost:8000"

async def main():
    async with httpx.AsyncClient(timeout=120) as client:
        # 1. Create game (all AI)
        print("Creating game...")
        r = await client.post(f"{API}/api/game/", json={
            "player_count": 6, "ai_count": 6, "day_limit": 3
        })
        game = r.json()
        game_id = game["game_id"]
        print(f"Game: {game_id} — {game['settlement_name']}")

        # 2. Start game
        print("Starting game (generating characters)...")
        r = await client.post(f"{API}/api/game/{game_id}/start")
        print(f"Status: {r.json()['message']}")

    # 3. Connect WS as spectator
    ws_url = f"ws://localhost:8000/ws/{game_id}/spectator"
    print(f"\nConnecting WS: {ws_url}")

    async with websockets.connect(ws_url) as ws:
        print("Connected! Watching game...\n")
        try:
            async for raw in ws:
                msg = json.loads(raw)
                event = msg.get("event", "?")
                data = msg.get("data", {})

                if event == "phase_change":
                    phase = data.get("phase", "?")
                    round_n = data.get("round", "?")
                    print(f"\n{'='*50}")
                    print(f"  PHASE: {phase} — Round {round_n}")
                    print(f"{'='*50}")

                elif event == "campfire_speech":
                    speaker = data.get("speaker", "?")
                    content = data.get("content", "")[:120]
                    turn = data.get("turn", "?")
                    print(f"  [{speaker}] (turn {turn}): {content}")

                elif event == "morning_narrative":
                    text = data.get("text", "")[:150]
                    print(f"  [Anlatici]: {text}")

                elif event == "vote_result":
                    exiled = data.get("exiled") or data.get("exiled_name", "?")
                    print(f"  SURGUN: {exiled}")

                elif event == "game_over":
                    winner = data.get("winner", "?")
                    print(f"\n  OYUN BITTI — Kazanan: {winner}")
                    break

                elif event == "location_decisions":
                    decisions = data.get("decisions", data.get("locations", []))
                    if isinstance(decisions, dict):
                        locs = [f"{k}→{v}" for k, v in decisions.items()]
                    elif isinstance(decisions, list):
                        locs = [f"{d.get('playerName', d.get('player', '?'))}→{d.get('choice', d.get('location', '?'))}" for d in decisions]
                    else:
                        locs = [str(decisions)[:80]]
                    print(f"  [Konum]: {', '.join(locs)}")

                elif event in ("spotlight_cards", "sinama", "mini_event", "morning_crisis"):
                    print(f"  [{event}]: {json.dumps(data, ensure_ascii=False)[:100]}")

                elif event == "speech_audio":
                    continue  # skip audio URLs

                elif event == "sinama_echo":
                    print(f"  [Sinama Echo]: {data.get('content', '')[:100]}")

                elif event == "free_roam_start":
                    print(f"\n  --- Serbest Dolasim (Round {data.get('round')}) ---")

                elif event == "house_visit_start":
                    print(f"  [Ev Ziyareti]: {data.get('visitor', '?')} → {data.get('host', '?')}")

                elif event == "house_exchange":
                    print(f"    {data.get('speaker', '?')}: {data.get('content', '')[:80]}")

                elif event == "vote_cast":
                    print(f"  [Oy]: {data.get('voter', '?')} → {data.get('target', '?')}")

                elif event == "exile":
                    exiled = data.get("exiled") or data.get("exiled_name", "?")
                    votes = data.get("votes", {})
                    vote_str = ", ".join(f"{v}->{t}" for v, t in votes.items()) if votes else ""
                    print(f"  [SURGUN]: {exiled} (role: {data.get('exiled_role', '?')})")
                    if vote_str:
                        print(f"  [Oylar]: {vote_str}")

                elif event == "night_result":
                    print(f"  [Gece Sonucu]: {data.get('effectText', '')[:100]}")

                elif event == "ocak_tepki":
                    print(f"  [OCAK TEPKI]: {data.get('message', '')[:100]}")

                elif event == "connected":
                    print(f"  Connected as: {data.get('player_id')}")

                else:
                    print(f"  [{event}]: {json.dumps(data, ensure_ascii=False)[:80]}")

        except websockets.exceptions.ConnectionClosed:
            print("\nWS connection closed.")

if __name__ == "__main__":
    asyncio.run(main())
