from __future__ import annotations

import asyncio
import json
import uuid
import base64
import re

from fal_services import llm_generate, llm_stream, tts_stream
from api.config import get_api_settings
from api.errors import NotFoundError, ValidationError
from api.prompts.orchestrator import ORCHESTRATOR_SYSTEM
from api import store
from api.characters import service as char_service
from api.characters.schema import ReactRequest, SpeakRequest


# ── Helpers ───────────────────────────────────────────

def _split_clauses(text: str) -> list[str]:
    """Metni clause sinirlarinda bol (. ! ? , ; :) — TTS icin kisa parcalar."""
    parts = re.split(r'(?<=[.!?,;:])\s+', text.strip())
    return [p.strip() for p in parts if p.strip()]


def _turns_to_context(turns: list[dict]) -> list[dict]:
    """Conversation turn'lerini SpeakRequest context_messages formatina donustur."""
    ctx = []
    for t in turns:
        if t.get("role") == "karakter":
            ctx.append({"role": t.get("character_name", "karakter"), "content": t["content"]})
        elif t.get("role") in ("kullanici", "anlatici"):
            ctx.append({"role": t.get("role"), "content": t["content"]})
    return ctx


# ── 1. Create ─────────────────────────────────────────

async def create_conversation(tenant_id: str, req) -> dict:
    characters = []
    for cid in req.character_ids:
        char = await store.get_character(tenant_id, cid)
        if not char:
            raise NotFoundError("CHAR_NOT_FOUND", f"Karakter '{cid}' bulunamadi")
        characters.append(char)

    conv_id = f"conv_{uuid.uuid4().hex[:12]}"
    data = {
        "character_ids": req.character_ids,
        "topic": req.topic,
        "world_id": req.world_id,
        "max_turns": req.max_turns,
        "status": "active",
        "turns": [],
    }
    return await store.save_conversation(tenant_id, conv_id, data)


# ── 2. Collect Reactions ──────────────────────────────

async def _collect_reactions(
    tenant_id: str, character_ids: list[str], message: str, exclude_id: str | None = None
) -> list[dict]:
    """Tum karakterlerden tepki topla. exclude_id son konusmaciyi haric tutar."""
    ids_to_react = [cid for cid in character_ids if cid != exclude_id]

    async def _react(cid: str):
        req = ReactRequest(message=message)
        return await char_service.generate_reaction(tenant_id, cid, req)

    results = await asyncio.gather(*[_react(cid) for cid in ids_to_react], return_exceptions=True)

    reactions = []
    for r in results:
        if isinstance(r, Exception):
            continue
        reactions.append(r)
    return reactions


# ── 3. Orchestrator Pick ──────────────────────────────

async def _orchestrator_pick(
    characters: list[dict], reactions: list[dict], history: list[dict], settings
) -> tuple[str, str]:
    """Meta-LLM ile siradaki konusmaciyi sec. (character_id, reason) doner."""
    char_lines = []
    for c in characters:
        char_lines.append(f"- {c['id']}: {c['name']} ({c['role']}, {c.get('archetype', '?')})")

    reaction_lines = []
    for r in reactions:
        ws = "KONUSMAK ISTIYOR" if r["wants_to_speak"] else "sessiz"
        reaction_lines.append(f"- {r['character_id']} ({r['character_name']}): [{ws}] {r['reaction']}")

    last_msg = ""
    if history:
        last = history[-1]
        last_msg = f"[{last.get('character_name') or last.get('role', '?')}]: {last.get('content', '')}"

    prompt = ORCHESTRATOR_SYSTEM.format(
        characters="\n".join(char_lines),
        last_message=last_msg or "Konusma henuz baslamadi.",
        reactions="\n".join(reaction_lines) if reaction_lines else "Henuz tepki yok.",
    )

    valid_ids = {c["id"] for c in characters}

    try:
        result = await llm_generate(
            prompt="Siradaki konusmaci kim olmali? JSON yanit ver.",
            system_prompt=prompt,
            model=settings.ORCHESTRATOR_MODEL,
            temperature=settings.ORCHESTRATOR_TEMPERATURE,
            max_tokens=150,
        )
        text = result.output.strip()

        # JSON extraction — bazen LLM markdown code block icine sarar
        if "```" in text:
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        parsed = json.loads(text)
        speaker_id = parsed.get("next_speaker", "")
        reason = parsed.get("reason", "")

        # Gecersiz character_id fallback
        if speaker_id in valid_ids:
            return speaker_id, reason

    except Exception:
        pass

    # Fallback: wants_to_speak=True olan ilk karakter
    for r in reactions:
        if r["wants_to_speak"] and r["character_id"] in valid_ids:
            return r["character_id"], "Fallback — konusmak isteyen karakter secildi"

    # Son fallback: ilk karakter
    return characters[0]["id"], "Fallback — varsayilan karakter secildi"


# ── 4. Advance Turn (sync) ───────────────────────────

async def advance_turn(tenant_id: str, conv_id: str, req) -> dict:
    settings = get_api_settings()

    conv = await store.get_conversation(tenant_id, conv_id)
    if not conv:
        raise NotFoundError("CONV_NOT_FOUND", f"Konusma '{conv_id}' bulunamadi")
    if conv["status"] != "active":
        raise ValidationError("CONV_ENDED", "Konusma sona ermis")

    turns = conv.get("turns", [])
    if len(turns) >= conv.get("max_turns", 20):
        await store.update_conversation(tenant_id, conv_id, {"status": "ended"})
        raise ValidationError("MAX_TURNS", f"Maksimum tur sayisina ({conv['max_turns']}) ulasildi")

    # User message varsa ekle (sadece store'a — turns mutable referans, otomatik guncellenecek)
    if req.user_message:
        user_turn = {"role": "kullanici", "content": req.user_message}
        await store.add_conversation_turn(tenant_id, conv_id, user_turn)

    # Son mesaji belirle
    last_message = turns[-1]["content"] if turns else (req.user_message or conv.get("topic", "Merhaba"))

    # Son konusmaci
    last_speaker_id = None
    for t in reversed(turns):
        if t.get("role") == "karakter" and t.get("character_id"):
            last_speaker_id = t["character_id"]
            break

    # Karakterleri yukle
    characters = []
    for cid in conv["character_ids"]:
        char = await store.get_character(tenant_id, cid)
        if char:
            characters.append(char)

    # Tepkileri topla (son konusmaci haric)
    reactions = await _collect_reactions(tenant_id, conv["character_ids"], last_message, exclude_id=last_speaker_id)

    # Orkestrator: siradaki konusmaciyi sec
    speaker_id, reason = await _orchestrator_pick(characters, reactions, turns, settings)

    # Secilen karakter konussun
    context_messages = _turns_to_context(turns[-20:])  # Son 20 turn
    speak_req = SpeakRequest(message=last_message, context_messages=context_messages)
    speech = await char_service.generate_speech(tenant_id, speaker_id, speak_req)

    # Turn kaydet (sadece store'a)
    speaker_turn = {
        "role": "karakter",
        "character_id": speaker_id,
        "character_name": speech["character_name"],
        "content": speech["message"],
    }
    await store.add_conversation_turn(tenant_id, conv_id, speaker_turn)

    turn_number = len([t for t in turns if t.get("role") == "karakter"])

    return {
        "conversation_id": conv_id,
        "turn_number": turn_number,
        "speaker": speaker_turn,
        "reactions": reactions,
        "orchestrator_reason": reason,
    }


# ── 5. Advance Turn Stream (SSE) ─────────────────────

async def advance_turn_stream(tenant_id: str, conv_id: str, req):
    """SSE: reactions → speaker → text_token → sentence_ready → audio_chunk → done."""
    settings = get_api_settings()

    conv = await store.get_conversation(tenant_id, conv_id)
    if not conv:
        yield f"event: error\ndata: {json.dumps({'code': 'CONV_NOT_FOUND', 'message': 'Konusma bulunamadi'})}\n\n"
        return
    if conv["status"] != "active":
        yield f"event: error\ndata: {json.dumps({'code': 'CONV_ENDED', 'message': 'Konusma sona ermis'})}\n\n"
        return

    turns = conv.get("turns", [])
    if len(turns) >= conv.get("max_turns", 20):
        await store.update_conversation(tenant_id, conv_id, {"status": "ended"})
        yield f"event: error\ndata: {json.dumps({'code': 'MAX_TURNS', 'message': 'Maksimum tur sayisina ulasildi'})}\n\n"
        return

    try:
        # User message (sadece store'a)
        if req.user_message:
            user_turn = {"role": "kullanici", "content": req.user_message}
            await store.add_conversation_turn(tenant_id, conv_id, user_turn)

        last_message = turns[-1]["content"] if turns else (req.user_message or conv.get("topic", "Merhaba"))

        # Son konusmaci
        last_speaker_id = None
        for t in reversed(turns):
            if t.get("role") == "karakter" and t.get("character_id"):
                last_speaker_id = t["character_id"]
                break

        # Karakterleri yukle
        characters = []
        for cid in conv["character_ids"]:
            char = await store.get_character(tenant_id, cid)
            if char:
                characters.append(char)

        # Tepkileri topla
        reactions = await _collect_reactions(tenant_id, conv["character_ids"], last_message, exclude_id=last_speaker_id)

        # Reactions event
        yield f"event: reactions\ndata: {json.dumps({'reactions': reactions})}\n\n"

        # Orkestrator
        speaker_id, reason = await _orchestrator_pick(characters, reactions, turns, settings)
        speaker_char = next((c for c in characters if c["id"] == speaker_id), characters[0])

        yield f"event: speaker\ndata: {json.dumps({'character_id': speaker_id, 'character_name': speaker_char['name'], 'reason': reason})}\n\n"

        # LLM → TTS streaming pipeline (asyncio.Queue pattern)
        context_messages = _turns_to_context(turns[-20:])
        char, prompt = await char_service.prepare_speech_context(
            tenant_id, speaker_id, last_message,
            context_messages=context_messages,
        )
        system_prompt = char["acting_prompt"]

        full_text = ""
        sentence_buffer = ""
        audio_chunk_index = 0
        sent_count = 0

        # LLM producer — background task
        queue: asyncio.Queue = asyncio.Queue()

        async def llm_producer():
            try:
                async for token in llm_stream(
                    prompt=prompt,
                    system_prompt=system_prompt,
                    model=settings.DIALOGUE_MODEL,
                    temperature=settings.DIALOGUE_TEMPERATURE,
                ):
                    await queue.put(("token", token))
                await queue.put(("done", None))
            except Exception as e:
                await queue.put(("error", str(e)))

        llm_task = asyncio.create_task(llm_producer())

        # Consumer loop
        try:
            while True:
                msg_type, data = await queue.get()
                if msg_type == "error":
                    yield f"event: error\ndata: {json.dumps({'code': 'LLM_ERROR', 'message': data})}\n\n"
                    return
                if msg_type == "done":
                    break

                token = data
                full_text += token
                sentence_buffer += token
                yield f"event: text_token\ndata: {json.dumps({'token': token})}\n\n"

                # Clause split
                sentences = _split_clauses(sentence_buffer)
                if len(sentences) > 1:
                    ready = sentences[:-1]
                    sentence_buffer = sentences[-1]
                    for sent in ready:
                        sent_count += 1
                        yield f"event: sentence_ready\ndata: {json.dumps({'sentence': sent, 'index': sent_count - 1})}\n\n"
                        async for pcm_chunk in tts_stream(text=sent, speed=req.speed, voice=req.voice):
                            chunk_payload = json.dumps({
                                "chunk_index": audio_chunk_index,
                                "audio_base64": base64.b64encode(pcm_chunk).decode("ascii"),
                                "format": "pcm16",
                                "sample_rate": 16000,
                                "channels": 1,
                                "sentence_index": sent_count - 1,
                            })
                            yield f"event: audio_chunk\ndata: {chunk_payload}\n\n"
                            audio_chunk_index += 1

                # 40 char limit
                elif len(sentence_buffer) > 40:
                    last_space = sentence_buffer.rfind(' ', 0, 40)
                    if last_space > 10:
                        chunk_to_speak = sentence_buffer[:last_space].strip()
                        sentence_buffer = sentence_buffer[last_space:].strip()
                        sent_count += 1
                        yield f"event: sentence_ready\ndata: {json.dumps({'sentence': chunk_to_speak, 'index': sent_count - 1})}\n\n"
                        async for pcm_chunk in tts_stream(text=chunk_to_speak, speed=req.speed, voice=req.voice):
                            chunk_payload = json.dumps({
                                "chunk_index": audio_chunk_index,
                                "audio_base64": base64.b64encode(pcm_chunk).decode("ascii"),
                                "format": "pcm16",
                                "sample_rate": 16000,
                                "channels": 1,
                                "sentence_index": sent_count - 1,
                            })
                            yield f"event: audio_chunk\ndata: {chunk_payload}\n\n"
                            audio_chunk_index += 1
        finally:
            if not llm_task.done():
                llm_task.cancel()

        # Kalan buffer
        if sentence_buffer.strip():
            sent_count += 1
            yield f"event: sentence_ready\ndata: {json.dumps({'sentence': sentence_buffer.strip(), 'index': sent_count - 1})}\n\n"
            async for pcm_chunk in tts_stream(text=sentence_buffer.strip(), speed=req.speed, voice=req.voice):
                chunk_payload = json.dumps({
                    "chunk_index": audio_chunk_index,
                    "audio_base64": base64.b64encode(pcm_chunk).decode("ascii"),
                    "format": "pcm16",
                    "sample_rate": 16000,
                    "channels": 1,
                    "sentence_index": sent_count - 1,
                })
                yield f"event: audio_chunk\ndata: {chunk_payload}\n\n"
                audio_chunk_index += 1

        # Turn kaydet (sadece store'a)
        speaker_turn = {
            "role": "karakter",
            "character_id": speaker_id,
            "character_name": speaker_char["name"],
            "content": full_text.strip(),
        }
        await store.add_conversation_turn(tenant_id, conv_id, speaker_turn)

        turn_number = len([t for t in conv.get("turns", []) if t.get("role") == "karakter"])

        done_payload = json.dumps({
            "conversation_id": conv_id,
            "turn_number": turn_number,
            "speaker": speaker_turn,
            "reactions": reactions,
            "orchestrator_reason": reason,
            "total_audio_chunks": audio_chunk_index,
            "total_sentences": sent_count,
        })
        yield f"event: done\ndata: {done_payload}\n\n"

    except Exception as e:
        yield f"event: error\ndata: {json.dumps({'code': 'TURN_STREAM_ERROR', 'message': str(e)})}\n\n"


# ── 6. Inject Message ────────────────────────────────

async def inject_message(tenant_id: str, conv_id: str, req) -> dict:
    conv = await store.get_conversation(tenant_id, conv_id)
    if not conv:
        raise NotFoundError("CONV_NOT_FOUND", f"Konusma '{conv_id}' bulunamadi")
    if conv["status"] != "active":
        raise ValidationError("CONV_ENDED", "Konusma sona ermis")

    turn = {
        "role": "anlatici",
        "character_name": req.sender_name,
        "content": req.message,
    }
    await store.add_conversation_turn(tenant_id, conv_id, turn)
    return turn


# ── 7. End Conversation ──────────────────────────────

async def end_conversation(tenant_id: str, conv_id: str) -> bool:
    conv = await store.get_conversation(tenant_id, conv_id)
    if not conv:
        raise NotFoundError("CONV_NOT_FOUND", f"Konusma '{conv_id}' bulunamadi")
    await store.update_conversation(tenant_id, conv_id, {"status": "ended"})
    return True
