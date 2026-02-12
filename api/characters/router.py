from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response

from api.deps import get_tenant
from api.errors import NotFoundError
from api import store
from api.characters import service, memory
from api.characters.schema import (
    CreateCharacterRequest,
    BatchCreateRequest,
    SpeakRequest,
    ReactRequest,
    UpdateCharacterRequest,
    CharacterResponse,
    SpeechResponse,
    ReactionResponse,
    MemoryResponse,
)
from api.shared.schemas import PaginatedResponse

router = APIRouter(prefix="/v1/characters", tags=["characters"])


@router.post("", response_model=CharacterResponse, status_code=201)
async def create_character(body: CreateCharacterRequest, tenant_id: str = Depends(get_tenant)):
    return await service.create_character(tenant_id, body)


@router.get("", response_model=PaginatedResponse)
async def list_characters(
    tenant_id: str = Depends(get_tenant),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    items, total = await store.list_characters(tenant_id, limit, offset)
    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.post("/batch", status_code=201)
async def create_batch(body: BatchCreateRequest, tenant_id: str = Depends(get_tenant)):
    return await service.create_batch(tenant_id, body)


@router.get("/{char_id}", response_model=CharacterResponse)
async def get_character(char_id: str, tenant_id: str = Depends(get_tenant)):
    char = await store.get_character(tenant_id, char_id)
    if not char:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{char_id}' bulunamadi")
    return char


@router.patch("/{char_id}", response_model=CharacterResponse)
async def update_character(char_id: str, body: UpdateCharacterRequest, tenant_id: str = Depends(get_tenant)):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        char = await store.get_character(tenant_id, char_id)
        if not char:
            raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{char_id}' bulunamadi")
        return char
    char = await store.update_character(tenant_id, char_id, updates)
    if not char:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{char_id}' bulunamadi")
    return char


@router.delete("/{char_id}", status_code=204)
async def delete_character(char_id: str, tenant_id: str = Depends(get_tenant)):
    deleted = await store.delete_character(tenant_id, char_id)
    if not deleted:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{char_id}' bulunamadi")
    return Response(status_code=204)


@router.post("/{char_id}/speak", response_model=SpeechResponse)
async def speak(char_id: str, body: SpeakRequest, tenant_id: str = Depends(get_tenant)):
    return await service.generate_speech(tenant_id, char_id, body)


@router.post("/{char_id}/react", response_model=ReactionResponse)
async def react(char_id: str, body: ReactRequest, tenant_id: str = Depends(get_tenant)):
    return await service.generate_reaction(tenant_id, char_id, body)


@router.get("/{char_id}/memory", response_model=MemoryResponse)
async def get_memory(char_id: str, tenant_id: str = Depends(get_tenant)):
    char = await store.get_character(tenant_id, char_id)
    if not char:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{char_id}' bulunamadi")
    return await memory.get_memory(tenant_id, char_id)
