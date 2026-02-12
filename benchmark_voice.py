"""Voice/TTS End-to-End Benchmark — Freya AI via fal.ai."""

import asyncio
import time
import statistics
import httpx

BASE = "http://localhost:9000"
AUTH = {"Authorization": "Bearer demo-key-123"}

results = []


def record(name, ms, ok, detail=""):
    results.append({"name": name, "ms": round(ms, 1), "ok": ok, "detail": detail})


async def submit_tts(client, text, voice="alloy", speed=1.0):
    """Submit TTS job, poll until done, return total time + result."""
    start = time.perf_counter()

    r = await client.post(f"{BASE}/v1/voice/tts", headers=AUTH, json={
        "text": text, "voice": voice, "speed": speed,
    })
    if r.status_code != 202:
        return (time.perf_counter() - start) * 1000, False, f"submit failed: {r.status_code}"

    job_id = r.json()["job_id"]
    submit_ms = (time.perf_counter() - start) * 1000

    # Poll
    status = "pending"
    polls = 0
    while status in ("pending", "processing") and polls < 90:
        await asyncio.sleep(1)
        polls += 1
        r = await client.get(f"{BASE}/v1/jobs/{job_id}", headers=AUTH)
        if r.status_code == 200:
            status = r.json().get("status", "unknown")

    total_ms = (time.perf_counter() - start) * 1000
    job_data = r.json() if r.status_code == 200 else {}

    if status == "completed":
        res = job_data.get("result", {})
        audio_url = res.get("audio_url", "")
        inference_ms = res.get("inference_time_ms")
        duration_sec = res.get("audio_duration_sec")
        detail = f"submit={submit_ms:.0f}ms"
        if inference_ms:
            detail += f" inference={inference_ms:.0f}ms"
        if duration_sec:
            detail += f" audio={duration_sec:.1f}s"
        if audio_url:
            detail += f" url={audio_url[:60]}..."
        return total_ms, True, detail
    elif status == "failed":
        err = job_data.get("error", {}).get("message", "unknown")
        return total_ms, False, f"FAILED: {err[:80]}"
    else:
        return total_ms, False, f"TIMEOUT after {polls} polls"


async def main():
    print("╔══════════════════════════════════════════════════╗")
    print("║  Voice/TTS End-to-End Benchmark — Freya AI       ║")
    print("╚══════════════════════════════════════════════════╝")

    async with httpx.AsyncClient(timeout=120.0) as client:

        # ─── Test 1: Kısa metin, tüm sesler ─────────────
        print("\n═══ Test 1: Kısa metin — 3 farklı ses ═══")
        short_text = "Merhaba, ben bir test karakteriyim."

        for voice in ["alloy", "zeynep", "ali"]:
            ms, ok, detail = await submit_tts(client, short_text, voice=voice)
            record(f"TTS short ({voice})", ms, ok, detail)
            print(f"  {voice}: {'✅' if ok else '❌'} {ms:.0f}ms — {detail}")

        # ─── Test 2: Farklı uzunluklar ───────────────────
        print("\n═══ Test 2: Metin uzunluğu etkisi ═══")
        texts = {
            "1 cümle (kısa)": "Bu gece nöbetçi kimdi?",
            "3 cümle (orta)": "Bu gece nöbetçi kimdi? Kimse cevap vermiyor. Surlarda bir hareket gördüğümü iddia ediyorum ama kimse inanmıyor.",
            "6 cümle (uzun)": "Bu gece nöbetçi kimdi? Kimse cevap vermiyor. Surlarda bir hareket gördüğümü iddia ediyorum ama kimse inanmıyor. Kasap dün gece tuhaf davranıyordu, bunu herkes gördü. Şifacı ise sabah erkenden kalktığını söyledi ama ben onu görmedim. Bu köyde artık kimseye güvenemiyorum ve yarın oylamada sesimi yükseltmeyi planlıyorum.",
        }

        for label, text in texts.items():
            ms, ok, detail = await submit_tts(client, text)
            char_count = len(text)
            record(f"TTS {label} ({char_count} char)", ms, ok, detail)
            print(f"  {label} ({char_count} char): {'✅' if ok else '❌'} {ms:.0f}ms — {detail}")

        # ─── Test 3: Hız değişkenleri ────────────────────
        print("\n═══ Test 3: Konuşma hızı etkisi ═══")
        medium_text = "Kasap dün gece tuhaf davranıyordu, bunu herkes gördü."

        for speed in [0.7, 1.0, 1.5]:
            ms, ok, detail = await submit_tts(client, medium_text, speed=speed)
            record(f"TTS speed={speed}", ms, ok, detail)
            print(f"  speed={speed}: {'✅' if ok else '❌'} {ms:.0f}ms — {detail}")

        # ─── Test 4: Concurrent TTS ──────────────────────
        print("\n═══ Test 4: Concurrent TTS (3 paralel istek) ═══")
        concurrent_texts = [
            ("alloy", "Ben suçsuzum, dün gece evdeydim."),
            ("zeynep", "Kimse bana iftira atamasın!"),
            ("ali", "Sakin olun, hepimiz aynı taraftayız."),
        ]

        start = time.perf_counter()
        tasks = [submit_tts(client, text, voice=v) for v, text in concurrent_texts]
        concurrent_results = await asyncio.gather(*tasks)
        wall_ms = (time.perf_counter() - start) * 1000

        times_ok = []
        for i, (ms, ok, detail) in enumerate(concurrent_results):
            voice, text = concurrent_texts[i]
            record(f"TTS concurrent #{i+1} ({voice})", ms, ok, detail)
            print(f"  #{i+1} ({voice}): {'✅' if ok else '❌'} {ms:.0f}ms — {detail}")
            if ok:
                times_ok.append(ms)

        if times_ok:
            record("TTS 3x concurrent (wall)", wall_ms, len(times_ok) == 3,
                   f"avg={statistics.mean(times_ok):.0f}ms max={max(times_ok):.0f}ms")
            print(f"  Wall time: {wall_ms:.0f}ms (sequential would be ~{sum(times_ok):.0f}ms)")

        # ─── Test 5: 5x concurrent (stress) ──────────────
        print("\n═══ Test 5: Concurrent TTS stress (5 paralel) ═══")
        stress_texts = [
            ("alloy", "Birinci test cümlesi, kısa ve öz."),
            ("zeynep", "İkinci test cümlesi, biraz daha uzun olacak şekilde."),
            ("ali", "Üçüncü test cümlesi burada."),
            ("alloy", "Dördüncü cümle, farklı bir karakter."),
            ("zeynep", "Beşinci ve son test cümlesi."),
        ]

        start = time.perf_counter()
        tasks = [submit_tts(client, text, voice=v) for v, text in stress_texts]
        stress_results = await asyncio.gather(*tasks)
        wall_ms = (time.perf_counter() - start) * 1000

        times_ok = []
        for i, (ms, ok, detail) in enumerate(stress_results):
            if ok:
                times_ok.append(ms)
            status_icon = '✅' if ok else '❌'
            print(f"  #{i+1}: {status_icon} {ms:.0f}ms")

        if times_ok:
            record("TTS 5x stress (wall)", wall_ms, len(times_ok) == 5,
                   f"ok={len(times_ok)}/5 avg={statistics.mean(times_ok):.0f}ms p50={statistics.median(times_ok):.0f}ms max={max(times_ok):.0f}ms")
            print(f"  Wall: {wall_ms:.0f}ms | Avg: {statistics.mean(times_ok):.0f}ms | Max: {max(times_ok):.0f}ms")

    # ─── Final Report ─────────────────────────────────
    print("\n" + "═" * 95)
    print(f"{'Test':<45} {'Time':>10} {'OK':>4}  Detail")
    print("─" * 95)
    for r in results:
        ok_str = "✅" if r["ok"] else "❌"
        t = f"{r['ms']:.0f}ms" if r["ms"] < 10000 else f"{r['ms']/1000:.1f}s"
        print(f"{r['name']:<45} {t:>10} {ok_str:>4}  {r['detail'][:55]}")

    print("─" * 95)
    ok_count = sum(1 for r in results if r["ok"])
    fail_count = len(results) - ok_count
    tts_times = [r["ms"] for r in results if r["ok"] and "concurrent" not in r["name"].lower() and "stress" not in r["name"].lower() and "TTS" in r["name"]]
    print(f"\nToplam: {len(results)} test | ✅ {ok_count} başarılı | ❌ {fail_count} başarısız")
    if tts_times:
        print(f"TTS single request (avg): {statistics.mean(tts_times):.0f}ms")
        print(f"TTS single request (min): {min(tts_times):.0f}ms")
        print(f"TTS single request (max): {max(tts_times):.0f}ms")


if __name__ == "__main__":
    asyncio.run(main())
