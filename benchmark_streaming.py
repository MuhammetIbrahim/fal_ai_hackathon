"""
benchmark_streaming.py — Eski (job poll) vs Yeni (SSE stream) karsilastirmasi.
Ana metrik: TTFA (Time-to-First-Audio).

Kullanim:
    python -m api.main  # ayri terminalde
    python benchmark_streaming.py
"""

from __future__ import annotations

import asyncio
import json
import statistics
import time

import httpx

BASE = "http://localhost:9000"
AUTH = {"Authorization": "Bearer demo-key-123"}


# ── SSE Parse Helper ─────────────────────────────────────


async def consume_sse(client: httpx.AsyncClient, path: str, body: dict):
    """SSE stream tuket. (events_list, first_audio_ms, first_token_ms, total_ms) don."""
    events = []
    start = time.perf_counter()
    first_audio_ms = None
    first_token_ms = None

    async with client.stream("POST", f"{BASE}{path}", headers=AUTH, json=body, timeout=60.0) as resp:
        buffer = ""
        async for chunk in resp.aiter_text():
            buffer += chunk
            while "\n\n" in buffer:
                event_str, buffer = buffer.split("\n\n", 1)
                event_type = None
                event_data = None
                for line in event_str.strip().split("\n"):
                    if line.startswith("event: "):
                        event_type = line[7:]
                    elif line.startswith("data: "):
                        try:
                            event_data = json.loads(line[6:])
                        except json.JSONDecodeError:
                            event_data = line[6:]

                now_ms = (time.perf_counter() - start) * 1000
                events.append({"type": event_type, "data": event_data, "ms": now_ms})

                if event_type == "audio_chunk" and first_audio_ms is None:
                    first_audio_ms = now_ms
                if event_type == "text_token" and first_token_ms is None:
                    first_token_ms = now_ms

    total_ms = (time.perf_counter() - start) * 1000
    return events, first_audio_ms, first_token_ms, total_ms


# ── Eski TTS yolu (poll) ─────────────────────────────────


async def old_tts(client: httpx.AsyncClient, text: str, voice: str = "alloy"):
    """Eski yol: submit -> poll -> CDN URL. (total_ms, ok) don."""
    start = time.perf_counter()
    r = await client.post(f"{BASE}/v1/voice/tts", headers=AUTH, json={"text": text, "voice": voice})
    if r.status_code != 202:
        return (time.perf_counter() - start) * 1000, False
    job_id = r.json()["job_id"]
    status = "pending"
    polls = 0
    while status in ("pending", "processing") and polls < 90:
        await asyncio.sleep(0.5)
        polls += 1
        r = await client.get(f"{BASE}/v1/jobs/{job_id}", headers=AUTH)
        if r.status_code == 200:
            status = r.json().get("status", "unknown")
    total_ms = (time.perf_counter() - start) * 1000
    return total_ms, status == "completed"


# ── Eski speak yolu (sync) ───────────────────────────────


async def old_speak(client: httpx.AsyncClient, char_id: str, message: str):
    """Eski yol: POST /speak sync. (total_ms, ok) don."""
    start = time.perf_counter()
    r = await client.post(
        f"{BASE}/v1/characters/{char_id}/speak",
        headers=AUTH,
        json={"message": message},
        timeout=30.0,
    )
    total_ms = (time.perf_counter() - start) * 1000
    return total_ms, r.status_code == 200


# ── Yardimci ─────────────────────────────────────────────


def _print_header(title: str):
    print(f"\n{'=' * 60}")
    print(f"  {title}")
    print(f"{'=' * 60}")


def _print_sub(title: str):
    print(f"\n  --- {title} ---")


# ── Test 1: TTS TTFA Karsilastirmasi ─────────────────────


async def test1_tts_ttfa(client: httpx.AsyncClient) -> dict:
    _print_header("Test 1: TTS TTFA Karsilastirmasi (eski vs yeni)")

    texts = {
        "Kisa (22 char)": "Bu gece nobetci kimdi?",
        "Orta (111 char)": (
            "Bu gece nobetci kimdi? Kimse cevap vermiyor. Surlarda bir hareket gordugumu "
            "iddia ediyorum ama kimse inanmiyor."
        ),
        "Uzun (319 char)": (
            "Bu gece nobetci kimdi? Kimse cevap vermiyor. Surlarda bir hareket gordugumu "
            "iddia ediyorum ama kimse inanmiyor. Kasap dun gece tuhaf davraniyordu, bunu "
            "herkes gordu. Sifaci ise sabah erkenden kalktigini soyledi ama ben onu gormedim. "
            "Bu koyde artik kimseye guvenemiyorum ve yarin oylamada sesimi yukseltmeyi planliyorum."
        ),
    }

    results = {}
    for label, text in texts.items():
        _print_sub(label)
        try:
            old_ms, old_ok = await old_tts(client, text)
            print(f"    Eski (poll):   {old_ms:.0f}ms total {'OK' if old_ok else 'FAIL'}")
        except Exception as e:
            old_ms, old_ok = None, False
            print(f"    Eski (poll):   HATA — {e}")

        try:
            events, first_audio, _, total = await consume_sse(
                client, "/v1/voice/tts/stream", {"text": text, "voice": "alloy"}
            )
            chunks = sum(1 for ev in events if ev["type"] == "audio_chunk")
            print(f"    Yeni (stream): TTFA={first_audio:.0f}ms, total={total:.0f}ms, chunks={chunks}")
        except Exception as e:
            first_audio, total = None, None
            print(f"    Yeni (stream): HATA — {e}")

        if old_ms and first_audio:
            speedup = old_ms / first_audio
            print(f"    -> Ilk ses {speedup:.1f}x daha hizli")

        results[label] = {
            "old_total": old_ms,
            "new_ttfa": first_audio,
            "new_total": total,
        }

    return results


# ── Test 2: Ses Karsilastirmasi (streaming) ──────────────


async def test2_voice_comparison(client: httpx.AsyncClient) -> dict:
    _print_header("Test 2: Ses Karsilastirmasi (streaming)")

    text = "Bu gece nobetci kimdi?"
    voices = ["alloy", "zeynep", "ali"]
    results = {}

    for voice in voices:
        try:
            events, first_audio, _, total = await consume_sse(
                client, "/v1/voice/tts/stream", {"text": text, "voice": voice}
            )
            chunks = sum(1 for ev in events if ev["type"] == "audio_chunk")
            print(f"    {voice:8s}: TTFA={first_audio:.0f}ms, total={total:.0f}ms, chunks={chunks}")
            results[voice] = {"ttfa": first_audio, "total": total}
        except Exception as e:
            print(f"    {voice:8s}: HATA — {e}")
            results[voice] = {"ttfa": None, "total": None}

    return results


# ── Test 3: LLM→TTS Pipeline TTFA ────────────────────────


async def test3_pipeline_ttfa(client: httpx.AsyncClient) -> dict:
    _print_header("Test 3: LLM->TTS Pipeline TTFA")

    # Karakter olustur
    r = await client.post(
        f"{BASE}/v1/characters",
        headers=AUTH,
        json={
            "name": "Benchmark Dorin",
            "role": "Kasap",
            "archetype": "Saldirgan",
            "system_prompt": "Sen agresif bir kasapsin. Kisa ve sert konus. Her zaman 2-3 cumle soyle.",
        },
    )
    if r.status_code != 201:
        print(f"    Karakter olusturulamadi: {r.status_code}")
        return {}
    char_id = r.json()["id"]
    print(f"    Karakter: {char_id}")

    message = "Dun gece neredeydin?"

    # Eski yol
    _print_sub("Eski (/speak sync)")
    try:
        old_ms, old_ok = await old_speak(client, char_id, message)
        print(f"    Eski (/speak sync): {old_ms:.0f}ms {'OK' if old_ok else 'FAIL'}")
    except Exception as e:
        old_ms = None
        print(f"    Eski (/speak sync): HATA — {e}")

    # Yeni yol
    _print_sub("Yeni (/speak/stream)")
    try:
        events, first_audio, first_token, total = await consume_sse(
            client,
            f"/v1/characters/{char_id}/speak/stream",
            {"message": message, "voice": "alloy", "speed": 1.0},
        )
        sentences = sum(1 for ev in events if ev["type"] == "sentence_ready")
        chunks = sum(1 for ev in events if ev["type"] == "audio_chunk")
        print(f"    TTFT (ilk token):  {first_token:.0f}ms" if first_token else "    TTFT: N/A")
        print(f"    TTFA (ilk ses):    {first_audio:.0f}ms" if first_audio else "    TTFA: N/A")
        print(f"    Total:             {total:.0f}ms")
        print(f"    Cumleler: {sentences}, Audio chunks: {chunks}")
    except Exception as e:
        first_audio, first_token, total = None, None, None
        sentences, chunks = 0, 0
        print(f"    Yeni (/speak/stream): HATA — {e}")

    if old_ms and first_audio:
        print(f"    -> Ilk ses {old_ms / first_audio:.1f}x daha hizli")

    return {
        "old_total": old_ms,
        "new_ttft": first_token,
        "new_ttfa": first_audio,
        "new_total": total,
        "sentences": sentences,
        "chunks": chunks,
    }


# ── Test 4: Concurrent TTS Streaming ─────────────────────


async def test4_concurrent_tts(client: httpx.AsyncClient) -> dict:
    _print_header("Test 4: Concurrent TTS Streaming (3 paralel)")

    tasks = [
        consume_sse(client, "/v1/voice/tts/stream", {"text": "Ben sucsuzum.", "voice": "alloy"}),
        consume_sse(client, "/v1/voice/tts/stream", {"text": "Kimse iftira atamasin!", "voice": "zeynep"}),
        consume_sse(client, "/v1/voice/tts/stream", {"text": "Sakin olun hepimiz ayni taraftayiz.", "voice": "ali"}),
    ]

    wall_start = time.perf_counter()
    try:
        results_raw = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        print(f"    HATA — {e}")
        return {}
    wall_ms = (time.perf_counter() - wall_start) * 1000

    labels = ["alloy", "zeynep", "ali"]
    results = {}
    for i, (label, res) in enumerate(zip(labels, results_raw)):
        if isinstance(res, Exception):
            print(f"    {label}: HATA — {res}")
            results[label] = {"ttfa": None, "total": None}
        else:
            events, first_audio, _, total = res
            chunks = sum(1 for ev in events if ev["type"] == "audio_chunk")
            print(f"    {label:8s}: TTFA={first_audio:.0f}ms, total={total:.0f}ms, chunks={chunks}")
            results[label] = {"ttfa": first_audio, "total": total}

    print(f"    Wall time: {wall_ms:.0f}ms")
    results["wall_ms"] = wall_ms
    return results


# ── Test 5: Pipeline Concurrent (2 karakter) ─────────────


async def test5_concurrent_pipeline(client: httpx.AsyncClient) -> dict:
    _print_header("Test 5: Pipeline Concurrent (2 karakter ayni anda)")

    chars = [
        {
            "name": "Bench Kael",
            "role": "Nobetci",
            "archetype": "Supheci Sessiz",
            "system_prompt": "Sen sessiz bir nobetcisin. Kisa ve supheyle konus. 1-2 cumle.",
        },
        {
            "name": "Bench Mirra",
            "role": "Sifaci",
            "archetype": "Duru Idealist",
            "system_prompt": "Sen ilkeli bir sifacisin. Sakin ama kararlica konus. 2-3 cumle.",
        },
    ]

    char_ids = []
    for c in chars:
        r = await client.post(f"{BASE}/v1/characters", headers=AUTH, json=c)
        if r.status_code != 201:
            print(f"    {c['name']} olusturulamadi: {r.status_code}")
            return {}
        char_ids.append(r.json()["id"])
        print(f"    {c['name']}: {char_ids[-1]}")

    message = "Bu gece kim nerede kaldi?"
    tasks = [
        consume_sse(
            client,
            f"/v1/characters/{cid}/speak/stream",
            {"message": message, "voice": "alloy", "speed": 1.0},
        )
        for cid in char_ids
    ]

    wall_start = time.perf_counter()
    try:
        results_raw = await asyncio.gather(*tasks, return_exceptions=True)
    except Exception as e:
        print(f"    HATA — {e}")
        return {}
    wall_ms = (time.perf_counter() - wall_start) * 1000

    results = {}
    for i, (c, res) in enumerate(zip(chars, results_raw)):
        label = c["name"]
        if isinstance(res, Exception):
            print(f"    {label}: HATA — {res}")
            results[label] = {}
        else:
            events, first_audio, first_token, total = res
            sentences = sum(1 for ev in events if ev["type"] == "sentence_ready")
            chunks = sum(1 for ev in events if ev["type"] == "audio_chunk")
            ttft_str = f"TTFT={first_token:.0f}ms" if first_token else "TTFT=N/A"
            ttfa_str = f"TTFA={first_audio:.0f}ms" if first_audio else "TTFA=N/A"
            print(f"    {label:14s}: {ttft_str}, {ttfa_str}, total={total:.0f}ms, cumleler={sentences}, chunks={chunks}")
            results[label] = {"ttft": first_token, "ttfa": first_audio, "total": total}

    print(f"    Wall time: {wall_ms:.0f}ms")
    results["wall_ms"] = wall_ms
    return results


# ── Ozet Tablo ────────────────────────────────────────────


def print_summary(t1: dict, t3: dict, t4: dict):
    _print_header("Ozet: Eski vs Yeni")

    rows = []

    # TTS TTFA satirlari
    for label in ["Kisa (22 char)", "Orta (111 char)", "Uzun (319 char)"]:
        d = t1.get(label, {})
        old = d.get("old_total")
        new = d.get("new_ttfa")
        if old and new:
            rows.append((f"TTS TTFA ({label.split('(')[0].strip()})", f"{old:.0f}ms", f"{new:.0f}ms", f"{old / new:.1f}x"))
        else:
            rows.append((f"TTS TTFA ({label.split('(')[0].strip()})", "N/A", "N/A", "-"))

    # Pipeline satirlari
    old_total = t3.get("old_total")
    new_ttft = t3.get("new_ttft")
    new_ttfa = t3.get("new_ttfa")
    new_total = t3.get("new_total")

    if old_total and new_ttft:
        rows.append(("Pipeline TTFT", f"{old_total:.0f}ms", f"{new_ttft:.0f}ms", f"{old_total / new_ttft:.1f}x"))
    else:
        rows.append(("Pipeline TTFT", "N/A", "N/A", "-"))

    if old_total and new_ttfa:
        rows.append(("Pipeline TTFA", f"{old_total:.0f}ms", f"{new_ttfa:.0f}ms", f"{old_total / new_ttfa:.1f}x"))
    else:
        rows.append(("Pipeline TTFA", "N/A", "N/A", "-"))

    if old_total and new_total:
        rows.append(("Pipeline Total", f"{old_total:.0f}ms", f"{new_total:.0f}ms", f"{old_total / new_total:.1f}x"))
    else:
        rows.append(("Pipeline Total", "N/A", "N/A", "-"))

    # Concurrent TTS
    concurrent_ttfas = []
    for k, v in t4.items():
        if isinstance(v, dict) and v.get("ttfa"):
            concurrent_ttfas.append(v["ttfa"])
    if concurrent_ttfas:
        avg_ttfa = statistics.mean(concurrent_ttfas)
        rows.append(("3x Concurrent TTS TTFA", "-", f"{avg_ttfa:.0f}ms avg", "-"))

    # Tablo ciz
    col_w = [25, 12, 12, 10]
    sep = "+" + "+".join("-" * w for w in col_w) + "+"
    header = "|" + "|".join(h.center(w) for h, w in zip(["Metrik", "Eski", "Yeni", "Kazanc"], col_w)) + "|"

    print(f"\n{sep}")
    print(header)
    print(sep)
    for row in rows:
        line = "|" + "|".join(str(v).center(w) for v, w in zip(row, col_w)) + "|"
        print(line)
    print(sep)


# ── Main ──────────────────────────────────────────────────


async def main():
    print("=" * 60)
    print("  Streaming Benchmark: Eski (poll) vs Yeni (SSE)")
    print("=" * 60)

    # Health check
    async with httpx.AsyncClient(timeout=5.0) as hc:
        try:
            r = await hc.get(f"{BASE}/health")
            if r.status_code != 200:
                print(f"HATA: Server saglikli degil ({r.status_code})")
                return
        except httpx.ConnectError:
            print(f"HATA: Server ayakta degil ({BASE})")
            print("  -> python -m uvicorn api.main:app --port 9000")
            return

    print(f"  Server OK: {BASE}")

    async with httpx.AsyncClient(timeout=60.0) as client:
        t1 = await test1_tts_ttfa(client)
        t2 = await test2_voice_comparison(client)
        t3 = await test3_pipeline_ttfa(client)
        t4 = await test4_concurrent_tts(client)
        t5 = await test5_concurrent_pipeline(client)

    print_summary(t1, t3, t4)
    print("\nBenchmark tamamlandi.")


if __name__ == "__main__":
    asyncio.run(main())
