"""
api_client.py — Drop-in replacement for fal_services.py
=========================================================
Tum AI operasyonlari Character AI API (port 9000) uzerinden gecer.
fal_services.py ile birebir ayni fonksiyon imzalari ve return tipleri.

Kullanim (fal_services ile ayni):
    from src.services.api_client import llm_generate, tts_stream, generate_avatar
"""
from __future__ import annotations

import asyncio
import os
import json
import base64
from dataclasses import dataclass
from collections.abc import AsyncGenerator

import httpx

# ── Config ──────────────────────────────────────────
_api_base_url: str = os.environ.get("CHARACTER_API_URL", "http://localhost:9000")
_api_key: str = os.environ.get("CHARACTER_API_KEY", "demo-key-123")
_TIMEOUT = httpx.Timeout(180.0, connect=10.0)
_POLL_INTERVAL = 0.5


# ── Exception (ayni isim) ──────────────────────────
class FalServiceError(Exception):
    def __init__(self, service: str, message: str):
        self.service = service
        super().__init__(f"[{service}] {message}")


# ── Return Tipleri (fal_services ile birebir ayni) ──
@dataclass
class LLMResult:
    output: str

@dataclass
class TranscriptionResult:
    text: str

@dataclass
class TTSResult:
    audio_url: str
    inference_time_ms: float | None = None
    audio_duration_sec: float | None = None

@dataclass
class AvatarResult:
    image_url: str

@dataclass
class BackgroundResult:
    image_url: str


# ── Helpers ─────────────────────────────────────────
def _headers() -> dict:
    return {"Authorization": f"Bearer {_api_key}", "Content-Type": "application/json"}


async def _poll_job(client: httpx.AsyncClient, job_id: str) -> dict:
    """GET /v1/jobs/{job_id} ile job tamamlanana kadar bekle."""
    while True:
        resp = await client.get(f"{_api_base_url}/v1/jobs/{job_id}", headers=_headers())
        resp.raise_for_status()
        data = resp.json()
        if data["status"] == "completed":
            return data["result"]
        if data["status"] == "failed":
            err = data.get("error", {})
            raise FalServiceError("job", err.get("message", "Job failed"))
        await asyncio.sleep(_POLL_INTERVAL)


# ── configure() ────────────────────────────────────
def configure(fal_key: str = "", api_url: str = "", api_key: str = "") -> None:
    """
    Backward-compatible configure.
    fal_key kabul edilir ama yoksayilir (API kendi icinde halleder).
    api_url ve api_key Character AI API baglantisini ayarlar.
    """
    global _api_base_url, _api_key
    if api_url:
        _api_base_url = api_url
    if api_key:
        _api_key = api_key


# ═══════════════════════════════════════════════════
#  1. LLM — POST /v1/llm/generate
# ═══════════════════════════════════════════════════

async def llm_generate(
    prompt: str,
    system_prompt: str = "",
    model: str = "gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int | None = None,
    reasoning: bool | None = None,
) -> LLMResult:
    """Tam LLM yaniti — API uzerinden."""
    body: dict = {
        "prompt": prompt,
        "system_prompt": system_prompt,
        "model": model,
        "temperature": temperature,
    }
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    if reasoning is not None:
        body["reasoning"] = reasoning
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/llm/generate",
                headers=_headers(),
                json=body,
            )
            resp.raise_for_status()
        data = resp.json()
        return LLMResult(output=data["output"])
    except httpx.HTTPStatusError as e:
        raise FalServiceError("llm", f"HTTP {e.response.status_code}: {e.response.text[:200]}") from e
    except Exception as e:
        raise FalServiceError("llm", str(e)) from e


# ═══════════════════════════════════════════════════
#  2. LLM Stream — POST /v1/llm/stream (SSE)
# ═══════════════════════════════════════════════════

async def llm_stream(
    prompt: str,
    system_prompt: str = "",
    model: str = "gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int | None = None,
) -> AsyncGenerator[str, None]:
    """Token token yield — SSE parse."""
    body: dict = {
        "prompt": prompt,
        "system_prompt": system_prompt,
        "model": model,
        "temperature": temperature,
    }
    if max_tokens is not None:
        body["max_tokens"] = max_tokens
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{_api_base_url}/v1/llm/stream",
                headers=_headers(), json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        payload = line[6:]
                        if not payload.strip():
                            continue
                        try:
                            data = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        if "token" in data:
                            yield data["token"]
                        if "output" in data and "token" not in data:
                            break
    except Exception as e:
        raise FalServiceError("llm", str(e)) from e


# ═══════════════════════════════════════════════════
#  3. STT — POST /v1/voice/stt
# ═══════════════════════════════════════════════════

async def transcribe_audio(audio_bytes: bytes, language: str = "tr") -> TranscriptionResult:
    """Ham ses bytes'i metne cevirir."""
    body = {"audio_base64": base64.b64encode(audio_bytes).decode("ascii")}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/voice/stt",
                headers=_headers(),
                json=body,
            )
            resp.raise_for_status()
        return TranscriptionResult(text=resp.json()["text"])
    except Exception as e:
        raise FalServiceError("stt", str(e)) from e


async def transcribe_audio_url(audio_url: str, language: str = "tr") -> TranscriptionResult:
    """URL'deki ses dosyasini metne cevirir."""
    body = {"audio_url": audio_url}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/voice/stt",
                headers=_headers(),
                json=body,
            )
            resp.raise_for_status()
        return TranscriptionResult(text=resp.json()["text"])
    except Exception as e:
        raise FalServiceError("stt", str(e)) from e


# ═══════════════════════════════════════════════════
#  4. TTS Stream — POST /v1/voice/tts/stream (SSE)
# ═══════════════════════════════════════════════════

async def tts_stream(text: str, speed: float = 1.0, voice: str = "alloy") -> AsyncGenerator[bytes, None]:
    """PCM16 audio chunk'lari yield eder (16kHz, mono)."""
    body = {"text": text, "speed": speed, "voice": voice}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            async with client.stream(
                "POST", f"{_api_base_url}/v1/voice/tts/stream",
                headers=_headers(), json=body,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        payload = line[6:]
                        if not payload.strip():
                            continue
                        try:
                            data = json.loads(payload)
                        except json.JSONDecodeError:
                            continue
                        if "audio_base64" in data:
                            yield base64.b64decode(data["audio_base64"])
                        if data.get("total_chunks") is not None:
                            break
    except Exception as e:
        raise FalServiceError("tts", str(e)) from e


# ═══════════════════════════════════════════════════
#  5. TTS Generate — POST /v1/voice/tts + job poll
# ═══════════════════════════════════════════════════

async def tts_generate(
    text: str,
    speed: float = 1.0,
    response_format: str = "mp3",
    voice: str = "alloy",
) -> TTSResult:
    """Sesi uret, CDN URL dondur."""
    body = {"text": text, "speed": speed, "response_format": response_format, "voice": voice}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/voice/tts",
                headers=_headers(), json=body,
            )
            resp.raise_for_status()
            job_data = resp.json()
            result = await _poll_job(client, job_data["job_id"])
        return TTSResult(
            audio_url=result["audio_url"],
            inference_time_ms=result.get("inference_time_ms"),
            audio_duration_sec=result.get("audio_duration_sec"),
        )
    except FalServiceError:
        raise
    except Exception as e:
        raise FalServiceError("tts", str(e)) from e


# ═══════════════════════════════════════════════════
#  6. Avatar — POST /v1/images/avatar + job poll
# ═══════════════════════════════════════════════════

async def generate_avatar(
    description: str,
    world_tone: str = "dark fantasy medieval",
) -> AvatarResult:
    """Karakter icin avatar uret."""
    body = {"description": description, "world_tone": world_tone}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/images/avatar",
                headers=_headers(), json=body,
            )
            resp.raise_for_status()
            job_data = resp.json()
            result = await _poll_job(client, job_data["job_id"])
        return AvatarResult(image_url=result["image_url"])
    except FalServiceError:
        raise
    except Exception as e:
        raise FalServiceError("avatar", str(e)) from e


# ═══════════════════════════════════════════════════
#  7. Background — POST /v1/images/background + job poll
# ═══════════════════════════════════════════════════

async def generate_background(prompt: str) -> BackgroundResult:
    """Sahne arka plani uret."""
    body = {"prompt": prompt}
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(
                f"{_api_base_url}/v1/images/background",
                headers=_headers(), json=body,
            )
            resp.raise_for_status()
            job_data = resp.json()
            result = await _poll_job(client, job_data["job_id"])
        return BackgroundResult(image_url=result["image_url"])
    except FalServiceError:
        raise
    except Exception as e:
        raise FalServiceError("background", str(e)) from e


# ═══════════════════════════════════════════════════
#  8. Full Pipeline — STT -> LLM -> TTS (composed)
# ═══════════════════════════════════════════════════

async def full_pipeline(
    audio_bytes: bytes,
    system_prompt: str,
    model: str = "gemini-2.5-flash",
    language: str = "tr",
    speed: float = 1.0,
) -> AsyncGenerator[bytes, None]:
    """Tam konusma turu — PCM16 chunk'lari yield eder."""
    stt_result = await transcribe_audio(audio_bytes, language=language)
    if not stt_result.text.strip():
        return

    tokens: list[str] = []
    async for token in llm_stream(prompt=stt_result.text, system_prompt=system_prompt, model=model):
        tokens.append(token)
    ai_response = "".join(tokens)
    if not ai_response.strip():
        return

    async for pcm_chunk in tts_stream(ai_response, speed=speed):
        yield pcm_chunk
