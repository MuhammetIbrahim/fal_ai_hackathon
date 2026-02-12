"""B2B Character AI API — Full Benchmark Suite."""

import asyncio
import time
import json
import statistics
import httpx

BASE = "http://localhost:9000"
AUTH = {"Authorization": "Bearer demo-key-123"}

results = []


def record(name: str, status: int, elapsed_ms: float, ok: bool, detail: str = ""):
    results.append({"name": name, "status": status, "ms": round(elapsed_ms, 1), "ok": ok, "detail": detail})


async def timed(client: httpx.AsyncClient, method: str, path: str, **kwargs):
    start = time.perf_counter()
    resp = await getattr(client, method)(f"{BASE}{path}", headers=AUTH, **kwargs)
    elapsed = (time.perf_counter() - start) * 1000
    return resp, elapsed


# ─── PART 1: HTTP Latency (no FAL calls) ──────────────────────

async def bench_http_latency(client: httpx.AsyncClient):
    print("\n═══ PART 1: HTTP Latency (overhead only) ═══")

    # Health
    r, ms = await timed(client, "get", "/health")
    record("GET /health", r.status_code, ms, r.status_code == 200)

    # Root
    r, ms = await timed(client, "get", "/")
    record("GET /", r.status_code, ms, r.status_code == 200)

    # Auth failure
    start = time.perf_counter()
    r = await client.get(f"{BASE}/v1/characters", headers={"Authorization": "Bearer bad-key"})
    ms = (time.perf_counter() - start) * 1000
    record("GET /v1/characters (bad auth)", r.status_code, ms, r.status_code == 401)

    # Empty character list
    r, ms = await timed(client, "get", "/v1/characters")
    record("GET /v1/characters (empty)", r.status_code, ms, r.status_code == 200)

    # 404 character
    r, ms = await timed(client, "get", "/v1/characters/nonexistent")
    record("GET /v1/characters/nonexistent", r.status_code, ms, r.status_code == 404)

    # Create world (no FAL)
    r, ms = await timed(client, "post", "/v1/worlds", json={
        "name": "Benchmark Dunyasi",
        "tone": "karanlik fantazi",
        "taboo_words": ["AI", "bot"],
    })
    record("POST /v1/worlds", r.status_code, ms, r.status_code == 201)
    world_id = r.json().get("id") if r.status_code == 201 else None

    # Get world
    if world_id:
        r, ms = await timed(client, "get", f"/v1/worlds/{world_id}")
        record("GET /v1/worlds/{id}", r.status_code, ms, r.status_code == 200)

    # Voice list (no FAL)
    r, ms = await timed(client, "get", "/v1/voice/voices")
    record("GET /v1/voice/voices", r.status_code, ms, r.status_code == 200)

    # STT validation error (no audio)
    r, ms = await timed(client, "post", "/v1/voice/stt", json={})
    record("POST /v1/voice/stt (no audio)", r.status_code, ms, r.status_code == 422)

    return world_id


# ─── PART 2: End-to-End Real FAL Calls ────────────────────────

async def bench_e2e(client: httpx.AsyncClient, world_id: str | None):
    print("\n═══ PART 2: End-to-End (real fal.ai calls) ═══")

    # Create character with LLM generation
    r, ms = await timed(client, "post", "/v1/characters", json={
        "world_id": world_id,
        "skill_tier": "orta",
    })
    record("POST /v1/characters (LLM gen)", r.status_code, ms, r.status_code == 201,
           f"name={r.json().get('name', '?')}" if r.status_code == 201 else r.text[:100])
    char_id = r.json().get("id") if r.status_code == 201 else None

    if not char_id:
        print("  ⚠ Karakter olusturulamadi, e2e testleri atlaniyor")
        return None

    # Create character with system_prompt override (no LLM)
    r, ms = await timed(client, "post", "/v1/characters", json={
        "name": "Benchmark Karakter",
        "role": "Kasap",
        "archetype": "Saldirgan",
        "system_prompt": "Sen agresif bir kasapsin. Kisa ve sert konus.",
    })
    record("POST /v1/characters (system_prompt skip)", r.status_code, ms, r.status_code == 201)

    # Speak
    r, ms = await timed(client, "post", f"/v1/characters/{char_id}/speak", json={
        "message": "Bu gece kim nobetciydi?",
        "mood": "supheli",
    })
    record("POST /characters/{id}/speak", r.status_code, ms, r.status_code == 200,
           f"len={len(r.json().get('message', ''))}" if r.status_code == 200 else r.text[:100])

    # React
    r, ms = await timed(client, "post", f"/v1/characters/{char_id}/react", json={
        "message": "Seni dun gece suratlarda gormediler!",
    })
    record("POST /characters/{id}/react", r.status_code, ms, r.status_code == 200,
           f"wants={r.json().get('wants_to_speak', '?')}" if r.status_code == 200 else "")

    # Memory
    r, ms = await timed(client, "get", f"/v1/characters/{char_id}/memory")
    record("GET /characters/{id}/memory", r.status_code, ms, r.status_code == 200,
           f"exchanges={r.json().get('total', 0)}" if r.status_code == 200 else "")

    # TTS (async job)
    r, ms = await timed(client, "post", "/v1/voice/tts", json={
        "text": "Benchmark test konusmasi.",
        "voice": "alloy",
    })
    record("POST /v1/voice/tts (submit)", r.status_code, ms, r.status_code == 202)
    tts_job_id = r.json().get("job_id") if r.status_code == 202 else None

    # Avatar (async job)
    r, ms = await timed(client, "post", "/v1/images/avatar", json={
        "description": "Guclu bir kasap, kisa sacli, sert bakisli",
        "style": "pixel_art",
        "width": 512,
        "height": 512,
    })
    record("POST /v1/images/avatar (submit)", r.status_code, ms, r.status_code == 202)
    avatar_job_id = r.json().get("job_id") if r.status_code == 202 else None

    # Background (async job)
    r, ms = await timed(client, "post", "/v1/images/background", json={
        "prompt": "Karanlik bir orman, ay isigi, sis",
        "style": "painterly",
        "width": 1344,
        "height": 768,
    })
    record("POST /v1/images/background (submit)", r.status_code, ms, r.status_code == 202)
    bg_job_id = r.json().get("job_id") if r.status_code == 202 else None

    # Poll jobs until completion
    job_ids = {
        "TTS job": tts_job_id,
        "Avatar job": avatar_job_id,
        "Background job": bg_job_id,
    }
    for label, jid in job_ids.items():
        if not jid:
            continue
        start = time.perf_counter()
        status = "pending"
        polls = 0
        while status in ("pending", "processing") and polls < 60:
            await asyncio.sleep(2)
            polls += 1
            r = await client.get(f"{BASE}/v1/jobs/{jid}", headers=AUTH)
            if r.status_code == 200:
                status = r.json().get("status", "unknown")
        total_ms = (time.perf_counter() - start) * 1000
        detail = ""
        if status == "completed":
            res = r.json().get("result", {})
            detail = res.get("audio_url", res.get("image_url", ""))[:80] if res else ""
        elif status == "failed":
            detail = r.json().get("error", {}).get("message", "")[:80]
        record(f"{label} (poll→{status})", 200, total_ms, status == "completed", detail)

    return char_id


# ─── PART 3: Concurrent Load Test ─────────────────────────────

async def bench_concurrent(client: httpx.AsyncClient, world_id: str | None):
    print("\n═══ PART 3: Concurrent Load Test ═══")

    # 10 concurrent character creates with system_prompt (no LLM — tests pure throughput)
    async def create_one(i):
        start = time.perf_counter()
        r = await client.post(f"{BASE}/v1/characters", headers=AUTH, json={
            "name": f"LoadTest_{i}",
            "role": "Avci",
            "archetype": "Sakin Az Konusan",
            "system_prompt": f"Sen sakin bir avcisin. Test karakter {i}.",
        })
        return (time.perf_counter() - start) * 1000, r.status_code

    tasks = [create_one(i) for i in range(10)]
    start_all = time.perf_counter()
    results_concurrent = await asyncio.gather(*tasks)
    total_wall_ms = (time.perf_counter() - start_all) * 1000

    times = [r[0] for r in results_concurrent]
    statuses = [r[1] for r in results_concurrent]
    ok_count = sum(1 for s in statuses if s == 201)

    record(f"10x concurrent POST /characters (no LLM)", 201, total_wall_ms,
           ok_count == 10,
           f"ok={ok_count}/10 avg={statistics.mean(times):.0f}ms p50={statistics.median(times):.0f}ms p99={sorted(times)[8]:.0f}ms")

    # 20 concurrent GET requests
    async def get_one(i):
        start = time.perf_counter()
        r = await client.get(f"{BASE}/v1/characters", headers=AUTH)
        return (time.perf_counter() - start) * 1000, r.status_code

    tasks = [get_one(i) for i in range(20)]
    start_all = time.perf_counter()
    results_concurrent = await asyncio.gather(*tasks)
    total_wall_ms = (time.perf_counter() - start_all) * 1000

    times = [r[0] for r in results_concurrent]
    ok_count = sum(1 for _, s in results_concurrent if s == 200)

    record(f"20x concurrent GET /characters", 200, total_wall_ms,
           ok_count == 20,
           f"ok={ok_count}/20 avg={statistics.mean(times):.0f}ms p50={statistics.median(times):.0f}ms p99={sorted(times)[18]:.0f}ms")

    # 5 concurrent LLM speak requests (real FAL)
    char_list = await client.get(f"{BASE}/v1/characters", headers=AUTH)
    chars = char_list.json().get("items", [])
    if len(chars) >= 5:
        async def speak_one(char):
            start = time.perf_counter()
            r = await client.post(f"{BASE}/v1/characters/{char['id']}/speak", headers=AUTH, json={
                "message": "Bugun ne oldu?",
            })
            return (time.perf_counter() - start) * 1000, r.status_code

        tasks = [speak_one(chars[i]) for i in range(5)]
        start_all = time.perf_counter()
        results_concurrent = await asyncio.gather(*tasks)
        total_wall_ms = (time.perf_counter() - start_all) * 1000

        times = [r[0] for r in results_concurrent]
        ok_count = sum(1 for _, s in results_concurrent if s == 200)

        record(f"5x concurrent /speak (real LLM)", 200, total_wall_ms,
               ok_count == 5,
               f"ok={ok_count}/5 avg={statistics.mean(times):.0f}ms p50={statistics.median(times):.0f}ms max={max(times):.0f}ms")


# ─── Main ─────────────────────────────────────────────────────

async def main():
    print("╔══════════════════════════════════════════════╗")
    print("║  B2B Character AI API — Benchmark Suite      ║")
    print("╚══════════════════════════════════════════════╝")

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Part 1: HTTP latency
        world_id = await bench_http_latency(client)

        # Part 2: E2E real calls
        char_id = await bench_e2e(client, world_id)

        # Part 3: Load test
        await bench_concurrent(client, world_id)

    # Report
    print("\n" + "═" * 90)
    print(f"{'Test':<50} {'Status':>6} {'Time':>10} {'OK':>4}  Detail")
    print("─" * 90)
    for r in results:
        ok_str = "✅" if r["ok"] else "❌"
        time_str = f"{r['ms']:.0f}ms" if r["ms"] < 10000 else f"{r['ms']/1000:.1f}s"
        print(f"{r['name']:<50} {r['status']:>6} {time_str:>10} {ok_str:>4}  {r['detail'][:50]}")

    print("─" * 90)

    # Summary
    ok_count = sum(1 for r in results if r["ok"])
    fail_count = len(results) - ok_count
    http_only = [r["ms"] for r in results if "health" in r["name"].lower() or "empty" in r["name"] or "voices" in r["name"]]
    llm_calls = [r["ms"] for r in results if "LLM" in r["name"] or "speak" in r["name"].lower()]

    print(f"\nToplam: {len(results)} test | ✅ {ok_count} basarili | ❌ {fail_count} basarisiz")
    if http_only:
        print(f"HTTP overhead (avg): {statistics.mean(http_only):.1f}ms")
    if llm_calls:
        print(f"LLM calls (avg): {statistics.mean(llm_calls):.0f}ms")


if __name__ == "__main__":
    asyncio.run(main())
