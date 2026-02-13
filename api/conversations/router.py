from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response, StreamingResponse

from api.deps import get_tenant
from api.errors import NotFoundError
from api import store
from api.conversations import service
from api.conversations.schema import (
    CreateConversationRequest,
    TurnRequest,
    InjectRequest,
    ConversationResponse,
    ConversationCreatedResponse,
    TurnResponse,
    ConversationMessage,
)
from api.shared.schemas import PaginatedResponse

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.post("", response_model=ConversationCreatedResponse, status_code=201)
async def create_conversation(body: CreateConversationRequest, tenant_id: str = Depends(get_tenant)):
    return await service.create_conversation(tenant_id, body)


@router.get("", response_model=PaginatedResponse)
async def list_conversations(
    tenant_id: str = Depends(get_tenant),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    items, total = await store.list_conversations(tenant_id, limit, offset)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{conv_id}", response_model=ConversationResponse)
async def get_conversation(conv_id: str, tenant_id: str = Depends(get_tenant)):
    conv = await store.get_conversation(tenant_id, conv_id)
    if not conv:
        raise NotFoundError("CONV_NOT_FOUND", f"Konusma '{conv_id}' bulunamadi")
    return conv


@router.post("/{conv_id}/turn", response_model=TurnResponse)
async def advance_turn(conv_id: str, body: TurnRequest, tenant_id: str = Depends(get_tenant)):
    return await service.advance_turn(tenant_id, conv_id, body)


@router.post("/{conv_id}/turn/stream")
async def advance_turn_stream(conv_id: str, body: TurnRequest, tenant_id: str = Depends(get_tenant)):
    return StreamingResponse(
        service.advance_turn_stream(tenant_id, conv_id, body),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


@router.post("/{conv_id}/inject", response_model=ConversationMessage)
async def inject_message(conv_id: str, body: InjectRequest, tenant_id: str = Depends(get_tenant)):
    return await service.inject_message(tenant_id, conv_id, body)


@router.delete("/{conv_id}", status_code=204)
async def end_conversation(conv_id: str, tenant_id: str = Depends(get_tenant)):
    await service.end_conversation(tenant_id, conv_id)
    return Response(status_code=204)
