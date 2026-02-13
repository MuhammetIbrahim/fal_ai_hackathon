from __future__ import annotations

import json

from fal_services import llm_generate as _llm_generate, llm_stream as _llm_stream
from api.llm.schema import LLMGenerateRequest, LLMStreamRequest


def _strip_model_prefix(model: str) -> str:
    """game.py 'google/gemini-2.5-flash' gonderir, Gemini SDK 'gemini-2.5-flash' bekler."""
    if model.startswith("google/"):
        return model[len("google/"):]
    return model


async def generate(req: LLMGenerateRequest) -> dict:
    result = await _llm_generate(
        prompt=req.prompt,
        system_prompt=req.system_prompt,
        model=_strip_model_prefix(req.model),
        temperature=req.temperature,
        max_tokens=req.max_tokens,
        reasoning=req.reasoning,
    )
    return {"output": result.output}


async def stream_sse(req: LLMStreamRequest):
    """SSE: text_token event'leri, sonra done."""
    try:
        full_text = ""
        async for token in _llm_stream(
            prompt=req.prompt,
            system_prompt=req.system_prompt,
            model=_strip_model_prefix(req.model),
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        ):
            full_text += token
            yield f"event: text_token\ndata: {json.dumps({'token': token})}\n\n"
        yield f"event: done\ndata: {json.dumps({'output': full_text})}\n\n"
    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'code': 'LLM_ERROR', 'message': str(e)})}\n\n"
