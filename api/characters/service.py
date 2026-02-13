from __future__ import annotations

import asyncio
import json
import random
import uuid
from pathlib import Path

import re
import base64

from fal_services import llm_generate, llm_stream, tts_stream
from api.config import get_api_settings
from api.errors import NotFoundError, ServiceError
from api.prompts.character_gen import ACTING_PROMPT_SYSTEM, VALIDATOR_SYSTEM
from api.prompts.dialogue import CHARACTER_WRAPPER, REACTION_SYSTEM
from api.prompts.moderation import MODERATOR_SYSTEM
from api import store
from api.characters.schema import (
    CreateCharacterRequest,
    BatchCreateRequest,
    SpeakRequest,
    ReactRequest,
)

_defaults = None


def _get_defaults() -> dict:
    global _defaults
    if not _defaults:
        p = Path(__file__).resolve().parent.parent / "data" / "defaults.json"
        _defaults = json.loads(p.read_text(encoding="utf-8"))
    return _defaults


async def create_character(tenant_id: str, req: CreateCharacterRequest) -> dict:
    settings = get_api_settings()
    defaults = _get_defaults()

    name = req.name or random.choice(defaults["names_pool"])

    if req.role:
        role = req.role
        role_lore = req.lore or ""
    else:
        r = random.choice(defaults["role_titles"])
        role = r["title"]
        role_lore = req.lore or r["lore"]

    if req.archetype:
        arch_match = next((a for a in defaults["archetypes"] if a["label"] == req.archetype), None)
        arch = arch_match or random.choice(defaults["archetypes"])
    else:
        arch = random.choice(defaults["archetypes"])

    tier_modifier = ""
    if req.skill_tier:
        tier_match = next((t for t in defaults["skill_tiers"] if t["tier"] == req.skill_tier), None)
        if tier_match:
            tier_modifier = tier_match["modifier"]

    world_context = req.world_context or ""
    if req.world_id:
        world = await store.get_world(tenant_id, req.world_id)
        if world:
            parts = []
            if world.get("name"):
                parts.append(world["name"])
            if world.get("description"):
                parts.append(world["description"])
            if world.get("tone"):
                parts.append(f"Atmosfer: {world['tone']}")
            world_context = ". ".join(parts) if parts else world_context

    if req.system_prompt:
        acting_prompt = req.system_prompt
    else:
        personality = req.personality or "Belirtilmedi — rol ve arketipten cikar."
        prompt = ACTING_PROMPT_SYSTEM.format(
            world_context=world_context or "Genel fantazi ortami.",
            role=role,
            archetype=f"{arch['label']} — {arch['description']}. Konusma tarzi: {arch['speech_style']}",
            lore=role_lore or "Belirtilmedi.",
            personality=personality,
        )
        if tier_modifier:
            prompt += f"\n\nBeceri seviyesi talimat: {tier_modifier}"

        result = await llm_generate(
            prompt=prompt,
            system_prompt="",
            model=settings.GENERATION_MODEL,
            temperature=settings.GENERATION_TEMPERATURE,
        )
        acting_prompt = result.output.strip()

        validation = await _validate(acting_prompt, settings)
        if not validation[0]:
            retry_result = await llm_generate(
                prompt=prompt + f"\n\nOnceki deneme basarisiz: {validation[1]}. Tekrar dene.",
                system_prompt="",
                model=settings.GENERATION_MODEL,
                temperature=settings.GENERATION_TEMPERATURE,
            )
            acting_prompt = retry_result.output.strip()

    char_id = f"char_{uuid.uuid4().hex[:12]}"
    data = {
        "name": name,
        "role": role,
        "archetype": arch["label"],
        "lore": role_lore or None,
        "personality": req.personality,
        "acting_prompt": acting_prompt,
        "skill_tier": req.skill_tier,
        "world_id": req.world_id,
    }
    return await store.save_character(tenant_id, char_id, data)


async def _validate(acting_prompt: str, settings) -> tuple[bool, str]:
    result = await llm_generate(
        prompt=f"Acting prompt:\n\n{acting_prompt}",
        system_prompt=VALIDATOR_SYSTEM,
        model=settings.VALIDATION_MODEL,
        temperature=settings.VALIDATION_TEMPERATURE,
        max_tokens=50,
    )
    text = result.output.strip()
    if text.startswith("PASS"):
        return True, ""
    reason = text.removeprefix("FAIL:").strip() if text.startswith("FAIL") else text
    return False, reason


async def create_batch(tenant_id: str, req: BatchCreateRequest) -> list[dict]:
    tasks = []
    for i in range(req.count):
        single = CreateCharacterRequest(
            role=req.roles[i] if req.roles and i < len(req.roles) else None,
            archetype=req.archetypes[i] if req.archetypes and i < len(req.archetypes) else None,
            world_id=req.world_id,
            world_context=req.world_context,
        )
        tasks.append(create_character(tenant_id, single))
    return await asyncio.gather(*tasks)


async def prepare_speech_context(tenant_id: str, character_id: str, message: str,
                                   context_messages=None, game_context=None,
                                   mood=None, system_prompt_override=None) -> tuple[dict, str]:
    """Karakter ve prompt hazirla. (char_dict, formatted_prompt) doner."""
    char = await store.get_character(tenant_id, character_id)
    if not char:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{character_id}' bulunamadi")

    world_context = ""
    if char.get("world_id"):
        world = await store.get_world(tenant_id, char["world_id"])
        if world:
            parts = []
            if world.get("name"):
                parts.append(world["name"])
            if world.get("description"):
                parts.append(world["description"])
            if world.get("tone"):
                parts.append(f"Atmosfer: {world['tone']}")
            world_context = ". ".join(parts)

    if game_context:
        world_context = f"{world_context}\n{game_context}" if world_context else game_context

    history_lines = []
    if context_messages:
        for msg in context_messages:
            r = msg.get("role", "kullanici")
            c = msg.get("content", "")
            history_lines.append(f"[{r}]: {c}")
    history_lines.append(f"[kullanici]: {message}")
    conversation_history = "\n".join(history_lines)

    system_prompt = system_prompt_override or char["acting_prompt"]

    prompt = CHARACTER_WRAPPER.format(
        name=char["name"],
        role_title=char["role"],
        acting_prompt=system_prompt,
        world_context=world_context or "Belirtilmedi.",
        mood=mood or "notr",
        conversation_history=conversation_history,
    )
    return char, prompt


async def generate_speech(tenant_id: str, character_id: str, req: SpeakRequest) -> dict:
    settings = get_api_settings()
    char, prompt = await prepare_speech_context(
        tenant_id, character_id, req.message,
        context_messages=req.context_messages,
        game_context=req.game_context,
        mood=req.mood,
        system_prompt_override=req.system_prompt_override,
    )
    system_prompt = req.system_prompt_override or char["acting_prompt"]

    result = await llm_generate(
        prompt=prompt, system_prompt=system_prompt,
        model=settings.DIALOGUE_MODEL, temperature=settings.DIALOGUE_TEMPERATURE,
    )
    message = result.output.strip()

    mod_result = None
    if char.get("world_id"):
        world = await store.get_world(tenant_id, char["world_id"])
        if world:
            taboo = world.get("taboo_words", [])
            rules = world.get("rules")
            if taboo or rules:
                mod_result = await moderate(message, taboo, rules)

    await store.add_exchange(tenant_id, character_id, {"role": "kullanici", "content": req.message})
    await store.add_exchange(tenant_id, character_id, {"role": "karakter", "content": message, "name": char["name"]})

    return {
        "character_id": character_id,
        "character_name": char["name"],
        "message": message,
        "mood": req.mood,
        "moderation": mod_result,
    }


async def generate_reaction(tenant_id: str, character_id: str, req: ReactRequest) -> dict:
    settings = get_api_settings()
    char = await store.get_character(tenant_id, character_id)
    if not char:
        raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{character_id}' bulunamadi")

    system = REACTION_SYSTEM.format(
        name=char["name"],
        archetype=char.get("archetype", ""),
        message=req.message,
    )

    context_block = f"\nEk baglam: {req.context}" if req.context else ""
    prompt = f"Mesaj: \"{req.message}\"{context_block}\n\nTepkin ne?"

    result = await llm_generate(
        prompt=prompt,
        system_prompt=system,
        model=settings.DIALOGUE_MODEL,
        temperature=settings.DIALOGUE_TEMPERATURE,
    )
    text = result.output.strip()

    lines = text.split("\n", 1)
    first_line = lines[0].strip().upper()
    wants_to_speak = first_line.startswith("WANT")
    reaction = lines[1].strip() if len(lines) > 1 else ""

    return {
        "character_id": character_id,
        "character_name": char["name"],
        "reaction": reaction,
        "wants_to_speak": wants_to_speak,
    }


async def moderate(text: str, taboo_words: list[str], rules: dict | None) -> dict:
    settings = get_api_settings()
    taboo_str = ", ".join(taboo_words) if taboo_words else "yok"
    rules_str = json.dumps(rules, ensure_ascii=False) if rules else "yok"

    system = MODERATOR_SYSTEM.format(taboo_words=taboo_str, rules=rules_str)

    result = await llm_generate(
        prompt=f"Kontrol edilecek konusma:\n\n{text}",
        system_prompt=system,
        model=settings.VALIDATION_MODEL,
        temperature=settings.MODERATION_TEMPERATURE,
        max_tokens=100,
    )
    output = result.output.strip()
    passed = output.startswith("PASS")
    reason = None
    if not passed:
        reason = output.removeprefix("VIOLATION:").strip() if output.startswith("VIOLATION") else output

    return {"passed": passed, "reason": reason}


def _split_sentences(text: str) -> list[str]:
    """Metni clause sinirlarinda bol (. ! ? , ; :) — TTS icin kisa parcalar."""
    parts = re.split(r'(?<=[.!?,;:])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


async def generate_speech_stream(tenant_id: str, character_id: str, req):
    """SSE formatinda LLM→TTS pipeline. asyncio.Queue ile LLM ve TTS paralel calisir."""
    settings = get_api_settings()

    try:
        char, prompt = await prepare_speech_context(
            tenant_id, character_id, req.message,
            context_messages=req.context_messages,
            game_context=req.game_context,
            mood=req.mood,
            system_prompt_override=req.system_prompt_override,
        )
    except NotFoundError:
        yield f"event: error\ndata: {json.dumps({'code': 'CHAR_NOT_FOUND', 'message': 'Karakter bulunamadi'})}\n\n"
        return

    system_prompt = req.system_prompt_override or char["acting_prompt"]

    queue = asyncio.Queue()

    async def llm_producer():
        try:
            async for token in llm_stream(
                prompt=prompt, system_prompt=system_prompt,
                model=settings.DIALOGUE_MODEL, temperature=settings.DIALOGUE_TEMPERATURE,
            ):
                await queue.put(("token", token))
            await queue.put(("done", None))
        except Exception as e:
            await queue.put(("error", str(e)))

    llm_task = asyncio.create_task(llm_producer())

    full_text = ""
    sentence_buffer = ""
    audio_chunk_index = 0

    try:
        while True:
            msg_type, data = await queue.get()

            if msg_type == "error":
                yield f"event: error\ndata: {json.dumps({'code': 'LLM_ERROR', 'message': data})}\n\n"
                return

            if msg_type == "done":
                break

            token = data
            yield f"event: text_token\ndata: {json.dumps({'token': token})}\n\n"
            full_text += token
            sentence_buffer += token

            sentences = re.findall(r'[^.!?,;:]*[.!?,;:]+', sentence_buffer)
            if sentences:
                completed = "".join(sentences)
                sentence_buffer = sentence_buffer[len(completed):]

                for sent in _split_sentences(completed):
                    yield f"event: sentence_ready\ndata: {json.dumps({'sentence': sent})}\n\n"
                    async for pcm_chunk in tts_stream(sent, speed=req.speed, voice=req.voice):
                        yield f"event: audio_chunk\ndata: {json.dumps({'chunk_index': audio_chunk_index, 'audio_base64': base64.b64encode(pcm_chunk).decode('ascii'), 'format': 'pcm16', 'sample_rate': 16000, 'channels': 1})}\n\n"
                        audio_chunk_index += 1

            elif len(sentence_buffer) > 40:
                last_space = sentence_buffer.rfind(' ', 0, 40)
                if last_space > 10:
                    chunk_to_speak = sentence_buffer[:last_space].strip()
                    sentence_buffer = sentence_buffer[last_space:].strip()

                    yield f"event: sentence_ready\ndata: {json.dumps({'sentence': chunk_to_speak})}\n\n"
                    async for pcm_chunk in tts_stream(chunk_to_speak, speed=req.speed, voice=req.voice):
                        yield f"event: audio_chunk\ndata: {json.dumps({'chunk_index': audio_chunk_index, 'audio_base64': base64.b64encode(pcm_chunk).decode('ascii'), 'format': 'pcm16', 'sample_rate': 16000, 'channels': 1})}\n\n"
                        audio_chunk_index += 1

        remaining = sentence_buffer.strip()
        if remaining:
            yield f"event: sentence_ready\ndata: {json.dumps({'sentence': remaining})}\n\n"
            async for pcm_chunk in tts_stream(remaining, speed=req.speed, voice=req.voice):
                yield f"event: audio_chunk\ndata: {json.dumps({'chunk_index': audio_chunk_index, 'audio_base64': base64.b64encode(pcm_chunk).decode('ascii'), 'format': 'pcm16', 'sample_rate': 16000, 'channels': 1})}\n\n"
                audio_chunk_index += 1

        full_message = full_text.strip()
        mod_result = None
        if char.get("world_id"):
            world = await store.get_world(tenant_id, char["world_id"])
            if world:
                taboo = world.get("taboo_words", [])
                rules = world.get("rules")
                if taboo or rules:
                    mod_result = await moderate(full_message, taboo, rules)

        if mod_result is not None:
            yield f"event: moderation\ndata: {json.dumps(mod_result)}\n\n"

        await store.add_exchange(tenant_id, character_id, {"role": "kullanici", "content": req.message})
        await store.add_exchange(tenant_id, character_id, {"role": "karakter", "content": full_message, "name": char["name"]})

        yield f"event: done\ndata: {json.dumps({'character_id': character_id, 'character_name': char['name'], 'message': full_message, 'mood': req.mood, 'moderation': mod_result, 'total_audio_chunks': audio_chunk_index})}\n\n"

    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'code': 'STREAM_ERROR', 'message': str(e)})}\n\n"
    finally:
        if not llm_task.done():
            llm_task.cancel()
