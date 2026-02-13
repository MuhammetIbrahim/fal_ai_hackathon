from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from api.deps import get_tenant
from api.llm import service
from api.llm.schema import LLMGenerateRequest, LLMGenerateResponse, LLMStreamRequest

router = APIRouter(prefix="/v1/llm", tags=["llm"])


@router.post("/generate", response_model=LLMGenerateResponse)
async def generate(body: LLMGenerateRequest, tenant_id: str = Depends(get_tenant)):
    return await service.generate(body)


@router.post("/stream")
async def stream(body: LLMStreamRequest, tenant_id: str = Depends(get_tenant)):
    return StreamingResponse(
        service.stream_sse(body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
