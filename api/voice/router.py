from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from api.deps import get_tenant
from api.jobs import job_manager
from api.voice import service
from api.voice.schema import TTSRequest, STTRequest, VoiceListResponse, TTSStreamRequest

router = APIRouter(prefix="/v1/voice", tags=["voice"])


@router.post("/tts", status_code=202)
async def text_to_speech(body: TTSRequest, tenant_id: str = Depends(get_tenant)):
    job = job_manager.submit(tenant_id, "tts", service.tts(body))
    return {"job_id": job.job_id, "status": job.status}


@router.post("/tts/stream")
async def text_to_speech_stream(body: TTSStreamRequest, tenant_id: str = Depends(get_tenant)):
    return StreamingResponse(
        service.tts_stream_sse(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/stt")
async def speech_to_text(body: STTRequest, tenant_id: str = Depends(get_tenant)):
    return await service.stt(body)


@router.get("/voices", response_model=VoiceListResponse)
async def list_voices(tenant_id: str = Depends(get_tenant)):
    return {"voices": service.get_voices()}
