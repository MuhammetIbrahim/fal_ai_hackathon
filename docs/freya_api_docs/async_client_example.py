"""
SimCall / Town of Salem AI — fal.ai Async Client Ornegi
=======================================================
Tum servisleri (STT, LLM, TTS) async olarak calistiran ornek.
FastAPI backend'ine direkt entegre edilebilir.

Gereksinimler:
    pip install fal-client httpx

Env:
    export FAL_KEY="your-fal-api-key"
"""

import os
import asyncio
import base64
import httpx
import fal_client

# ─── Endpoint ID'leri ───────────────────────────────────────
TTS_ENDPOINT = "freya-mypsdi253hbk/freya-tts"
STT_ENDPOINT = "freya-mypsdi253hbk/freya-stt"
LLM_ENDPOINT = "openrouter/router"

FAL_KEY = os.getenv("FAL_KEY", "")
FAL_RUN_BASE = "https://fal.run"


# ═══════════════════════════════════════════════════════════
#  1. STT — Ses → Metin (Async HTTP)
# ═══════════════════════════════════════════════════════════
async def transcribe_audio(audio_bytes: bytes, language: str = "tr") -> str:
    """
    Ses dosyasini metne cevirir.
    audio_bytes: WAV/MP3 formatinda ses verisi
    language: "tr" (Turkce), "en" (Ingilizce), vs.
    """
    url = f"{FAL_RUN_BASE}/{STT_ENDPOINT}/audio/transcriptions"

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            url,
            headers={"Authorization": f"Key {FAL_KEY}"},
            files={"file": ("audio.wav", audio_bytes, "audio/wav")},
            data={"language": language},
        )
        response.raise_for_status()

    result = response.json()
    return result.get("text", "")


# ═══════════════════════════════════════════════════════════
#  2. LLM — Karakter AI Yaniti (Streaming)
# ═══════════════════════════════════════════════════════════
async def generate_character_response(
    character_prompt: str,
    user_message: str,
    model: str = "google/gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int = 200,
) -> str:
    """
    Karakter AI'sindan streaming yanit alir.
    character_prompt: Karakterin kisiligi ve rolu (system prompt)
    user_message: Kullanicinin dedigi sey
    """
    full_response = []

    stream = fal_client.stream_async(
        LLM_ENDPOINT,
        arguments={
            "system_prompt": character_prompt,
            "prompt": user_message,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    )

    async for event in stream:
        if isinstance(event, dict) and "output" in event:
            chunk = event["output"]
            full_response.append(chunk)
            print(f"  [LLM chunk] {chunk[:80]}")

    return "".join(full_response)


async def generate_character_response_full(
    character_prompt: str,
    user_message: str,
    model: str = "google/gemini-2.5-flash",
    temperature: float = 0.8,
    max_tokens: int = 200,
) -> dict:
    """
    Streaming yerine tum yaniti bekleyip dondurur.
    Queue bazli — webhook de destekler.
    """
    handler = await fal_client.submit_async(
        LLM_ENDPOINT,
        arguments={
            "system_prompt": character_prompt,
            "prompt": user_message,
            "model": model,
            "temperature": temperature,
            "max_tokens": max_tokens,
        },
    )

    result = await handler.get()
    return result


# ═══════════════════════════════════════════════════════════
#  3. TTS — Metin → Ses (Streaming PCM16)
# ═══════════════════════════════════════════════════════════
async def stream_tts(text: str, speed: float = 1.0):
    """
    Metni sese cevirir, PCM16 chunk'lari yield eder.
    Her chunk geldiginde aninda oynatilabilir.

    Kullanim:
        async for pcm_chunk in stream_tts("Merhaba"):
            websocket.send_bytes(pcm_chunk)
    """
    stream = fal_client.stream_async(
        TTS_ENDPOINT,
        arguments={"input": text, "speed": speed},
        path="/stream",
    )

    async for event in stream:
        if isinstance(event, dict):
            if "audio" in event:
                pcm_bytes = base64.b64decode(event["audio"])
                yield pcm_bytes

            if "error" in event:
                recoverable = event.get("recoverable", False)
                msg = event["error"].get("message", "Unknown")
                if not recoverable:
                    raise RuntimeError(f"TTS error: {msg}")
                print(f"  [TTS warning] {msg}")

            if event.get("done"):
                break


async def generate_tts_url(text: str, speed: float = 1.0) -> str:
    """
    Metni sese cevirir, CDN URL dondurur.
    Streaming gerektirmeyen durumlar icin (ornegin onceden uretilmis sesler).
    """
    handler = await fal_client.submit_async(
        TTS_ENDPOINT,
        arguments={
            "input": text,
            "response_format": "wav",
            "speed": speed,
        },
        path="/generate",
    )

    result = await handler.get()
    return result["audio"]["url"]


# ═══════════════════════════════════════════════════════════
#  4. FLUX — Avatar Uretimi (Async)
# ═══════════════════════════════════════════════════════════
async def generate_avatar(character_description: str) -> str:
    """
    Karakter icin avatar goruntusu uretir, CDN URL dondurur.
    """
    handler = await fal_client.submit_async(
        "fal-ai/flux/dev",
        arguments={
            "prompt": f"Portrait of {character_description}, digital art style, game character avatar, clean background",
            "image_size": "square",
            "num_images": 1,
        },
    )

    result = await handler.get()
    return result["images"][0]["url"]


# ═══════════════════════════════════════════════════════════
#  5. TAM PIPELINE — STT → LLM → TTS
# ═══════════════════════════════════════════════════════════
async def full_conversation_turn(
    audio_bytes: bytes,
    character_prompt: str,
    model: str = "google/gemini-2.5-flash",
) -> list[bytes]:
    """
    Tam bir konusma turu:
    1. Kullanicinin sesini metne cevir (STT)
    2. Karakter AI yanitini uret (LLM)
    3. Yaniti sese cevir (TTS streaming)

    Dondurulen: PCM16 audio chunk listesi
    """
    # Adim 1: STT
    print("[1/3] STT - ses → metin")
    user_text = await transcribe_audio(audio_bytes, language="tr")
    print(f"  Kullanici: '{user_text}'")

    # Adim 2: LLM
    print("[2/3] LLM - karakter dusunuyor")
    ai_response = await generate_character_response(
        character_prompt=character_prompt,
        user_message=user_text,
        model=model,
    )
    print(f"  AI: '{ai_response}'")

    # Adim 3: TTS Streaming
    print("[3/3] TTS - ses uretiliyor (streaming)")
    audio_chunks = []
    async for pcm_chunk in stream_tts(ai_response):
        audio_chunks.append(pcm_chunk)
        print(f"  chunk: {len(pcm_chunk)} bytes")

    print(f"  Toplam: {len(audio_chunks)} chunk, {sum(len(c) for c in audio_chunks)} bytes")
    return audio_chunks


# ═══════════════════════════════════════════════════════════
#  DEMO
# ═══════════════════════════════════════════════════════════
async def demo():
    """Canli ses olmadan test: direkt metin ile LLM + TTS pipeline'i."""

    print("=" * 60)
    print("SimCall — fal.ai Async Pipeline Demo")
    print("=" * 60)

    # Karakter prompt'u
    character = """Sen Ayşe'sin. Çağrı merkezi müşterisisin.
Sinirli ve sabırsızsın. Kargon 3 gün geç geldi.
Kısa ve sert cümleler kur. Türkçe konuş.
Çözüm sunulmazsa daha da sinirlen."""

    user_says = "Merhaba, size nasıl yardımcı olabilirim?"

    # LLM
    print("\n[LLM] Karakter yaniti uretiliyor...")
    response = await generate_character_response(
        character_prompt=character,
        user_message=user_says,
        temperature=0.9,
    )
    print(f"\nAyse: {response}")

    # TTS
    print("\n[TTS] Ses uretiliyor (streaming)...")
    chunk_count = 0
    total_bytes = 0
    async for pcm_chunk in stream_tts(response, speed=1.0):
        chunk_count += 1
        total_bytes += len(pcm_chunk)
        duration_ms = (len(pcm_chunk) // 2) / 16000 * 1000
        print(f"  chunk {chunk_count}: {len(pcm_chunk)} bytes ({duration_ms:.0f}ms audio)")

    print(f"\nToplam: {chunk_count} chunk, {total_bytes} bytes")
    print("Done!")


if __name__ == "__main__":
    if not FAL_KEY:
        print("HATA: FAL_KEY env variable tanimli degil!")
        print("  export FAL_KEY='your-key'")
        exit(1)

    asyncio.run(demo())
