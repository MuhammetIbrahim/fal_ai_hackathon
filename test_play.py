"""Play through a full AI game via API + WS, print every event."""
import asyncio, json, sys, time
import httpx
import websockets

BASE = "http://localhost:8000"
GID = None

async def main():
    global GID
    t0 = time.time()

    async with httpx.AsyncClient(base_url=BASE, timeout=120) as c:
        # 1. Create game (all AI)
        r = await c.post("/api/game/", json={"player_count": 4, "ai_count": 4, "day_limit": 3})
        # 3 AI for faster test: json={"player_count": 3, "ai_count": 3, "day_limit": 3}
        r.raise_for_status()
        GID = r.json()["game_id"]
        print(f"[{time.time()-t0:.1f}s] Game created: {GID}")

        # 2. Start game
        r = await c.post(f"/api/game/{GID}/start")
        r.raise_for_status()
        print(f"[{time.time()-t0:.1f}s] Game started: {r.json().get('message')}")

    # 3. Connect WS as spectator
    uri = f"ws://localhost:8000/ws/{GID}/spectator"
    print(f"[{time.time()-t0:.1f}s] Connecting WS: {uri}")

    async with websockets.connect(uri, ping_interval=20, ping_timeout=60) as ws:
        print(f"[{time.time()-t0:.1f}s] WS connected!")

        try:
            while True:
                msg = await asyncio.wait_for(ws.recv(), timeout=180)
                data = json.loads(msg)
                ev = data.get("event", "?")
                d = data.get("data", {})
                elapsed = f"[{time.time()-t0:.1f}s]"

                if ev == "campfire_speech":
                    speaker = d.get("speaker", "?")
                    content = str(d.get("content", ""))[:120]
                    audio = "AUDIO" if d.get("audio_url") else "NO-AUDIO"
                    dur = d.get("audio_duration", 0)
                    print(f"{elapsed} [SPEECH] {speaker}: {content} ({audio}, {dur:.1f}s)")

                elif ev == "house_visit_exchange":
                    speaker = d.get("speaker", "?")
                    content = str(d.get("content", ""))[:100]
                    audio = "AUDIO" if d.get("audio_url") else "NO-AUDIO"
                    print(f"{elapsed} [VISIT] {speaker}: {content} ({audio})")

                elif ev == "phase_change":
                    print(f"\n{elapsed} === PHASE: {d.get('phase')} round={d.get('round')} ===")

                elif ev == "vote_broadcast":
                    print(f"{elapsed} [VOTE] {d.get('voter')} -> {d.get('target')}")

                elif ev == "exile":
                    print(f"{elapsed} [EXILE] {d.get('exiled', d.get('exiled_name', '?'))} ({d.get('exiled_role', '?')}) votes={d.get('votes', {})}")

                elif ev == "game_over":
                    print(f"\n{elapsed} [GAME OVER] Winner: {d.get('winner')}")
                    break

                elif ev in ("connected", "pong", "players_update"):
                    if ev == "connected":
                        print(f"{elapsed} [{ev}] {d.get('message')}")

                elif ev == "error":
                    print(f"{elapsed} [ERROR] {d}")

                elif ev == "character_reveal":
                    pass  # spectator won't get this

                else:
                    preview = str(d)[:100]
                    print(f"{elapsed} [{ev}] {preview}")

        except asyncio.TimeoutError:
            print(f"\n[{time.time()-t0:.1f}s] --- 180s no events, game may be stuck ---")
        except websockets.exceptions.ConnectionClosed as e:
            print(f"\n[{time.time()-t0:.1f}s] WS closed: {e}")

    print(f"\nTotal time: {time.time()-t0:.1f}s")

if __name__ == "__main__":
    asyncio.run(main())
