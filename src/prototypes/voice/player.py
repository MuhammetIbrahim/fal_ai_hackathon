"""
player.py — TTS Playback Modulu
================================
fal_services.tts_stream() ile gelen PCM16 chunk'lari
sounddevice uzerinden hoparlorden calar.

Kullanim:
    from src.prototypes.voice.player import speak, speak_streaming

    await speak("Merhaba, ben Dorin.")
    await speak_streaming("Bu cumle chunk chunk calinir.")
"""

from __future__ import annotations

import numpy as np
import sounddevice as sd

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))
from fal_services import tts_stream


async def speak(text: str, speed: float = 1.0) -> None:
    """
    Metni seslendir ve hoparlorden cal.
    Tum chunk'lari toplar, sonra tek seferde calar.
    Basit ve guvenilir.
    """
    chunks: list[bytes] = []
    async for pcm_chunk in tts_stream(text, speed=speed):
        chunks.append(pcm_chunk)

    if not chunks:
        return

    audio = b"".join(chunks)
    samples = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
    sd.play(samples, samplerate=16000, blocking=True)


async def speak_streaming(text: str, speed: float = 1.0) -> None:
    """
    Chunk geldikce aninda calmaya baslar.
    Daha dusuk latency — ilk chunk gelir gelmez ses baslar.
    """
    stream = sd.OutputStream(samplerate=16000, channels=1, dtype="float32")
    stream.start()
    try:
        async for pcm_chunk in tts_stream(text, speed=speed):
            samples = np.frombuffer(pcm_chunk, dtype=np.int16).astype(np.float32) / 32768.0
            stream.write(samples)
    finally:
        stream.stop()
        stream.close()
