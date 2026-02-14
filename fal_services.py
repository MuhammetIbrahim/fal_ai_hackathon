"""
fal_services.py — Hackathon Servis Modulu
==========================================
Freya TTS/STT (fal.ai), Gemini LLM (Google API), FLUX Avatar (fal.ai)
Tum fonksiyonlar async. Herhangi bir projeye kopyala-yapistir.

Kurulum:
    pip install fal-client httpx python-dotenv google-genai

Env:
    export FAL_KEY="your-fal-api-key"
    export GEMINI_API_KEY="your-gemini-api-key"

Kullanim:
    from fal_services import tts_stream, llm_generate, transcribe_audio
"""

from __future__ import annotations

import os
import base64
from dataclasses import dataclass, field
from collections.abc import AsyncGenerator

import httpx
import fal_client
from google import genai
from google.genai import types

# ── Endpoint'ler (fal.ai — TTS, STT, FLUX) ───────────────
TTS_ENDPOINT = "freya-mypsdi253hbk/freya-tts"
STT_ENDPOINT = "freya-mypsdi253hbk/freya-stt"
FLUX_ENDPOINT = "fal-ai/flux/dev"
FAL_RUN_BASE = "https://fal.run"

# ── Config ────────────────────────────────────────────────
_fal_key: str = os.environ.get("FAL_KEY", "")


def configure(fal_key: str) -> None:
    """Env yerine runtime'da key set et."""
    global _fal_key
    _fal_key = fal_key
    os.environ["FAL_KEY"] = fal_key


def _get_key() -> str:
    key = _fal_key or os.environ.get("FAL_KEY", "")
    if not key:
        raise FalServiceError("config", "FAL_KEY tanimli degil. export FAL_KEY=... veya configure('key') cagir.")
    return key


# ── Exception ─────────────────────────────────────────────
class FalServiceError(Exception):
    def __init__(self, service: str, message: str):
        self.service = service
        super().__init__(f"[{service}] {message}")


# ── Return Tipleri ────────────────────────────────────────
@dataclass
class TranscriptionResult:
    text: str

@dataclass
class LLMResult:
    output: str

@dataclass
class TTSResult:
    audio_url: str
    inference_time_ms: float | None = None
    audio_duration_sec: float | None = None

@dataclass
class AvatarResult:
    image_url: str


# ══════════════════════════════════════════════════════════
#  1. STT — Ses -> Metin
# ══════════════════════════════════════════════════════════

async def transcribe_audio(audio_bytes: bytes, language: str = "tr") -> TranscriptionResult:
    """
    Ham ses bytes'i metne cevirir (WAV/MP3).
    httpx ile multipart upload — WebSocket'ten gelen raw audio icin.
    """
    key = _get_key()
    url = f"{FAL_RUN_BASE}/{STT_ENDPOINT}/audio/transcriptions"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Key {key}"},
                files={"file": ("audio.wav", audio_bytes, "audio/wav")},
                data={"language": language},
            )
            resp.raise_for_status()
        return TranscriptionResult(text=resp.json().get("text", ""))
    except httpx.HTTPStatusError as e:
        raise FalServiceError("stt", f"HTTP {e.response.status_code}: {e.response.text[:200]}") from e
    except Exception as e:
        raise FalServiceError("stt", str(e)) from e


async def transcribe_audio_url(audio_url: str, language: str = "tr") -> TranscriptionResult:
    """
    URL'deki ses dosyasini metne cevirir.
    Audio zaten fal storage veya public CDN'de ise bunu kullan.
    """
    try:
        handler = await fal_client.submit_async(
            f"{STT_ENDPOINT}/generate",
            arguments={"audio_url": audio_url, "language": language},
        )
        result = await handler.get()
        text = result.get("text", "")
        if not text and "chunks" in result:
            text = " ".join(c.get("text", "") for c in result["chunks"])
        return TranscriptionResult(text=text)
    except Exception as e:
        raise FalServiceError("stt", str(e)) from e


# ══════════════════════════════════════════════════════════
#  2. LLM — Google Gemini API (dogrudan)
# ══════════════════════════════════════════════════════════

_gemini_client: genai.Client | None = None


def _get_gemini_client() -> genai.Client:
    global _gemini_client
    if not _gemini_client:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise FalServiceError("gemini", "GEMINI_API_KEY tanimli degil")
        _gemini_client = genai.Client(api_key=api_key)
    return _gemini_client


async def llm_generate(
    prompt: str,
    system_prompt: str = "",
    model: str = "gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int | None = None,
    reasoning: bool | None = None,
) -> LLMResult:
    """Gemini API ile tam yanit uret."""
    try:
        client = _get_gemini_client()
        config_kwargs: dict = {
            "temperature": temperature,
            "thinking_config": types.ThinkingConfig(thinking_budget=0),
        }
        if reasoning:
            config_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=8192)
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        config = types.GenerateContentConfig(**config_kwargs)

        response = await client.aio.models.generate_content(
            model=model,
            contents=prompt,
            config=config,
        )
        return LLMResult(output=response.text or "")
    except Exception as e:
        raise FalServiceError("llm", str(e)) from e


async def llm_stream(
    prompt: str,
    system_prompt: str = "",
    model: str = "gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int | None = None,
) -> AsyncGenerator[str, None]:
    """Gemini API ile token token yield et."""
    try:
        client = _get_gemini_client()
        config_kwargs: dict = {
            "temperature": temperature,
            "thinking_config": types.ThinkingConfig(thinking_budget=0),
        }
        if system_prompt:
            config_kwargs["system_instruction"] = system_prompt
        config = types.GenerateContentConfig(**config_kwargs)

        async for chunk in await client.aio.models.generate_content_stream(
            model=model,
            contents=prompt,
            config=config,
        ):
            if chunk.text:
                yield chunk.text
    except Exception as e:
        raise FalServiceError("llm", str(e)) from e


# ══════════════════════════════════════════════════════════
#  3. TTS — Metin -> Ses
# ══════════════════════════════════════════════════════════

async def tts_stream(text: str, speed: float = 1.0, voice: str = "alloy") -> AsyncGenerator[bytes, None]:
    """
    PCM16 audio chunk'lari yield eder (16kHz, mono).
    Her chunk geldiginde aninda WebSocket'e gonderilebilir.

    Kullanim:
        async for pcm_chunk in tts_stream("Merhaba"):
            await ws.send_bytes(pcm_chunk)
    """
    try:
        stream = fal_client.stream_async(
            TTS_ENDPOINT,
            arguments={"input": text, "speed": speed, "voice": voice},
            path="/stream",
        )
        async for event in stream:
            if not isinstance(event, dict):
                continue
            if "audio" in event:
                yield base64.b64decode(event["audio"])
            if "error" in event:
                msg = event["error"].get("message", "Unknown TTS error")
                if not event.get("recoverable", False):
                    raise FalServiceError("tts", msg)
            if event.get("done"):
                break
    except FalServiceError:
        raise
    except Exception as e:
        raise FalServiceError("tts", str(e)) from e


async def tts_generate(
    text: str,
    speed: float = 1.0,
    response_format: str = "mp3",
    voice: str = "alloy",
) -> TTSResult:
    """Sesi uret, CDN URL dondur. Streaming gerekmiyorsa bunu kullan.
    voice: 'alloy' | 'zeynep' | 'ali'
    """
    try:
        handler = await fal_client.submit_async(
            TTS_ENDPOINT,
            arguments={
                "input": text,
                "response_format": response_format,
                "speed": speed,
                "voice": voice,
            },
            path="/generate",
        )
        result = await handler.get()
        return TTSResult(
            audio_url=result["audio"]["url"],
            inference_time_ms=result.get("inference_time_ms"),
            audio_duration_sec=result.get("audio_duration_sec"),
        )
    except Exception as e:
        raise FalServiceError("tts", str(e)) from e


# ══════════════════════════════════════════════════════════
#  4. FLUX — Avatar Uretimi
# ══════════════════════════════════════════════════════════

async def generate_avatar(
    description: str,
    world_tone: str = "dark fantasy medieval",
) -> AvatarResult:
    """Karakter icin pixel-art avatar goruntusu uretir."""
    prompt = (
        f"2D pixel art game character portrait, {description}, "
        f"{world_tone} setting, clean solid dark background, "
        f"front-facing bust shot, detailed pixel art style"
    )
    try:
        handler = await fal_client.submit_async(
            FLUX_ENDPOINT,
            arguments={
                "prompt": prompt,
                "image_size": "square",
                "num_images": 1,
            },
        )
        result = await handler.get()
        return AvatarResult(image_url=result["images"][0]["url"])
    except Exception as e:
        raise FalServiceError("flux", str(e)) from e


@dataclass
class BackgroundResult:
    image_url: str


async def generate_background(prompt: str) -> BackgroundResult:
    """Sahne arka plani goruntusu uretir."""
    try:
        handler = await fal_client.submit_async(
            FLUX_ENDPOINT,
            arguments={
                "prompt": prompt,
                "image_size": "landscape_16_9",
                "num_images": 1,
            },
        )
        result = await handler.get()
        return BackgroundResult(image_url=result["images"][0]["url"])
    except Exception as e:
        raise FalServiceError("flux", str(e)) from e


# ══════════════════════════════════════════════════════════
#  5. FULL PIPELINE — STT -> LLM -> TTS (streaming)
# ══════════════════════════════════════════════════════════

async def full_pipeline(
    audio_bytes: bytes,
    system_prompt: str,
    model: str = "gemini-2.5-flash",
    language: str = "tr",
    speed: float = 1.0,
) -> AsyncGenerator[bytes, None]:
    """
    Tam konusma turu — PCM16 chunk'lari yield eder.

    1. STT: ses -> metin
    2. LLM: metin -> AI yaniti (streaming, biriktir)
    3. TTS: yanit -> ses (streaming, yield)

    Kullanim:
        async for pcm_chunk in full_pipeline(audio, system_prompt):
            await ws.send_bytes(pcm_chunk)
    """
    # 1. STT
    stt_result = await transcribe_audio(audio_bytes, language=language)
    user_text = stt_result.text
    if not user_text.strip():
        return

    # 2. LLM — tum tokenlari biriktir
    tokens: list[str] = []
    async for token in llm_stream(
        prompt=user_text,
        system_prompt=system_prompt,
        model=model,
    ):
        tokens.append(token)
    ai_response = "".join(tokens)
    if not ai_response.strip():
        return

    # 3. TTS — streaming yield
    async for pcm_chunk in tts_stream(ai_response, speed=speed):
        yield pcm_chunk


# ══════════════════════════════════════════════════════════
#  DEMO — python fal_services.py
# ══════════════════════════════════════════════════════════

async def _demo():
    import sys

    print("=" * 50)
    print("fal_services.py — Demo")
    print("=" * 50)

    character = (
        "Sen Ayse'sin. Cagri merkezi musterisisin. "
        "Sinirli ve sabirsizsin. Kargon 3 gun gec geldi. "
        "Kisa ve sert cumleler kur. Turkce konus."
    )
    user_says = "Merhaba, size nasil yardimci olabilirim?"

    # LLM test
    print("\n[1] LLM generate...")
    result = await llm_generate(prompt=user_says, system_prompt=character)
    print(f"  Ayse: {result.output}")

    # LLM stream test
    print("\n[2] LLM stream...")
    chunks = []
    async for token in llm_stream(prompt=user_says, system_prompt=character):
        chunks.append(token)
        print(f"  token: {token[:60]}", end="\r")
    full = "".join(chunks)
    print(f"  Ayse (stream): {full}")

    # TTS stream test
    print("\n[3] TTS stream...")
    chunk_count = 0
    total_bytes = 0
    async for pcm in tts_stream(full, speed=1.0):
        chunk_count += 1
        total_bytes += len(pcm)
    print(f"  {chunk_count} chunk, {total_bytes} bytes")

    # TTS generate test
    print("\n[4] TTS generate (CDN)...")
    tts = await tts_generate("Merhaba dunya")
    print(f"  URL: {tts.audio_url[:80]}...")

    # Avatar test
    print("\n[5] Avatar (FLUX)...")
    avatar = await generate_avatar("angry Turkish woman, red hair, call center headset")
    print(f"  URL: {avatar.image_url[:80]}...")

    # STT test (opsiyonel)
    if len(sys.argv) > 1:
        wav_path = sys.argv[1]
        print(f"\n[6] STT ({wav_path})...")
        with open(wav_path, "rb") as f:
            audio = f.read()
        stt = await transcribe_audio(audio)
        print(f"  Metin: {stt.text}")

    print("\nDone!")


if __name__ == "__main__":
    import asyncio
    from dotenv import load_dotenv
    load_dotenv()
    _fal_key = os.environ.get("FAL_KEY", "")
    if not _fal_key:
        print("HATA: FAL_KEY tanimli degil!")
        print("  export FAL_KEY='your-key'  veya  .env dosyasina yaz")
        exit(1)
    asyncio.run(_demo())
