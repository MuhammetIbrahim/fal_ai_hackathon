from __future__ import annotations

import base64
import base64 as b64
import json

from fal_services import tts_generate, tts_stream, transcribe_audio, transcribe_audio_url
from api.errors import ValidationError, ServiceError
from api.voice.schema import TTSRequest, STTRequest, TTSStreamRequest


async def tts(req: TTSRequest) -> dict:
    try:
        result = await tts_generate(
            text=req.text,
            speed=req.speed,
            response_format=req.response_format,
            voice=req.voice,
        )
        return {
            "audio_url": result.audio_url,
            "inference_time_ms": result.inference_time_ms,
            "audio_duration_sec": result.audio_duration_sec,
        }
    except Exception as e:
        raise ServiceError("TTS_ERROR", f"TTS servisi hatasi: {e}")


async def stt(req: STTRequest) -> dict:
    try:
        if req.audio_base64:
            audio_bytes = base64.b64decode(req.audio_base64)
            result = await transcribe_audio(audio_bytes, language="tr")
        elif req.audio_url:
            result = await transcribe_audio_url(req.audio_url, language="tr")
        else:
            raise ValidationError("MISSING_AUDIO", "audio_url veya audio_base64 gerekli")
        return {"text": result.text}
    except ValidationError:
        raise
    except Exception as e:
        raise ServiceError("STT_ERROR", f"STT servisi hatasi: {e}")


def get_voices() -> list[dict]:
    return [
        {"voice_id": "alloy", "name": "Alloy", "preview_url": None},
        {"voice_id": "zeynep", "name": "Zeynep", "preview_url": None},
        {"voice_id": "ali", "name": "Ali", "preview_url": None},
    ]


async def tts_stream_sse(req: TTSStreamRequest):
    """SSE formatinda PCM16 audio chunk yield eder."""
    try:
        chunk_index = 0
        async for pcm_chunk in tts_stream(text=req.text, speed=req.speed, voice=req.voice):
            payload = json.dumps({
                "chunk_index": chunk_index,
                "audio_base64": b64.b64encode(pcm_chunk).decode("ascii"),
                "format": "pcm16",
                "sample_rate": 16000,
                "channels": 1,
            })
            yield f"event: audio_chunk\ndata: {payload}\n\n"
            chunk_index += 1

        done_payload = json.dumps({"total_chunks": chunk_index, "format": "pcm16", "sample_rate": 16000})
        yield f"event: done\ndata: {done_payload}\n\n"
    except Exception as e:
        error_payload = json.dumps({"code": "TTS_STREAM_ERROR", "message": str(e)})
        yield f"event: error\ndata: {error_payload}\n\n"
