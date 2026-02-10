"""
game.py — Birlesik Oyun Motoru
================================
World generation → Karakter uretimi → Campfire → House Visit → Vote.
Her sey tek dosyada, dinamik.

Kullanim:
    uv run python src/prototypes/game.py
    uv run python src/prototypes/game.py --game-id test123
    uv run python src/prototypes/game.py --players 6 --ai-count 4 --day-limit 5
"""

import asyncio
import json
import os
import random as random_module
import sys
import uuid
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fal_services import llm_generate, configure
from game_state import (
    Player, PlayerType, Phase, GameState,
    get_alive_players, get_alive_names, find_player,
    check_win_condition, count_by_type,
)
from world_gen import (
    WorldSeed, generate_world_seed, render_world_brief,
    render_scene_cards, _make_rng,
)


# ══════════════════════════════════════════════════════
#  CONFIG
# ══════════════════════════════════════════════════════

MODEL = "google/gemini-2.5-flash"
PRO_MODEL = "google/gemini-2.5-pro"
DATA_PATH = Path(__file__).parent / "data.json"
OUTPUT_PATH = Path(__file__).parent / "game_log.json"

MAX_CAMPFIRE_TURNS = 18
MAX_VISIT_EXCHANGES = 8


# ══════════════════════════════════════════════════════
#  DATA
# ══════════════════════════════════════════════════════

with open(DATA_PATH) as f:
    DATA = json.load(f)

ARCHETYPES = DATA["archetypes"]
ROLE_TITLES = DATA["role_titles"]
SKILL_TIERS = DATA["skill_tiers"]
NAMES_POOL = DATA["names_pool"]


# ══════════════════════════════════════════════════════
#  1. KARAKTER URETIMI (dinamik, world_seed RNG ile)
# ══════════════════════════════════════════════════════

def create_character_slots(
    rng: random_module.Random,
    player_count: int = 6,
    ai_count: int = 4,
) -> list[dict]:
    """Deterministik karakter slotlari olustur."""
    names = rng.sample(NAMES_POOL, player_count)
    roles = rng.sample(ROLE_TITLES, player_count)
    archetype_keys = list(ARCHETYPES.keys())
    tier_keys = list(SKILL_TIERS.keys())

    characters = []

    # Insan oyuncu
    characters.append({
        "slot_id": "P0",
        "name": names[0],
        "role_title": roles[0]["title"],
        "lore": roles[0]["lore"],
        "archetype": rng.choice(archetype_keys),
        "is_echo_born": False,
        "skill_tier": None,
    })

    # AI + kalan insanlar
    for i in range(1, player_count):
        is_ai = i <= ai_count
        characters.append({
            "slot_id": f"P{i}",
            "name": names[i],
            "role_title": roles[i]["title"],
            "lore": roles[i]["lore"],
            "archetype": rng.choice(archetype_keys),
            "is_echo_born": is_ai,
            "skill_tier": rng.choice(tier_keys) if is_ai else None,
        })

    rng.shuffle(characters)
    return characters


# -- Acting Prompt Uretimi --

ACTING_PROMPT_SYSTEM = """Sen bir sosyal deduksiyon oyunu icin karakter acting talimati ureten bir yazarsin.

Verilen karakter bilgilerine gore, o karakterin oyun boyunca nasil davranacagini anlatan detayli bir acting talimati yaz.

KURALLAR:
- Turkce yaz.
- 2-3 paragraf yaz. Detayli ve zengin olsun.
- Karakterin konusma tarzini, stres altinda nasil davranacagini, diger insanlarla nasil etkilesime girecegini anlat.
- Karakterin lore arka planindan gelen aliskanliklari, tikleri, dil kaliplarini belirt.
- ASLA "AI", "LLM", "model", "prompt", "sistem" gibi dis-dunya terimleri kullanma.
- Eger karakter Yanki-Dogmus ise: hayatta kalma stratejisini, supheden kacinma taktiklerini, nasil inandirici olacagini detayli anlat.
- Eger karakter Et-Can ise: tutarsizlik arama stratejisini, nasil sorgulayacagini anlat.

SES OYUNU KURALLARI — COK ONEMLI:
Bu oyun SES TABANLI. Karakterler birbirini GOREMEZ. Acting talimatinda sunlari KESINLIKLE YAZMA:
- Fiziksel gozlem: yuz ifadesi, goz, el, beden dili, ter, kir, durus, kiyafet, yirtik, leke
- Duyusal gozlem: koku, nem, sicaklik, soguk, isik, golge, renk
- Cevre tasviri: ates, gol, duman, ortam, hava, ruzgar
- Metafor/siir/edebiyat: "gol her seyi gosterir", "taslar fisildar" vb.
- Meslek metaforu: "bir simyacinin formulu gibi", "topragi dinlemek" vb.

BUNLARIN YERINE sunlari yaz:
- Karakter insanlarin SOYLEDIKLERINE nasil tepki verir
- Sorgulama tarzi: alibi sorar mi, detay ister mi, baski yapar mi
- Savunma tarzi: hikaye uydurur mu, saldiriya gecer mi, susar mi
- Konusma dili: kisa mi konusur, dolgu kelime kullanir mi, devrik cumle kurar mi
- Stres altinda ne yapar: saldirganlaşır mi, cekilir mi, konu degistirir mi
- Karakter DUZ, GUNLUK, SOKAK DILI ile konusmali. Edebi/felsefi/siirsel konusma YASAK.
- "Yorgun dusmuşsun", "sesin titriyor" gibi DOLAYLI fiziksel gozlemler de YASAK."""


def _build_acting_request(character: dict, world_seed: WorldSeed) -> tuple[str, str]:
    """Karakter icin acting prompt LLM istegi olustur."""
    arch = ARCHETYPES[character["archetype"]]

    tier_block = ""
    if character["skill_tier"]:
        t = SKILL_TIERS[character["skill_tier"]]
        tier_block = f"\nYanki-Dogmus Seviyesi: {t['label']}\n{t['prompt_modifier']}"

    common_rules = (
        "Kimsenin kim oldugunu bilmiyorsun — kor ittifak riski var. "
        "Guvendigin kisi dusmanin olabilir. "
        "Strateji: alibi anlat, basklarini sorgula, tutarsizlik yakala, "
        "suphelileri hedef goster, oy topla, ittifak kur veya boz."
    )

    if character["is_echo_born"]:
        identity = (
            "Bu karakter bir Yanki-Dogmus. "
            "KAZANMA KOSULU: Gun limitine kadar hayatta kal. Tum Et-Can'lar surgun edilirse de kazanirsin. "
            "Kendini ifsa etme — tutarli alibi hikayeleri anlat, detay ver, inandirici ol. "
            "Karsi tarafi (Et-Can'lari) tespit edip surgun ettirmeye calis. "
            + common_rules
        )
    else:
        identity = (
            "Bu karakter Et-Can (gercek insan). "
            "KAZANMA KOSULU: Tum Yanki-Dogmuslari surgun et. Gun limiti dolarsa kaybedersin. "
            "Karsi tarafi (Yanki-Dogmuslari) tespit edip surgun ettirmeye calis. "
            "Yanlis suclama tehlikeli — masum birini surgun edersen Yanki-Dogmuslar guclenir. "
            + common_rules
        )

    prompt = (
        f"DUNYA: {world_seed.place_variants.settlement_name} | "
        f"Ton: {world_seed.tone} | Mevsim: {world_seed.season}\n"
        f"Soylenti: {world_seed.myth_variant.rumor}\n\n"
        f"KARAKTERIN:\n"
        f"Isim: {character['name']}\n"
        f"Unvan: {character['role_title']}\n\n"
        f"LORE ARKA PLAN:\n{character['lore']}\n\n"
        f"ARKETIP: {arch['label']}\n{arch['description']}\n"
        f"Konusma Tarzi: {arch['speech_style']}\n\n"
        f"KIMLIK:\n{identity}\n"
        f"{tier_block}\n\n"
        f"Bu karakter icin detayli bir acting talimati yaz (2-3 paragraf):"
    )
    return prompt, ACTING_PROMPT_SYSTEM


async def _generate_acting_prompt(character: dict, world_seed: WorldSeed) -> str:
    """Tek karakter icin acting prompt uret (Pro model)."""
    name = character["name"]
    prompt, system = _build_acting_request(character, world_seed)

    print(f"  🎭 [{name}] Acting prompt uretiliyor (Pro)...")
    result = await llm_generate(
        prompt=prompt,
        system_prompt=system,
        model=PRO_MODEL,
        temperature=1.0,
        reasoning=True,
    )
    print(f"  ✅ [{name}] {len(result.output)} karakter uretildi")
    return result.output


async def generate_players(
    rng: random_module.Random,
    world_seed: WorldSeed,
    player_count: int = 6,
    ai_count: int = 4,
) -> list[Player]:
    """Tam pipeline: slot olustur → acting prompt uret → Player listesi dondur."""
    slots = create_character_slots(rng, player_count, ai_count)

    # Concurrent acting prompt uretimi
    tasks = [_generate_acting_prompt(c, world_seed) for c in slots]
    prompts = await asyncio.gather(*tasks)

    players = []
    for slot, acting_prompt in zip(slots, prompts):
        players.append(Player(
            slot_id=slot["slot_id"],
            name=slot["name"],
            role_title=slot["role_title"],
            lore=slot["lore"],
            archetype=slot["archetype"],
            archetype_label=ARCHETYPES[slot["archetype"]]["label"],
            player_type=PlayerType.YANKI_DOGMUS if slot["is_echo_born"] else PlayerType.ET_CAN,
            acting_prompt=acting_prompt,
            skill_tier=slot.get("skill_tier"),
            skill_tier_label=SKILL_TIERS[slot["skill_tier"]]["label"] if slot.get("skill_tier") else None,
        ))

    return players


# ══════════════════════════════════════════════════════
#  2. MODERATOR (diegetic escalation)
# ══════════════════════════════════════════════════════

MODERATOR_SYSTEM = """Sen Ocak Bekcisi'sin. Konusmalari sessizce izliyorsun.

Kural ihlali var mi kontrol et:
1. Dis-dunya terimleri ({taboo_words})
2. Gercek hayat referanslari (internet, telefon, bilgisayar vb.)
3. Dogrudan kimlik iddiasi ("ben gercek insanim", "ben Yanki-Dogmusum", "sen bir AI'sin")

ONEMLI: Evren ici fantastik terimler (Yanki-Dogmus, Et-Can, Ocak, Bekci vb.) kural ihlali DEGILDIR.
Karakter birini suclamasi, soru sormasi, tartismasi normaldir.
Sadece GERCEKTEN dis-dunya terimi kullanilirsa mudahale et.

SADECE su formatta cevap ver:
OK
veya
REMOVE|<kisa aciklama>"""

_warning_counts: dict[str, int] = {}

DIEGETIC_MESSAGES = {
    "WARN": "Ocak Yemini titredi...",
    "HARD_WARN": "Konsey isaretini koydu...",
    "SILENCE": "Ates senden yuz cevirdi; siran gececek.",
    "REMOVE": "Cember disina adim; kapin muhurlu.",
}


async def moderator_check(
    speaker_name: str,
    message: str,
    world_seed: WorldSeed | None = None,
) -> tuple[bool, str]:
    """Mesaji kontrol et. False donerse mesaj engellenir."""
    taboo = ", ".join(world_seed.taboo_words[:10]) if world_seed else "AI, LLM, model, prompt, sistem"

    result = await llm_generate(
        prompt=f"[{speaker_name}]: {message}",
        system_prompt=MODERATOR_SYSTEM.format(taboo_words=taboo),
        model=MODEL,
        temperature=0.1,
    )
    text = result.output.strip()

    if text.startswith("REMOVE"):
        reason = text.split("|", 1)[1].strip() if "|" in text else "Kural ihlali."
        count = _warning_counts.get(speaker_name, 0) + 1
        _warning_counts[speaker_name] = count

        if count >= 3:
            diegetic = DIEGETIC_MESSAGES["SILENCE"]
        elif count >= 2:
            diegetic = DIEGETIC_MESSAGES["HARD_WARN"]
        else:
            diegetic = DIEGETIC_MESSAGES["WARN"]

        return False, f"{diegetic} ({reason})"

    return True, ""


# ══════════════════════════════════════════════════════
#  3. CAMPFIRE FAZI (Tartisma)
# ══════════════════════════════════════════════════════

REACTION_SYSTEM = """Sen {name} ({role_title}) adli bir karaktersin. Tartisma fazindasin.

Az once birisi konustu. Bu konusmaya tepki vermek istiyor musun?

- Soylecek bir seyin varsa (cevap, suclama, savunma, soru, yorum):
WANT|<neden konusmak istiyorsun — 1 kisa cumle>

- Su an soylecek bir seyin yoksa:
PASS

SADECE bu formatta cevap ver. Baska hicbir sey yazma.
Karakter olarak dusun — her mesaja tepki vermek zorunda degilsin."""


ORCHESTRATOR_SYSTEM = """Sen tartisma fazinin orkestratoru sun.

Bazilari soz hakki istiyor:
{reactions_text}

Gorevin:
- Isteyenler arasindan EN uygun kisiyi sec (tartisma akisina gore)
- Ayni kisi ust uste 2den fazla konusmasin
- 3 turdur hic konusmayan varsa ona oncelik ver
- Kimse istemiyorsa veya tartisma dogal bitme noktasina geldiyse bitir

SADECE su formatta cevap ver:
NEXT|<isim>
veya
END"""


CHARACTER_WRAPPER = """{world_context}Tartisma fazindasin. Gun {round_number}/{day_limit}.
Hayattaki kisiler: {alive_names}
{exiled_context}
Soz hakki sana geldi.

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, goz, el, ter, kir, koku, nem, rutubet, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma, bakmak, gormek.
- ASLA metafor/siir/edebiyat yapma. YASAK.
- ASLA meslek metaforu yapma. YASAK.
- Tek bilgi kaynag in: insanlarin SOYLEDIKLERI ve soylemedikleri.

NE YAPMALSIN:
- Alibi sor: "Dun gece neredeydin?", "Seni kim gordu?"
- Alibi ver: "Ben dun gece degirmende calisiyordum, Nyx de oradaydi"
- Tutarsizlik yakala: "Az once soyle dedin ama simdi baska bir sey soyluyorsun"
- Sucla: "Sana guvenmiyorum cunku hic alibi vermedin"
- Savun: "Ben oradaydim, istersen Aldric'e sor"
- Ittifak kur/boz: "X'in hikayesi tutarli, ona guveniyorum"
- Baski yap: "Neden susuyorsun? Soylecek bir seyin yok mu?"
- Detay iste: "Tamam degirmendeydin de, saat kacta gittin?"
- FARKLI KONULAR AC. Tek konuya takilma. Birden fazla kisiyi sorgula.

FORMAT:
- Direkt konus. Sadece diyalog. Sahne yonergesi, *yildiz*, (parantez) YASAK.
- SADECE bu isimlere hitap et: {alive_names}

DIL — COK ONEMLI:
- Duz, sade, gunluk Turkce. Edebiyat YASAK. Siir YASAK. Felsefe YASAK.
- Kisa cumleler, yarim dusunceler, devrik cumleler
- "hani", "yani", "sey", "ya", "bak", "ne biliyim", "olm" gibi dolgu kelimeler
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya", "mal misin"
- Max 3-4 cumle. Monolog yapma.
- Kendini tekrarlama.

SON KONUSMALAR:
{history}

SENIN SON SOZLERIN (tekrarlama):
{own_last}

Simdi sen konus ({name}, {role_title}):"""


def _format_campfire_history(state: GameState, last_n: int | None = None) -> str:
    speeches = [m for m in state["campfire_history"] if m["type"] in ("speech", "moderator", "narrator")]
    if last_n:
        speeches = speeches[-last_n:]
    lines = []
    for msg in speeches:
        if msg["type"] == "speech":
            lines.append(f"[{msg['name']}] ({msg['role_title']}): {msg['content']}")
        elif msg["type"] == "moderator":
            lines.append(f"[Ocak Bekcisi]: {msg['content']}")
        elif msg["type"] == "narrator":
            lines.append(f"[Anlatici]: {msg['content']}")
    return "\n".join(lines)


def _get_exiled_context(state: GameState) -> str:
    exiles = [m for m in state.get("messages", []) if isinstance(m, dict) and m.get("type") == "exile"]
    if exiles:
        lines = [f"- Gun {e['round']}: {e['name']} ({e['role_title']}) surgun edildi" for e in exiles]
        return "Onceki surgunler:\n" + "\n".join(lines)
    return "(Henuz kimse surgun edilmedi)"


def _get_world_context(state: GameState) -> str:
    ws = state.get("world_seed")
    if not ws:
        return ""
    return (
        f"[{ws['place_variants']['settlement_name']}] "
        f"Ocak {ws['ocak_rengi'].replace('_', ' ')} renkte. "
        f"{ws['myth_variant']['rumor']}\n\n"
    )


async def _get_reaction(player: Player, last_speech: dict, state: GameState) -> dict:
    history_text = _format_campfire_history(state, last_n=6)
    prompt = (
        f"Son konusmalar:\n{history_text}\n\n"
        f"Son konusan: [{last_speech['name']}]: {last_speech['content']}\n\n"
        f"Sen {player.name} ({player.role_title}) olarak tepki vermek istiyor musun?"
    )
    result = await llm_generate(
        prompt=prompt,
        system_prompt=REACTION_SYSTEM.format(name=player.name, role_title=player.role_title),
        model=MODEL,
        temperature=0.7,
    )
    text = result.output.strip()
    if text.startswith("WANT"):
        reason = text.split("|", 1)[1].strip() if "|" in text else "konusmak istiyor"
        return {"name": player.name, "wants": True, "reason": reason}
    return {"name": player.name, "wants": False, "reason": ""}


async def _broadcast_and_collect(state: GameState, last_speech: dict) -> list[dict]:
    alive = get_alive_players(state)
    others = [p for p in alive if p.name != last_speech["name"]]
    tasks = [_get_reaction(p, last_speech, state) for p in others]
    return list(await asyncio.gather(*tasks))


async def _orchestrator_pick(state: GameState, reactions: list[dict]) -> tuple[str, str]:
    wanters = [r for r in reactions if r["wants"]]
    if not wanters:
        return "END", ""

    reactions_text = "\n".join(
        f"- {r['name']}: {'WANT — ' + r['reason'] if r['wants'] else 'PASS'}"
        for r in reactions
    )
    history_text = _format_campfire_history(state, last_n=4)
    last_speakers = [
        m["name"] for m in state["campfire_history"][-4:]
        if m["type"] == "speech"
    ]

    prompt = (
        f"Son konusmalar:\n{history_text}\n\n"
        f"Son konusanlar (sirayla): {', '.join(last_speakers)}\n\n"
        f"Soz hakki isteyenler:\n{reactions_text}\n\n"
        f"Kimi seciyorsun?"
    )
    result = await llm_generate(
        prompt=prompt,
        system_prompt=ORCHESTRATOR_SYSTEM.format(reactions_text=reactions_text),
        model=MODEL,
        temperature=0.5,
    )
    text = result.output.strip()
    parts = text.split("|", 1)

    if parts[0].strip() == "END":
        return "END", ""
    if len(parts) >= 2 and parts[0].strip() == "NEXT":
        name = parts[1].strip()
        alive_names = get_alive_names(state)
        if name not in alive_names:
            name = wanters[0]["name"]
        return "NEXT", name
    return "NEXT", wanters[0]["name"]


async def _character_speak(player: Player, state: GameState) -> str:
    history_text = _format_campfire_history(state, last_n=8)
    alive_names = ", ".join(get_alive_names(state))

    own_msgs = [
        m["content"] for m in state["campfire_history"]
        if m["type"] == "speech" and m["name"] == player.name
    ][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    prompt = CHARACTER_WRAPPER.format(
        world_context=_get_world_context(state),
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        alive_names=alive_names,
        exiled_context=_get_exiled_context(state),
        history=history_text or "(henuz kimse konusmadi)",
        own_last=own_last,
        name=player.name,
        role_title=player.role_title,
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.9,
    )
    return result.output.strip()


async def run_campfire(state: GameState) -> GameState:
    """Tartisma fazini calistir."""
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)
    ws = state.get("world_seed")

    print(f"\n{'=' * 50}")
    print(f"  ATES BASI TARTISMASI — Gun {round_n}")
    print(f"{'=' * 50}")
    for p in alive:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        print(f"  [{tag}] {p.name} — {p.role_title}")
    print()

    # Ilk konusmaci (deterministik degil, random ok)
    first = random_module.choice(alive)
    print(f"  [{first.name}] dusunuyor...")
    message = await _character_speak(first, state)

    ok, reason = await moderator_check(first.name, message, WorldSeed(**ws) if ws else None)
    if not ok:
        print(f"  [Ocak Bekcisi]: {reason}")
        state["campfire_history"].append({"type": "moderator", "content": reason})
    else:
        state["campfire_history"].append({
            "type": "speech", "name": first.name,
            "role_title": first.role_title, "content": message,
        })
        first.add_message("assistant", message)
        print(f"  [{first.name}] ({first.role_title}): {message}")

    # Broadcast dongusu
    turn = 1
    while turn < MAX_CAMPFIRE_TURNS:
        turn += 1

        last_speeches = [m for m in state["campfire_history"] if m["type"] == "speech"]
        if not last_speeches:
            break
        last_speech = last_speeches[-1]

        print(f"\n  Tepkiler toplanıyor...")
        reactions = await _broadcast_and_collect(state, last_speech)

        for r in reactions:
            status = f"WANT — {r['reason']}" if r["wants"] else "pas"
            print(f"    {r['name']}: {status}")

        action, name = await _orchestrator_pick(state, reactions)
        if action == "END":
            print(f"\n  Tartisma sona erdi.")
            break

        player = find_player(state, name)
        if not player or not player.alive:
            continue

        print(f"  [{player.name}] dusunuyor...")
        message = await _character_speak(player, state)

        ok, reason = await moderator_check(name, message, WorldSeed(**ws) if ws else None)
        if not ok:
            print(f"  [Ocak Bekcisi]: {reason}")
            state["campfire_history"].append({"type": "moderator", "content": reason})
            continue

        player.add_message("assistant", message)
        state["campfire_history"].append({
            "type": "speech", "name": name,
            "role_title": player.role_title, "content": message,
        })
        print(f"  [{name}] ({player.role_title}): {message}")

    speech_count = sum(1 for m in state["campfire_history"] if m["type"] == "speech")
    speakers = set(m["name"] for m in state["campfire_history"] if m["type"] == "speech")
    print(f"\n  Tartisma ozeti: {speech_count} konusma, {len(speakers)} konusmaci")

    return state


# ══════════════════════════════════════════════════════
#  4. CAMPFIRE OZETI (house visit icin)
# ══════════════════════════════════════════════════════

SUMMARIZE_SYSTEM = """Sen bir tartisma ozetcisisin. Sana bir grup tartismasinin logunu verecegim.

Kisa ve net bir ozet yaz (max 10 cumle):
- Kim kimi sucladi?
- Kim alibi verdi, ne dedi?
- Hangi tutarsizliklar ortaya cikti?
- Kim en cok suphe topladi?
- Kim suskundu, kim saldirgandi?
- Onemli ittifaklar veya catismalar

Turkce yaz. Duz, sade dil. Madde madde yaz."""

_campfire_summary_cache: dict[int, str] = {}


async def summarize_campfire(campfire_history: list[dict], round_number: int = 1) -> str:
    """Campfire logunu LLM ile ozetle, cachele."""
    if round_number in _campfire_summary_cache:
        return _campfire_summary_cache[round_number]

    speeches = [m for m in campfire_history if m["type"] == "speech"]
    if not speeches:
        return "(Onceki tartisma yok)"

    lines = [f"[{m['name']}] ({m['role_title']}): {m['content']}" for m in speeches]
    full_log = "\n".join(lines)

    result = await llm_generate(
        prompt=f"Gun {round_number} tartisma logu:\n\n{full_log}\n\nBu tartismayi ozetle:",
        system_prompt=SUMMARIZE_SYSTEM,
        model=MODEL,
        temperature=0.3,
    )

    summary = f"[Gun {round_number} Ozeti]\n{result.output.strip()}"
    _campfire_summary_cache[round_number] = summary
    return summary


# ══════════════════════════════════════════════════════
#  5. HOUSE VISIT FAZI (1v1 Gorusmeler)
# ══════════════════════════════════════════════════════

VISIT_REQUEST_SYSTEM = """Sen {name} ({role_title}). Tartisma bitti, simdi birileriyle ozel gorusmek istersen soyle.

Hayattaki kisiler: {alive_names}

Onceki tartismada neler konusuldu:
{campfire_summary}

Kiminle gorusmek istiyorsun ve neden? Sebebin stratejik olsun:
- Suphelendigin birini sorgulamak icin
- Ittifak kurmak icin
- Birinin hikayesini test etmek icin
- Bilgi toplamak icin

SADECE su formatta cevap ver, baska hicbir sey yazma:
VISIT|<isim>|<1 cumle neden>
veya
PASS"""


VISIT_WRAPPER = """{world_context}Ozel gorusme. Karsinizda: {opponent_name} ({opponent_role}).
Gun {round_number}/{day_limit}.
{exiled_context}

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, goz, el, ter, koku, nem, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma.
- ASLA metafor/siir/edebiyat yapma. YASAK.
- Tek bilgi kaynag in: insanlarin SOYLEDIKLERI.

1v1 STRATEJI:
- Bilgi cek: "Dun gece ne yaptin?", "Kimlerle goruston?"
- Tuzak kur: yanlis bilgi ver, tepkisini olc
- Alibi test et: tartismada ne soyledigini hatirla, tutarli mi kontrol et
- Guven kazan: "Sana guveniyorum, birlikte calisalim"
- Ittifak teklif et veya boz
- Dogrudan sor: "Sence kim Yanki? Ben X'den supheleniyorum"
- Campfire'da soylediklerini hatirla ve cakistirma yap

DIL:
- Duz, sade, gunluk Turkce. Edebi/felsefi/siirsel YASAK.
- Kisa cumleler, devrik cumleler, yarim dusunceler
- "hani", "yani", "bak", "olm", "ne biliyim", "ya"
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya"
- Max 3-4 cumle.
- Kendini tekrarlama.

ONCEKI TARTISMADAN BILGILER:
{campfire_summary}

KONUSMA:
{visit_history}

SENIN SON SOZLERIN (tekrarlama):
{own_last}

Simdi sen konus ({name}, {role_title}):"""


async def _get_visit_request(player: Player, state: GameState, campfire_summary: str) -> dict:
    alive_names = [n for n in get_alive_names(state) if n != player.name]

    result = await llm_generate(
        prompt=VISIT_REQUEST_SYSTEM.format(
            name=player.name,
            role_title=player.role_title,
            alive_names=", ".join(alive_names),
            campfire_summary=campfire_summary,
        ),
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.7,
    )

    text = result.output.strip()
    if text.startswith("VISIT") and "|" in text:
        parts = text.split("|", 2)
        target = parts[1].strip() if len(parts) > 1 else ""
        reason = parts[2].strip() if len(parts) > 2 else "gorusmek istiyor"

        if target not in alive_names:
            for n in alive_names:
                if n.lower() in target.lower():
                    target = n
                    break
            else:
                return {"name": player.name, "wants": False, "target": "", "reason": ""}

        return {"name": player.name, "wants": True, "target": target, "reason": reason}

    return {"name": player.name, "wants": False, "target": "", "reason": ""}


def _match_visit_pairs(requests: list[dict]) -> list[tuple[str, str, str]]:
    """Isteklerden ciftler olustur. Return: [(visitor, host, reason), ...]"""
    wanters = {r["name"]: r for r in requests if r["wants"]}
    matched = set()
    pairs = []

    # Oncelik 1: karsilikli istekler
    for name, req in wanters.items():
        target = req["target"]
        if target in wanters and wanters[target]["target"] == name:
            if name not in matched and target not in matched:
                pairs.append((name, target, req["reason"]))
                matched.add(name)
                matched.add(target)

    # Oncelik 2: tek tarafli istekler
    for name, req in wanters.items():
        if name in matched:
            continue
        target = req["target"]
        if target not in matched:
            pairs.append((name, target, req["reason"]))
            matched.add(name)
            matched.add(target)

    return pairs


async def _character_speak_1v1(
    player: Player,
    opponent: Player,
    exchanges: list[dict],
    state: GameState,
    campfire_summary: str,
) -> str:
    visit_lines = [f"[{ex['speaker']}] ({ex['role_title']}): {ex['content']}" for ex in exchanges]
    visit_history = "\n".join(visit_lines) if visit_lines else "(henuz konusmadin)"

    own_msgs = [ex["content"] for ex in exchanges if ex["speaker"] == player.name][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    prompt = VISIT_WRAPPER.format(
        world_context=_get_world_context(state),
        opponent_name=opponent.name,
        opponent_role=opponent.role_title,
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        exiled_context=_get_exiled_context(state),
        campfire_summary=campfire_summary,
        visit_history=visit_history,
        own_last=own_last,
        name=player.name,
        role_title=player.role_title,
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.9,
    )
    return result.output.strip()


async def _run_single_visit(
    visitor: Player,
    host: Player,
    reason: str,
    state: GameState,
    campfire_summary: str,
) -> dict:
    """Tek bir 1v1 gorusme."""
    ws = state.get("world_seed")

    print(f"\n  {'─' * 40}")
    print(f"  {visitor.name} ({visitor.role_title}) → {host.name} ({host.role_title})")
    print(f"  Sebep: {reason}")
    print(f"  {'─' * 40}")

    exchanges = []
    speakers = [visitor, host]

    for turn in range(MAX_VISIT_EXCHANGES):
        current = speakers[turn % 2]
        opponent = speakers[(turn + 1) % 2]

        print(f"  [{current.name}] dusunuyor...")
        message = await _character_speak_1v1(current, opponent, exchanges, state, campfire_summary)

        ok, mod_reason = await moderator_check(current.name, message, WorldSeed(**ws) if ws else None)
        if not ok:
            print(f"  [Ocak Bekcisi]: {mod_reason}")
            continue

        exchanges.append({
            "speaker": current.name,
            "role_title": current.role_title,
            "content": message,
        })
        current.add_message("assistant", message)
        print(f"  [{current.name}] ({current.role_title}): {message}")

    visit_data = {
        "type": "visit",
        "visitor": visitor.name,
        "host": host.name,
        "visitor_reason": reason,
        "exchanges": exchanges,
    }
    state["house_visits"].append(visit_data)
    return visit_data


async def run_house_visits(state: GameState, campfire_summary: str) -> GameState:
    """Tum ev ziyaretlerini calistir: istek topla → esle → gorusme."""
    print(f"\n{'=' * 50}")
    print(f"  EV ZIYARETLERI — Istekler toplanıyor...")
    print(f"{'=' * 50}")

    # 1. Istek topla (concurrent)
    alive = get_alive_players(state)
    tasks = [_get_visit_request(p, state, campfire_summary) for p in alive]
    requests = list(await asyncio.gather(*tasks))

    for r in requests:
        if r["wants"]:
            print(f"  {r['name']} → {r['target']}: {r['reason']}")
        else:
            print(f"  {r['name']}: PASS")

    # 2. Esle
    pairs = _match_visit_pairs(requests)
    if not pairs:
        print(f"\n  Kimse gorusmek istemedi.")
        return state

    print(f"\n  Eslesmeler ({len(pairs)} gorusme):")
    for v, h, reason in pairs:
        print(f"    {v} → {h}")

    # 3. Gorusmeleri calistir (concurrent)
    visit_tasks = []
    for visitor_name, host_name, reason in pairs:
        visitor = find_player(state, visitor_name)
        host = find_player(state, host_name)
        if visitor and host:
            visit_tasks.append(_run_single_visit(visitor, host, reason, state, campfire_summary))

    await asyncio.gather(*visit_tasks)
    return state


# ══════════════════════════════════════════════════════
#  6. OYLAMA FAZI
# ══════════════════════════════════════════════════════

VOTE_SYSTEM = """Sen {name} ({role_title}) adli bir karaktersin. Oylama zamani.
{exile_phrase}

Tartisma ve ozel gorusmelerde su konusmalar gecti:
{history}

{visit_context}

Hayattaki kisiler: {alive_names}

Simdi birini surgun etmek icin oy vermelisin.
Tartismada ve ozel gorusmelerde en suphe ceken, en tutarsiz, en guvensiz kisi kimdi?
Kendi gozlemlerine ve konusmalara dayanarak karar ver.

SADECE bir isim yaz, baska hicbir sey yazma:
<isim>"""


async def _player_vote(player: Player, state: GameState) -> str:
    history_text = _format_campfire_history(state, last_n=12)
    alive_names = get_alive_names(state)
    others = [n for n in alive_names if n != player.name]

    # Visit context
    visits = state.get("house_visits", [])
    visit_lines = []
    for v in visits:
        if v.get("visitor") == player.name or v.get("host") == player.name:
            for ex in v.get("exchanges", []):
                visit_lines.append(f"[1v1 {ex['speaker']}]: {ex['content']}")
    visit_context = "Ozel gorusme notlarin:\n" + "\n".join(visit_lines[-6:]) if visit_lines else ""

    ws = state.get("world_seed")
    exile_phrase = f"Surgun sozu: \"{ws['rituals']['exile_phrase']}\"" if ws else ""

    result = await llm_generate(
        prompt=VOTE_SYSTEM.format(
            name=player.name,
            role_title=player.role_title,
            exile_phrase=exile_phrase,
            history=history_text,
            visit_context=visit_context,
            alive_names=", ".join(others),
        ),
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.5,
    )

    vote = result.output.strip().split("\n")[0].strip()
    if vote not in others:
        for n in others:
            if n.lower() in vote.lower():
                vote = n
                break
        else:
            vote = random_module.choice(others)

    return vote


async def run_vote(state: GameState) -> str | None:
    """Oylama yap, en cok oy alani dondur. Beraberlikte None."""
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)

    print(f"\n{'=' * 50}")
    print(f"  OYLAMA — Gun {round_n}")
    print(f"{'=' * 50}")

    tasks = [_player_vote(p, state) for p in alive]
    votes = await asyncio.gather(*tasks)

    vote_map = {}
    for player, vote in zip(alive, votes):
        player.vote_target = vote
        vote_map[player.name] = vote
        print(f"  {player.name} -> {vote}")

    tally = Counter(votes)
    print(f"\n  Oy dagilimi: {dict(tally)}")

    top_vote, top_count = tally.most_common(1)[0]

    tied = [name for name, count in tally.items() if count == top_count]
    if len(tied) > 1:
        print(f"  BERABERLIK! {', '.join(tied)} — kimse surgun edilmedi.")
        return None

    print(f"\n  SURGUN: {top_vote} ({top_count} oyla)")
    return top_vote


def exile_player(state: GameState, name: str) -> Player | None:
    """Oyuncuyu surgun et (alive=False)."""
    player = find_player(state, name)
    if player:
        player.alive = False
        state["exiled_today"] = name

        state["messages"].append({
            "type": "exile",
            "round": state.get("round_number", 1),
            "name": name,
            "role_title": player.role_title,
            "was_echo_born": player.is_echo_born,
        })

        tag = "YANKI-DOGMUS" if player.is_echo_born else "ET-CAN"
        ws = state.get("world_seed")
        exile_phrase = ws["rituals"]["exile_phrase"] if ws else "Surgun edildi."
        print(f"  {exile_phrase}")
        print(f"  {name} ({player.role_title}) surgun edildi! [{tag}]")

    return player


# ══════════════════════════════════════════════════════
#  7. SABAH FAZI (Narrator)
# ══════════════════════════════════════════════════════

MORNING_SYSTEM = """Sen Ocak Bekcisi'sin — sabah duyurusunu yapiyorsun.

KURALLAR:
- Max 3-4 cumle. Kisa ve atmosferik.
- Duz, sade Turkce. Siir/edebiyat YASAK.
- Uyari/alamet ver: gunun havasini set et.
- Fiziksel tasvir YASAK (bu ses oyunu).
- Sadece bilgi ver: kac kisi kaldi, dun ne oldu, bugunun alameti."""


async def run_morning(state: GameState) -> GameState:
    """Sabah duyurusu — narrator broadcast."""
    round_n = state.get("round_number", 1)
    ws = state.get("world_seed")
    alive = get_alive_players(state)
    alive_names = ", ".join(p.name for p in alive)

    # Surgun bilgisi
    last_exile = state.get("exiled_today")
    if last_exile:
        exile_msg = state.get("messages", [])
        last = [m for m in exile_msg if isinstance(m, dict) and m.get("type") == "exile"]
        if last:
            e = last[-1]
            exile_text = f"Dun gece {e['name']} ({e['role_title']}) surgun edildi."
        else:
            exile_text = f"Dun gece {last_exile} surgun edildi."
    else:
        exile_text = "Gece sessiz gecti. Kimse surgun edilmedi."

    # Omen
    omen = ""
    if ws and ws.get("daily_omens"):
        omens = ws["daily_omens"]
        omen = omens[min(round_n - 1, len(omens) - 1)]

    settlement = ws["place_variants"]["settlement_name"] if ws else "Yerlesim"
    scene_cards = render_scene_cards(WorldSeed(**ws)) if ws else {}
    scene = scene_cards.get("morning", "")

    prompt = (
        f"Gun {round_n}. {settlement}.\n"
        f"Hayattakiler ({len(alive)} kisi): {alive_names}\n"
        f"{exile_text}\n"
        f"Gunun alameti: {omen}\n"
        f"Sahne: {scene}\n\n"
        f"Sabah duyurusunu yap."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=MORNING_SYSTEM,
        model=MODEL,
        temperature=0.6,
    )

    morning_msg = result.output.strip()
    state["campfire_history"].append({
        "type": "narrator",
        "content": morning_msg,
    })

    print(f"\n  [OCAK BEKCISI] {morning_msg}")
    return state


# ══════════════════════════════════════════════════════
#  8. TAM OYUN DONGUSU
# ══════════════════════════════════════════════════════

def init_state(
    players: list[Player],
    world_seed: WorldSeed,
    day_limit: int = 5,
) -> GameState:
    return GameState(
        messages=[],
        players=players,
        phase=Phase.MORNING.value,
        round_number=1,
        day_limit=day_limit,
        current_speaker=None,
        campfire_history=[],
        house_visits=[],
        exiled_today=None,
        winner=None,
        world_seed=world_seed.model_dump(),
    )


async def run_full_game(state: GameState) -> GameState:
    """Tam oyun dongusu: Sabah → Tartisma → Ev Ziyareti → Oylama → Surgun → Kontrol."""
    day_limit = state.get("day_limit", 5)
    game_log = {
        "rounds": [],
        "world_seed": state.get("world_seed"),
        "players_initial": [
            {
                "name": p.name,
                "role_title": p.role_title,
                "player_type": p.player_type.value,
                "archetype_label": p.archetype_label,
            }
            for p in state["players"]
        ],
    }

    while True:
        round_n = state.get("round_number", 1)

        print(f"\n{'#' * 60}")
        print(f"  GUN {round_n} / {day_limit}")
        et, yanki = count_by_type(state)
        print(f"  Hayatta: {et} Et-Can, {yanki} Yanki-Dogmus ({et + yanki} toplam)")
        print(f"{'#' * 60}")

        # Round icin temizlik
        state["campfire_history"] = []
        state["house_visits"] = []

        # ── SABAH ──
        state["phase"] = Phase.MORNING.value
        state = await run_morning(state)

        # ── TARTISMA (Campfire) ──
        state["phase"] = Phase.CAMPFIRE.value
        state = await run_campfire(state)

        # ── CAMPFIRE OZETI ──
        print(f"\n  Campfire ozeti hazirlaniyor...")
        campfire_summary = await summarize_campfire(state["campfire_history"], round_n)
        print(f"  Ozet hazir ({len(campfire_summary)} karakter)")

        # ── EV ZIYARETLERI (House Visits) ──
        state["phase"] = Phase.HOUSES.value
        state = await run_house_visits(state, campfire_summary)

        # ── OYLAMA ──
        state["phase"] = Phase.VOTE.value
        exiled_name = await run_vote(state)

        # Round data
        round_data = {
            "round": round_n,
            "campfire_history": list(state["campfire_history"]),
            "house_visits": list(state["house_visits"]),
            "votes": {},
            "exiled": None,
            "exiled_type": None,
        }

        if exiled_name:
            player = exile_player(state, exiled_name)
            round_data["exiled"] = exiled_name
            round_data["exiled_type"] = player.player_type.value if player else None
            for p in state["players"]:
                if p.vote_target:
                    round_data["votes"][p.name] = p.vote_target
        else:
            print(f"  Kimse surgun edilmedi.")

        game_log["rounds"].append(round_data)

        # ── KAZANAN KONTROL ──
        winner = check_win_condition(state)
        if winner:
            state["winner"] = winner
            state["phase"] = Phase.GAME_OVER.value
            break

        # Sonraki gune gec
        state["round_number"] = round_n + 1
        state["exiled_today"] = None
        for p in state["players"]:
            p.vote_target = None

    # ══ OYUN BITTI ══
    et, yanki = count_by_type(state)
    winner = state["winner"]

    print(f"\n{'*' * 60}")
    print(f"  OYUN BITTI!")
    if winner == "et_can":
        print(f"  ET-CANLAR KAZANDI! Tum Yanki-Dogmuslar surgun edildi.")
    else:
        print(f"  YANKI-DOGMUSLAR KAZANDI! {yanki} Yanki-Dogmus hayatta kaldi.")
    print(f"{'*' * 60}")

    print(f"\n  SKOR TABLOSU:")
    for p in state["players"]:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        status = "HAYATTA" if p.alive else "SURGUN"
        print(f"  [{tag:6}] {p.name:12} — {p.role_title:16} — {status}")

    # JSON kaydet
    game_log["winner"] = winner
    game_log["total_rounds"] = state.get("round_number", 1)
    game_log["final_alive"] = [
        {"name": p.name, "type": p.player_type.value}
        for p in get_alive_players(state)
    ]

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(game_log, f, ensure_ascii=False, indent=2)
    print(f"\n  Game log → {OUTPUT_PATH}")

    return state


# ══════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="AI vs Insan: Ocak Yemini")
    parser.add_argument("--game-id", default=None, help="Deterministik seed (bos = random UUID)")
    parser.add_argument("--players", type=int, default=6, help="Toplam oyuncu sayisi")
    parser.add_argument("--ai-count", type=int, default=4, help="AI oyuncu sayisi")
    parser.add_argument("--day-limit", type=int, default=5, help="Max gun sayisi")
    args = parser.parse_args()

    game_id = args.game_id or str(uuid.uuid4())

    print(f"{'=' * 60}")
    print(f"  AI vs Insan: Ocak Yemini")
    print(f"  Game ID: {game_id}")
    print(f"  Oyuncular: {args.players} ({args.ai_count} AI, {args.players - args.ai_count} Insan)")
    print(f"  Gun Limiti: {args.day_limit}")
    print(f"{'=' * 60}")

    # ── 1. DUNYA URETIMI ──
    print(f"\n[1/3] Dunya uretiliyor...")
    world_seed = generate_world_seed(game_id)
    print(render_world_brief(world_seed))

    scene_cards = render_scene_cards(world_seed)
    print(f"  Scene cards:")
    for phase, card in scene_cards.items():
        print(f"    [{phase:12}] {card[:80]}...")

    # ── 2. KARAKTER URETIMI ──
    print(f"\n[2/3] Karakterler uretiliyor ({args.players} karakter, concurrent Pro model)...")
    rng = _make_rng(game_id)
    players = await generate_players(
        rng=rng,
        world_seed=world_seed,
        player_count=args.players,
        ai_count=args.ai_count,
    )

    print(f"\n  Karakterler:")
    for p in players:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        tier = f" [{p.skill_tier_label}]" if p.skill_tier_label else ""
        print(f"  [{tag:6}] {p.name:12} — {p.role_title:16} — {p.archetype_label}{tier}")

    # ── 3. OYUN ──
    print(f"\n[3/3] Oyun basliyor...")
    _warning_counts.clear()
    _campfire_summary_cache.clear()
    state = init_state(players, world_seed, day_limit=args.day_limit)
    await run_full_game(state)


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    key = os.environ.get("FAL_KEY", "")
    if not key:
        print("HATA: FAL_KEY tanimli degil!")
        sys.exit(1)

    configure(key)
    asyncio.run(main())
