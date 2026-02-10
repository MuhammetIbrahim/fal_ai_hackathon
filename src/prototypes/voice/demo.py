"""
demo.py — Voice Prototype Demo
================================
3 AI agent sirali konusma testi.
fal_services.tts_stream() → sounddevice ile hoparlorden calar.

Calistirma:
    uv run python src/prototypes/voice/demo.py
    uv run python src/prototypes/voice/demo.py --streaming   # chunk chunk cal
"""

from __future__ import annotations

import asyncio
import argparse
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

from dotenv import load_dotenv
load_dotenv()

from fal_services import configure
from player import speak, speak_streaming


# ── Demo Konusmalari ─────────────────────────────────────

DEMO_SPEECHES = [
    (
        "Dorin",
        "Ateş söndüğünde herkes maskelerin ardına saklanır. "
        "Ama ben biliyorum, aramızda biri sahte. Bunu hissediyorum."
    ),
    (
        "Mirra",
        "Sahte mi dedin Dorin? Belki de sahte olan senin bu cesaretin. "
        "Gerçek cesaret, sessiz olandadır."
    ),
    (
        "Fenris",
        "İkiniz de çok konuşuyorsunuz. Konuşan değil, dinleyen bulur gerçeği. "
        "Ben dinliyorum ve bir şeyler duyuyorum."
    ),
    (
        "Seraphine",
        "Ocak sönmeden önce bir şey söylemem lazım. "
        "Bu gece rüyamda bir maske gördüm. Kimin yüzünde olduğunu hatırlamıyorum."
    ),
]


async def main():
    parser = argparse.ArgumentParser(description="Voice prototype demo")
    parser.add_argument("--streaming", action="store_true",
                        help="Chunk chunk cal (dusuk latency)")
    args = parser.parse_args()

    speak_fn = speak_streaming if args.streaming else speak
    mode = "streaming" if args.streaming else "buffered"

    print("=" * 50)
    print(f"  Voice Demo — {mode} mode")
    print("=" * 50)

    fal_key = os.environ.get("FAL_KEY", "")
    if not fal_key:
        print("HATA: FAL_KEY tanimli degil!")
        print("  .env dosyasina FAL_KEY=... ekle")
        sys.exit(1)
    configure(fal_key)

    for i, (name, text) in enumerate(DEMO_SPEECHES, 1):
        print(f"\n[{i}/{len(DEMO_SPEECHES)}] {name}: {text}")
        t0 = time.time()
        await speak_fn(text)
        elapsed = time.time() - t0
        print(f"  -> {elapsed:.1f}s")

        # Konusmalar arasi kisa bekleme
        if i < len(DEMO_SPEECHES):
            await asyncio.sleep(0.5)

    print("\n" + "=" * 50)
    print("  Demo bitti!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
