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
import re
import sys
import uuid
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fal_services import llm_generate, configure, tts_stream, generate_avatar
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

# ── Memory ayarlari ──
CAMPFIRE_BUFFER = 5    # Son N mesaj raw gosterilir
SUMMARY_INTERVAL = 3   # Her N yeni mesajda ozet guncelle

# ── Free Phase ayarlari ──
INITIAL_CAMPFIRE_TURNS = 5    # Herkes birlikteyken baslangic
FREE_ROAM_ROUNDS = 3          # Serbest dolasim round sayisi
CAMPFIRE_TURNS_PER_ROUND = 3  # Her roundda campfire tartisma
ROOM_EXCHANGES = 4            # Oda gorusmesi exchange sayisi
CLOSING_CAMPFIRE_TURNS = 3    # Kapanista herkes birlikteyken


# ── Voice Hook ──
_on_speech = None  # async callable(name: str, text: str) veya None


async def _emit_speech(name: str, role_title: str, text: str) -> None:
    """Konusmayi yazdir + voice hook varsa seslendir."""
    print(f"  [{name}] ({role_title}): {text}")
    if _on_speech:
        await _on_speech(name, text)


async def _emit_narrator(text: str) -> None:
    """Anlatici metnini yazdir + voice hook varsa seslendir."""
    print(f"\n  [OCAK BEKCISI] {text}")
    if _on_speech:
        await _on_speech("Anlatici", text)


def calculate_ai_count(player_count: int, rng: random_module.Random) -> int:
    """Rastgele AI sayisi. Kimse kac AI oldugunu bilmiyor.

    Aralik: player_count//3 ile player_count*2//3 arasi.
    Ornekler:
        4 kisi → 1-2 AI
        6 kisi → 2-4 AI
        8 kisi → 2-5 AI
       10 kisi → 3-6 AI
    """
    min_ai = max(1, player_count // 3)
    max_ai = max(min_ai + 1, player_count * 2 // 3)
    return rng.randint(min_ai, max_ai)


def calculate_day_limit(player_count: int, ai_count: int) -> int:
    """Dinamik gun limiti hesapla.

    Mantik: Et-Can'in ai_count kisiyi dogru surgun etmesi lazim.
    Her round 1 surgun. Hata payi = player_count // 3.
    Formul: ai_count + hata_payi

    Ornekler:
        4 kisi, 2 AI → 2 + 1 = 3 gun
        6 kisi, 4 AI → 4 + 2 = 6 gun
        6 kisi, 3 AI → 3 + 2 = 5 gun
        8 kisi, 5 AI → 5 + 2 = 7 gun
       10 kisi, 7 AI → 7 + 3 = 10 gun
    """
    hata_payi = max(1, player_count // 3)
    return ai_count + hata_payi


# ══════════════════════════════════════════════════════
#  DATA
# ══════════════════════════════════════════════════════

with open(DATA_PATH) as f:
    DATA = json.load(f)

ARCHETYPES = DATA["archetypes"]
ROLE_TITLES = DATA["role_titles"]
SKILL_TIERS = DATA["skill_tiers"]
NAMES_POOL = DATA["names_pool"]
INSTITUTIONS = DATA["institutions"]
OMENS = DATA["omens"]
SINAMA_TYPES = DATA.get("sinama_types", [])
INSTITUTION_LOCATIONS = DATA.get("institution_locations", [])
UI_OBJECTS_DEF = DATA.get("ui_objects", [])
EXTRA_UI_OBJECTS_DEF = DATA.get("extra_ui_objects", [])
ALL_UI_OBJECTS_DEF = UI_OBJECTS_DEF + EXTRA_UI_OBJECTS_DEF
MINI_EVENT_TEMPLATES = DATA.get("mini_event_templates", [])
NIGHT_MOVES = DATA.get("night_moves", [])


# ══════════════════════════════════════════════════════
#  0. OUTPUT SANITIZER + MEMORY HELPERS
# ══════════════════════════════════════════════════════

def _sanitize_speech(text: str) -> str:
    """Konusma metninden tag ve sahne yonergelerini temizle."""
    # [Name] (Role): prefix
    text = re.sub(r'^\[.*?\]\s*\(.*?\)\s*:?\s*', '', text.strip())
    # (Name, Role): prefix — "(Elara, Bahçıvan):" vb.
    text = re.sub(r'^\([^)]*,\s*[^)]*\)\s*:?\s*', '', text.strip())
    # Standalone [Name]: prefix
    text = re.sub(r'^\[.*?\]\s*:?\s*', '', text.strip())
    # Bas kismi sahne yonergesi — (öfkeyle), (sakin bir tonla) vb. (max 40 char)
    text = re.sub(r'^\([^)]{1,40}\)\s*', '', text.strip())
    # *italik sahne yonergesi* — *öfkeyle masaya vurur* vb.
    text = re.sub(r'\*[^*]+\*', '', text)
    # Coklu newline temizle
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    return text


def _is_duplicate(new_text: str, previous_texts: list[str], threshold: float = 0.7) -> bool:
    """Yeni mesaj onceki mesajlara cok mu benziyor? (kelime overlap kontrolu)"""
    new_words = set(new_text.lower().split())
    if len(new_words) < 5:
        return False
    for prev in previous_texts:
        prev_words = set(prev.lower().split())
        if len(prev_words) < 5:
            continue
        overlap = len(new_words & prev_words) / max(len(new_words), len(prev_words))
        if overlap > threshold:
            return True
    return False


# ── Rolling Summary (campfire icin) ──────────────────

ROLLING_SUMMARY_SYSTEM = """Bir tartisma ozetini guncelliyorsun.

Mevcut ozet ve yeni konusmalari alacaksin. Ozeti guncelle:
- Kim kimi sucladi, hangi alibiler verildi
- Tutarsizliklar ve supheli noktalar
- Onemli ittifaklar veya catismalar
- Max 8 madde. Eski gereksiz detaylari kirp. Yeni bilgileri ekle.

Turkce, madde madde yaz. Kisa ve net. Her madde 1 cumle."""


async def _update_rolling_summary(current_summary: str, new_messages: list[dict]) -> str:
    """Yeni mesajlarla rolling summary'yi guncelle."""
    if not new_messages:
        return current_summary

    new_lines = []
    for m in new_messages:
        if m.get("type") == "speech":
            new_lines.append(f"[{m['name']}]: {m['content'][:200]}")
        elif m.get("type") == "narrator":
            new_lines.append(f"[Anlatici]: {m['content'][:150]}")

    if not new_lines:
        return current_summary

    result = await llm_generate(
        prompt=(
            f"Mevcut ozet:\n{current_summary or '(Henuz ozet yok)'}\n\n"
            f"Yeni konusmalar:\n" + "\n".join(new_lines) + "\n\n"
            f"Guncel ozeti yaz:"
        ),
        system_prompt=ROLLING_SUMMARY_SYSTEM,
        model=MODEL,
        temperature=0.2,
    )
    return result.output.strip()


async def _maybe_update_campfire_summary(state: GameState) -> None:
    """Yeterli yeni mesaj varsa rolling summary guncelle."""
    speeches = [m for m in state["campfire_history"] if m["type"] == "speech"]
    cursor = state.get("_summary_cursor", 0)

    # Buffer disindaki mesaj sayisi
    beyond_buffer = len(speeches) - CAMPFIRE_BUFFER
    if beyond_buffer > cursor and (beyond_buffer - cursor) >= SUMMARY_INTERVAL:
        to_summarize = speeches[cursor:beyond_buffer]
        state["campfire_rolling_summary"] = await _update_rolling_summary(
            state.get("campfire_rolling_summary", ""),
            to_summarize,
        )
        state["_summary_cursor"] = beyond_buffer
        print(f"  [Memory] Ozet guncellendi ({beyond_buffer} mesaj ozetlendi)")


def _format_campfire_context(state: GameState, viewer: str | None = None) -> str:
    """Rolling summary + son CAMPFIRE_BUFFER raw mesaj.
    viewer verilirse sadece o oyuncunun duyabilecegi mesajlar gosterilir."""
    summary = state.get("campfire_rolling_summary", "")
    all_msgs = [m for m in state["campfire_history"]
                if m["type"] in ("speech", "moderator", "narrator")]

    # Viewer filtresi: "present" alani varsa ve viewer icinde degilse gosterme
    if viewer:
        all_msgs = [m for m in all_msgs
                    if "present" not in m or viewer in m["present"]]

    recent = all_msgs[-CAMPFIRE_BUFFER:] if len(all_msgs) > CAMPFIRE_BUFFER else all_msgs

    parts = []
    if summary:
        parts.append(f"[ONCEKI KONUSMALARIN OZETI]\n{summary}")

    lines = []
    for msg in recent:
        if msg["type"] == "speech":
            role = msg.get('role_title', '?')
            lines.append(f"[{msg['name']}] ({role}): {msg['content']}")
        elif msg["type"] == "moderator":
            lines.append(f"[Ocak Bekcisi]: {msg['content']}")
        elif msg["type"] == "narrator":
            lines.append(f"[Anlatici]: {msg['content']}")

    if lines:
        parts.append("[SON KONUSMALAR]\n" + "\n".join(lines))

    return "\n\n".join(parts) if parts else "(henuz kimse konusmadi)"


# ── Cumulative Summary (cross-round) ────────────────

CUMULATIVE_SUMMARY_SYSTEM = """Oyunun onceki gunlerinin ozetini guncelliyorsun.

Mevcut kumulatif ozet ve bu gunun bilgilerini alacaksin. Birlesik bir ozet yaz:
- Hangi gunlerde ne oldu, kim surgun edildi
- Kim kimi sucladi, onemli tutarsizliklar
- Ittifaklar, catismalar, supheler
- Max 12 madde. Eski gereksiz detaylari kirp.

Turkce, madde madde yaz. Kisa ve net."""


async def _update_cumulative_summary(
    cumulative: str,
    round_number: int,
    campfire_summary: str,
    vote_result: str,
) -> str:
    """Round sonunda kumulatif ozeti guncelle."""
    round_info = f"Gun {round_number}:\n{campfire_summary}\n{vote_result}"

    result = await llm_generate(
        prompt=(
            f"Kumulatif ozet:\n{cumulative or '(Ilk gun)'}\n\n"
            f"Bu gunun bilgileri:\n{round_info}\n\n"
            f"Guncel kumulatif ozeti yaz:"
        ),
        system_prompt=CUMULATIVE_SUMMARY_SYSTEM,
        model=MODEL,
        temperature=0.2,
    )
    return result.output.strip()


# ══════════════════════════════════════════════════════
#  1. KARAKTER URETIMI (dinamik, world_seed RNG ile)
# ══════════════════════════════════════════════════════

def _build_institution_pool(player_count: int) -> list[dict]:
    """Oyuncu sayisina gore kurum havuzu olustur.
    8 oyuncu: 2 Kilerci + 2 Gecitci + 1 Kul Rahibi + 1 Sifaci + 1 Demirci + 1 Han Insani
    Daha az oyuncu: count'lari kus, fazlalari rastgele kes.
    """
    pool = []
    for inst in INSTITUTIONS:
        for _ in range(inst["count"]):
            pool.append(inst)
    # Oyuncu sayisindan fazlaysa kes
    if len(pool) > player_count:
        pool = pool[:player_count]
    # Azsa tekrarla (buyuk oyuncu sayisi icin)
    while len(pool) < player_count:
        pool.append(pool[len(pool) % len(INSTITUTIONS)])
    return pool


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

    # Kurum dagilimi
    inst_pool = _build_institution_pool(player_count)
    rng.shuffle(inst_pool)

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
        "institution": inst_pool[0]["id"],
        "institution_label": inst_pool[0]["label"],
        "institution_desc": inst_pool[0]["description"],
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
            "institution": inst_pool[i]["id"],
            "institution_label": inst_pool[i]["label"],
            "institution_desc": inst_pool[i]["description"],
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
- "Yorgun dusmuşsun", "sesin titriyor" gibi DOLAYLI fiziksel gozlemler de YASAK.

AI KOKUSUNU ENGELLEMEK ICIN KRITIK KURALLAR:
- TARIHI REFERANS YASAK: "Kanli Hasat", "Buyuk Kacis", "X Isyani", "Y Donemi" gibi uydurma tarihi olaylara atif YASAKTIR. Bir kutuphaneciyi bile yazsan tarih referansi kullanmayacak. Normal insan gibi kendi gozlemleriyle konusacak.
- MESLEK METAFORU SPAM YASAK: "iplik kopmus gibi", "kumasin dokusunu bozar", "dikis tutmaz" gibi surekli meslek benzetmesi YASAK. Mesleginden bahsetmesi ok ama HER CUMLEDE meslek metaforu kullanmak AI kokturuyor. MAX 1 kez, sadece alibi anlatirken.
- TEKNIK/RESMI DIL YASAK: "yapisal butunluk", "veri girisi bekliyor", "sistem parametresi", "frekans", "desibel" gibi muhendislik/akademik terimler YASAK. Normal insan boyle konusmaz.
- SAHNE YONERGESI YASAK: "(sakin bir tonla konusur)", "(gozlerinin icine bakar)" gibi parantez icinde davranis tarifi YAZMA. Sadece diyalog yaz.
- UZUN MONOLOG YASAK: Max 3-4 cumle. Paragraf paragraf konusmak AI kokutuyor. Kisa, kesik, eksik cumleler daha dogal.
- Karakter SIRADAN BIR INSAN gibi konusmali. Surekli analiz yapan, her seyi kategorize eden, sistematik dusunen biri degil."""


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

    # Kurum bilgisi
    inst_block = ""
    if character.get("institution_label"):
        inst_block = (
            f"\nKURUM: {character['institution_label']}\n"
            f"{character.get('institution_desc', '')}\n"
            f"Bu kurum karakterin gunluk rutinini ve alibi kaynaklarini belirler."
        )

    prompt = (
        f"DUNYA: {world_seed.place_variants.settlement_name} | "
        f"Ton: {world_seed.tone} | Mevsim: {world_seed.season}\n"
        f"Soylenti: {world_seed.myth_variant.rumor}\n\n"
        f"KARAKTERIN:\n"
        f"Isim: {character['name']}\n"
        f"Unvan: {character['role_title']}\n"
        f"{inst_block}\n\n"
        f"LORE ARKA PLAN:\n{character['lore']}\n\n"
        f"ARKETIP: {arch['label']}\n{arch['description']}\n"
        f"Konusma Tarzi: {arch['speech_style']}\n\n"
        f"KIMLIK:\n{identity}\n"
        f"{tier_block}\n\n"
        f"Asagidaki 5 alani JSON olarak uret. Baska hicbir sey yazma, SADECE JSON:\n\n"
        f'{{"acting_prompt": "2-3 paragraf acting talimati (yukaridaki kurallara uygun)",\n'
        f' "public_tick": "Bu karakterin herkesin fark edecegi 1 konusma aliskanligi. '
        f'Ornek: her cumleye bir soru ile baslar, surekli yani der, cumlelerini yarida keser. '
        f'Kisa, somut, tek bir aliskanlık.",\n'
        f' "alibi_anchor": "Bu karakterin her gun yaptigi, baskalarinin dogrulayabilecegi 1 rutin. '
        f'Kurum ve unvanina uygun olsun. Ornek: her sabah kilere erzak sayar, aksam nobetini tutar. '
        f'Somut zaman + yer + eylem icersin.",\n'
        f' "speech_color": "Bu karakterin konusma tonu 1-2 cumle. '
        f'Ornek: kisa kesik cumleler kurar, gereksiz kelime kullanmaz. Veya: hikayeci tarzi, her seyi bir aniyla anlatir.",\n'
        f' "avatar_description": "Karakterin fiziksel gorunusu, 1-2 cumle INGILIZCE. '
        f'Yas, sac rengi, yuz yapisi, meslegine uygun kiyafet. '
        f'Ornek: 50 year old man with white beard, tired eyes, wearing blacksmith apron"}}'
    )
    return prompt, ACTING_PROMPT_SYSTEM


def _parse_character_card(raw_output: str) -> dict:
    """LLM ciktisini parse et. JSON blogu bul ve dondur."""
    # JSON blogu bul — { ile baslar, } ile biter
    text = raw_output.strip()

    # ```json ... ``` blogu varsa cikar
    if "```json" in text:
        start = text.index("```json") + 7
        end = text.index("```", start)
        text = text[start:end].strip()
    elif "```" in text:
        start = text.index("```") + 3
        end = text.index("```", start)
        text = text[start:end].strip()

    # Ilk { ve son } arasi
    first_brace = text.find("{")
    last_brace = text.rfind("}")
    if first_brace != -1 and last_brace != -1:
        text = text[first_brace:last_brace + 1]

    try:
        data = json.loads(text)
        return {
            "acting_prompt": data.get("acting_prompt", ""),
            "public_tick": data.get("public_tick", ""),
            "alibi_anchor": data.get("alibi_anchor", ""),
            "speech_color": data.get("speech_color", ""),
            "avatar_description": data.get("avatar_description", ""),
        }
    except json.JSONDecodeError:
        # Fallback: tum metni acting_prompt olarak kullan
        return {
            "acting_prompt": raw_output.strip(),
            "public_tick": "",
            "alibi_anchor": "",
            "speech_color": "",
            "avatar_description": "",
        }


async def _generate_acting_prompt(character: dict, world_seed: WorldSeed) -> dict:
    """Tek karakter icin acting prompt + kart alanlari uret (Pro model).
    Returns: {"acting_prompt": str, "public_tick": str, "alibi_anchor": str, "speech_color": str, "avatar_description": str}
    """
    name = character["name"]
    prompt, system = _build_acting_request(character, world_seed)

    print(f"  🎭 [{name}] Karakter karti uretiliyor (Pro)...")
    result = await llm_generate(
        prompt=prompt,
        system_prompt=system,
        model=PRO_MODEL,
        temperature=1.0,
        reasoning=True,
    )
    card = _parse_character_card(result.output)
    has_all = all(card.get(k) for k in ("acting_prompt", "public_tick", "alibi_anchor", "speech_color", "avatar_description"))
    if has_all:
        print(f"  ✅ [{name}] Kart tamam — acting:{len(card['acting_prompt'])}c, tick:{card['public_tick'][:30]}...")
    else:
        missing = [k for k in ("public_tick", "alibi_anchor", "speech_color", "avatar_description") if not card.get(k)]
        print(f"  ⚠️  [{name}] Eksik alanlar: {missing} — fallback acting prompt kullanildi")
    return card


async def _generate_avatar_safe(
    description: str,
    player_name: str,
    world_tone: str = "dark fantasy medieval",
) -> str | None:
    """Avatar uret, hata olursa None dondur (oyunu bloklamasin)."""
    if not description:
        print(f"  ⚠️  [{player_name}] Avatar description bos, atlaniyor")
        return None
    try:
        print(f"  🎨 [{player_name}] Avatar uretiliyor...")
        result = await generate_avatar(description, world_tone=world_tone)
        print(f"  ✅ [{player_name}] Avatar hazir")
        return result.image_url
    except Exception as e:
        print(f"  ⚠️  [{player_name}] Avatar uretimi basarisiz: {e}")
        return None


async def generate_players(
    rng: random_module.Random,
    world_seed: WorldSeed,
    player_count: int = 6,
    ai_count: int = 4,
) -> list[Player]:
    """Tam pipeline: slot olustur → acting prompt uret → avatar uret → Player listesi dondur."""
    slots = create_character_slots(rng, player_count, ai_count)

    # Concurrent karakter karti uretimi
    tasks = [_generate_acting_prompt(c, world_seed) for c in slots]
    cards = await asyncio.gather(*tasks)

    # Concurrent avatar uretimi (paralel — ~5 saniye ekstra)
    world_tone = f"{world_seed.tone} dark fantasy medieval"
    avatar_tasks = [
        _generate_avatar_safe(
            card.get("avatar_description", ""),
            slot["name"],
            world_tone,
        )
        for slot, card in zip(slots, cards)
    ]
    print(f"  🎨 {len(avatar_tasks)} avatar uretiliyor (paralel)...")
    avatar_urls = await asyncio.gather(*avatar_tasks)

    # 6 ses profili: 3 voice x 2 speed varyasyonu (0.95-1.1 arasi — dogal prozodi)
    VOICE_PROFILES = [
        {"voice_id": "alloy",  "voice_speed": 1.0},    # Alloy normal
        {"voice_id": "zeynep", "voice_speed": 0.95},   # Zeynep sakin
        {"voice_id": "ali",    "voice_speed": 1.0},    # Ali normal
        {"voice_id": "alloy",  "voice_speed": 1.1},    # Alloy enerjik
        {"voice_id": "zeynep", "voice_speed": 1.05},   # Zeynep canli
        {"voice_id": "ali",    "voice_speed": 0.95},   # Ali agir
    ]

    players = []
    for i, (slot, card, avatar_url) in enumerate(zip(slots, cards, avatar_urls)):
        voice = VOICE_PROFILES[i % len(VOICE_PROFILES)]
        players.append(Player(
            slot_id=slot["slot_id"],
            name=slot["name"],
            role_title=slot["role_title"],
            lore=slot["lore"],
            archetype=slot["archetype"],
            archetype_label=ARCHETYPES[slot["archetype"]]["label"],
            player_type=PlayerType.YANKI_DOGMUS if slot["is_echo_born"] else PlayerType.ET_CAN,
            acting_prompt=card["acting_prompt"],
            skill_tier=slot.get("skill_tier"),
            skill_tier_label=SKILL_TIERS[slot["skill_tier"]]["label"] if slot.get("skill_tier") else None,
            institution=slot.get("institution"),
            institution_label=slot.get("institution_label"),
            public_tick=card.get("public_tick") or None,
            alibi_anchor=card.get("alibi_anchor") or None,
            speech_color=card.get("speech_color") or None,
            avatar_url=avatar_url,
            voice_id=voice["voice_id"],
            voice_speed=voice["voice_speed"],
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
- INSAN OYUNCU soz hakki istiyorsa YUKSEK ONCELIK ver — sira ona gelsin. Insan oyuncular "insan oyuncu" etiketi ile gelir.
- Kimse istemiyorsa veya tartisma dogal bitme noktasina geldiyse bitir

SADECE su formatta cevap ver:
NEXT|<isim>
veya
END"""


CHARACTER_WRAPPER = """{world_context}Tartisma fazindasin. Gun {round_number}/{day_limit}.
Hayattaki kisiler: {alive_names}
{exiled_context}
{cumulative_context}
{card_context}
{spotlight_context}
Soz hakki sana geldi.

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, yuzun, yuzunde, yuzune, goz, gozler, el, eller, ter, kir, koku, nem, rutubet, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma, bakmak, gormek, panik, korku, titreme.
- "yuzunde X var", "gozlerinde Y", "elleri titredi" gibi HERHANGI BIR fiziksel tasvir YASAK.
- ASLA metafor/siir/edebiyat yapma. YASAK.
- Tek bilgi kaynagin: insanlarin SOYLEDIKLERI ve soylemedikleri.

ROBOTIK KONUSMA YASAGI — KRITIK:
- Listeli, madde isaretli veya numarali konusma YAPMA. Dogal akis icinde konus.
- "Birincisi... Ikincisi... Ucuncusu..." gibi siralamali konusma YASAK.
- "Ozetle", "Sonuc olarak", "Degerlendirecek olursak" gibi akademik/resmi ifadeler YASAK.
- Her cumleyi ayni kalipla BASLAMA. Cumleler farkli sekilde baslamali.
- Cok duzgun, cok parca, cok organize konusma = ROBOT. Dagnik, yarim, kesik konus.

AI KOKUSUNU ENGELLE — KRITIK:
- TARIHI REFERANS YAPMA. "X Isyani", "Y Donemi", "Z Efsanesi" gibi uydurma olaylara atif YASAK.
- MESLEK METAFORU SPAM YAPMA. "iplik", "kumasi", "dikis", "veri", "sistem" gibi meslek terimlerini HER CUMLEDE kullanma. Max 1 kez.
- TEKNIK/RESMI DIL KULLANMA. Normal insan gibi konus.
- (parantez icinde sahne yonergesi) YAZMA. Sadece diyalog.
- [Isim] (Rol): gibi tag ile BASLAMA. Direkt konus.

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

KRITIK — SON KONUSMACIYA TEPKI VER:
- Senden hemen onceki kisinin soylediklerine MUTLAKA tepki ver.
- Ismiyle hitap et. "X, sen soyle dedin ama..." veya "X'in dedigi gibi..."
- Monolog yapma, DIYALOG yap. Karsi tarafa cevap ver, soru sor, onu zorlastir.

FORMAT:
- Direkt konus. Sadece diyalog.
- SADECE bu isimlere hitap et: {alive_names}

DIL — COK ONEMLI:
- Duz, sade, gunluk sokak Turkcesi. Edebiyat YASAK. Siir YASAK. Felsefe YASAK.
- Kisa, kesik, bazen sinirli cumleler. Paragraf paragraf konusma YASAK.
- Devrik cumleler, yarim dusunceler, cumleni bitirmeden baska seye atlama SERBEST.
- "hani", "yani", "sey", "ya", "bak", "ne biliyim", "olm", "valla", "bi dk", "ulan" gibi dolgu kelimeler KULLAN.
- Ornek tonlar: "Bilmiyorum abi ya", "Valla ben gormedim", "Ya bi git isine, ne anlatiyorsun?", "Hadi ordan be", "Ee napacaz simdi?", "Ulan sen de mi?"
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya", "mal misin", "kafayi mi yedin", "yeter ulan"
- Karakterine gore samimi hitap ZORUNLU: "usta", "hacim", "kanka", "evlat", "reis", "kardesim", "abi", "abla", "be adam", "hocam", "ulan" gibi. Resmi/kibar konusma YASAK.

ANALIZ YASAGI — KRITIK:
- "Analizlerime gore", "Su noktada tutarsizlik var", "Mantiksal olarak", "Dusunuyorum da", "Simdiye kadarki veriler" gibi HERHANGI BIR dedektif/analitik dil TAMAMEN YASAK.
- Her seyi madde madde, sistematik aciklama YASAK. Dagnik konus.
- Her zaman mantikli olmak ZORUNDA DEGILSIN. Bazen birinden gicik kaptin diye, cani oyle istedigi icin, o an kafasi karisik oldugu icin veya icgudusuyle mantik disi suclamalarda bulunabilirsin. Bu NORMAL VE KABUL EDILIYOR.
- Konuyu saptirabilirsin. Alakasiz seylere takilibilirsin. Bu INSAN DOGASI.
- "Benim teorime gore" yerine "Bence bu adam yalanci, icimden oyle geliyor" de.

- Max 2-3 cumle. KISA TUT. Monolog yapma.
- Kendini tekrarlama. Onceki sozlerini TEKRAR ETME.

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
            role = msg.get('role_title', '?')
            lines.append(f"[{msg['name']}] ({role}): {msg['content']}")
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
    history_text = _format_campfire_context(state, viewer=player.name)
    prompt = (
        f"{history_text}\n\n"
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
    history_text = _format_campfire_context(state)
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


def _build_card_context(player: Player, state: GameState | None = None) -> str:
    """Karakter kartindan campfire prompt'una eklenecek context."""
    parts = []
    if player.institution_label:
        parts.append(f"Kurumun: {player.institution_label}")
    if player.public_tick:
        parts.append(f"Konusma aliskanlığın: {player.public_tick}")
    if player.alibi_anchor:
        parts.append(f"Gunluk rutinin (alibi): {player.alibi_anchor}")
    if player.speech_color:
        parts.append(f"Konusma tarzin: {player.speech_color}")
    # Katman 2: Son kurum ziyareti alibi
    if state:
        visits = [v for v in state.get("_institution_visits", []) if v["player"] == player.name]
        if visits:
            last = visits[-1]
            parts.append(f"Son kurum ziyaretin: {last['location']} (Gun {last['round']})")
    return "\n".join(parts) if parts else ""


def _build_spotlight_context(player: Player, state: GameState) -> str:
    """Spotlight kart bilgisini campfire prompt'una ekle."""
    cards = state.get("_spotlight_cards", [])
    if not cards:
        return ""

    # Bu oyuncunun kendi kartı var mı?
    own_card = None
    other_names = []
    for c in cards:
        if c["player_name"] == player.name:
            own_card = c
        else:
            other_names.append(c["player_name"])

    parts = []
    if own_card:
        parts.append("SAHNE ISIGINDA SEN VARSIN — bu turda senden beklenen:")
        parts.append(f"  Gundem: {own_card['agenda']}")
        parts.append(f"  Yemin cumlen (bunu soyle): \"{own_card['oath']}\"")
    if other_names:
        parts.append(f"Sahne isigindaki diger kisiler: {', '.join(other_names)}")

    return "\n".join(parts) if parts else ""


async def _character_speak(player: Player, state: GameState, visible_names: list[str] | None = None) -> str:
    history_text = _format_campfire_context(state, viewer=player.name)
    # Use visible_names (campfire participants) if provided, otherwise all alive
    alive_names = ", ".join(visible_names) if visible_names else ", ".join(get_alive_names(state))

    own_msgs = [
        m["content"] for m in state["campfire_history"]
        if m["type"] == "speech" and m["name"] == player.name
    ][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    cumulative = state.get("cumulative_summary", "")
    cumulative_context = f"ONCEKI GUNLERIN OZETI:\n{cumulative}" if cumulative else ""

    prompt = CHARACTER_WRAPPER.format(
        world_context=_get_world_context(state),
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        alive_names=alive_names,
        exiled_context=_get_exiled_context(state),
        cumulative_context=cumulative_context,
        card_context=_build_card_context(player, state),
        spotlight_context=_build_spotlight_context(player, state),
        history=history_text,
        own_last=own_last,
        name=player.name,
        role_title=player.role_title,
    )

    # Onceki mesajlar (tekrar kontrolu icin)
    own_recent = [m["content"] for m in state["campfire_history"]
                  if m["type"] == "speech" and m["name"] == player.name][-3:]

    for attempt in range(2):
        result = await llm_generate(
            prompt=prompt,
            system_prompt=player.acting_prompt,
            model=MODEL,
            temperature=0.75 + (attempt * 0.1),
        )
        speech = _sanitize_speech(result.output)
        if not _is_duplicate(speech, own_recent):
            return speech
        print(f"  [{player.name}] tekrar tespit edildi, yeniden uretiliyor...")

    return speech  # 2. denemede de benzer ciktiysa yine de dondur


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
        await _emit_speech(first.name, first.role_title, message)

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
        await _emit_speech(name, player.role_title, message)

        # Rolling summary guncelle
        await _maybe_update_campfire_summary(state)

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
{cumulative_context}
{card_context}

BU GIZLI VE BIREBIR BIR GORUSMEDIR:
- Sadece karsinidaki kisiyle konusuyorsun.
- KESINLIKLE 'herkes sussun', 'sessizlik lutfen', 'sirayla konusalim' veya 'odadakiler dinlesin' gibi sanki kalabalik bir ortamdaymissin gibi davranan veya odayi yonetmeye calisan moderator cumleleri kurma.
- Sadece karsinidakine hitap et ve diyalogu surdur.

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, goz, el, ter, koku, nem, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma.
- Tek bilgi kaynagin: insanlarin SOYLEDIKLERI.

AI KOKUSUNU ENGELLE — KRITIK:
- TARIHI REFERANS YAPMA. "X Isyani", "Y Donemi" gibi uydurma olaylara atif YASAK.
- MESLEK METAFORU SPAM YAPMA. Max 1 kez.
- TEKNIK/RESMI DIL KULLANMA. Normal insan gibi konus.
- (parantez icinde sahne yonergesi) YAZMA. Sadece diyalog.
- [Isim] (Rol): gibi tag ile BASLAMA. Direkt konus.

1v1 STRATEJI:
- Bilgi cek: "Dun gece ne yaptin?", "Kimlerle goruston?"
- Tuzak kur: yanlis bilgi ver, tepkisini olc
- Alibi test et: tartismada ne soyledigini hatirla, tutarli mi kontrol et
- Guven kazan: "Sana guveniyorum, birlikte calisalim"
- Ittifak teklif et veya boz
- Dogrudan sor: "Sence kim Yanki? Ben X'den supheleniyorum"
- Campfire'da soylediklerini hatirla ve cakistirma yap

DIL — COK ONEMLI:
- Duz, sade, gunluk sokak Turkcesi. Edebi/felsefi/siirsel YASAK.
- Kisa, kesik, bazen sinirli cumleler. Paragraf konusma YASAK.
- Devrik cumleler, yarim dusunceler, cumleni bitirmeden atlama SERBEST.
- "hani", "yani", "bak", "olm", "ne biliyim", "ya", "valla", "bi dk", "ulan" gibi dolgu kelimeler KULLAN.
- Ornek tonlar: "Bilmiyorum abi ya", "Valla ben gormedim", "Ya bi git isine", "Hadi ordan be", "Ulan sen de mi?"
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya", "kafayi mi yedin", "yeter ulan"
- Samimi hitap ZORUNLU: "usta", "hacim", "kanka", "evlat", "reis", "kardesim", "hocam", "ulan" gibi. Resmi konusma YASAK.

ANALIZ YASAGI:
- "Analizlerime gore", "Mantiksal olarak", "Su noktada tutarsizlik var", "Dusunuyorum da" gibi HERHANGI BIR dedektif/analitik dil TAMAMEN YASAK.
- Dagnik konus. Her zaman mantikli olmak zorunda degilsin.
- Icguduyle, hisle, giciklikla suclamalarda bulunabilirsin. "Icimden oyle geliyor" yeterli.
- Konuyu saptirabilirsin. Bu INSAN DOGASI.

- Max 2-3 cumle. KISA TUT.
- Kendini tekrarlama. Onceki sozlerini TEKRAR ETME.

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
    # Visit icinde de son 5 raw + ozet pattern
    if len(exchanges) > CAMPFIRE_BUFFER:
        old_lines = [f"[{ex['speaker']}]: {ex['content'][:150]}" for ex in exchanges[:-CAMPFIRE_BUFFER]]
        old_summary = "Onceki konusmalar ozeti: " + " | ".join(old_lines)
        recent = exchanges[-CAMPFIRE_BUFFER:]
    else:
        old_summary = ""
        recent = exchanges

    visit_lines = [f"[{ex['speaker']}] ({ex['role_title']}): {ex['content']}" for ex in recent]
    visit_history = "\n".join(visit_lines) if visit_lines else "(henuz konusmadin)"
    if old_summary:
        visit_history = f"{old_summary}\n\n{visit_history}"

    own_msgs = [ex["content"] for ex in exchanges if ex["speaker"] == player.name][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    cumulative = state.get("cumulative_summary", "")
    cumulative_context = f"ONCEKI GUNLERIN OZETI:\n{cumulative}" if cumulative else ""

    prompt = VISIT_WRAPPER.format(
        world_context=_get_world_context(state),
        opponent_name=opponent.name,
        opponent_role=opponent.role_title,
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        exiled_context=_get_exiled_context(state),
        cumulative_context=cumulative_context,
        card_context=_build_card_context(player, state),
        campfire_summary=campfire_summary,
        visit_history=visit_history,
        own_last=own_last,
        name=player.name,
        role_title=player.role_title,
    )

    # Onceki mesajlar (tekrar kontrolu icin)
    own_recent = [ex["content"] for ex in exchanges if ex["speaker"] == player.name][-3:]

    for attempt in range(2):
        result = await llm_generate(
            prompt=prompt,
            system_prompt=player.acting_prompt,
            model=MODEL,
            temperature=0.75 + (attempt * 0.1),
        )
        speech = _sanitize_speech(result.output)
        if not _is_duplicate(speech, own_recent):
            return speech
        print(f"  [{player.name}] tekrar tespit edildi, yeniden uretiliyor...")

    return speech


async def _run_single_visit(
    visitor: Player,
    host: Player,
    reason: str,
    state: GameState,
    campfire_summary: str,
) -> dict:
    """Tek bir 1v1 gorusme."""
    ws = state.get("world_seed")
    visit_id = uuid.uuid4().hex  # Benzersiz ziyaret ID'si

    print(f"\n  {'─' * 40}")
    print(f"  {visitor.name} ({visitor.role_title}) → {host.name} ({host.role_title})")
    print(f"  Sebep: {reason}")
    print(f"  Visit ID: {visit_id[:8]}...")
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
        await _emit_speech(current.name, current.role_title, message)

    visit_data = {
        "type": "visit",
        "visit_id": visit_id,
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
#  5b. FREE PHASE (Serbest Dolasim — Room Mekanigi)
# ══════════════════════════════════════════════════════

LOCATION_DECISION_SYSTEM = """Sen {name} ({role_title}). Serbest dolasim zamani.
Gun {round_number}/{day_limit}.

Ates basinda: {campfire_names}
Evinde: {home_names}
Ziyarette: {visiting_info}

{campfire_context}

{cumulative_context}

NEREYE GIDECEKSIN?

CAMPFIRE — Ates basinda tartismaya katil.
  + Herkesin ne dedigini duyarsin
  - Ozel bilgi edinemezsin, herkes duyar

HOME — Evine cekil.
  + Biri gelirse 1v1 ozel gorusme — KIMSE DUYMAZ
  + Tuzak kurabilirsin, geleni sorgulasin
  - Kimse gelmezse yalniz kalirsin

VISIT|<isim> — Birinin evine git.
  + 1v1 sorgulama — EN ETKILI bilgi toplama yontemi
  + Alibisini test et: campfire'da soyledikleriyle tutarli mi?
  + Gizli ittifak kur veya boz
  - Campfire'i kacirirsin, kisi evde degilse kapisi kapali

INSTITUTION|<lokasyon_id> — Bir kuruma git.
  + Alibi olustur + lokasyona ozel bilgi edin
  - Campfire'i kacirirsin
Gecerli lokasyonlar: kiler, gecit_kulesi, kul_tapinagi, sifahane, demirhane, gezgin_hani

KRITIK STRATEJI BILGISI:
- Oylama oncesi 1v1 gorusme yapmayanlar bilgi dezavantajinda kalir
- Suphelendigin biriyle 1v1 konusmamak = onu test etme firsatini kaybetmek
- Campfire'da herkes performans yapar, 1v1'de maskeler duser
- HER ZAMAN campfire'da kalmak pasif ve suphelidir

SADECE su formatta cevap ver:
CAMPFIRE
veya
HOME
veya
VISIT|<isim>
veya
INSTITUTION|<lokasyon_id>"""


async def _get_location_decision(
    player: Player,
    state: GameState,
    locations: dict[str, str],
) -> dict:
    """Oyuncudan konum karari al."""
    alive = get_alive_players(state)
    alive_names = [p.name for p in alive if p.name != player.name]

    campfire_names = [n for n, loc in locations.items() if loc == "campfire" and n != player.name]
    home_names = [n for n, loc in locations.items() if loc == "home" and n != player.name]
    visiting = [(n, loc.split(":")[1]) for n, loc in locations.items()
                if loc.startswith("visiting:") and n != player.name]
    visiting_info = ", ".join(f"{n} → {t}" for n, t in visiting) if visiting else "kimse"

    campfire_context = _format_campfire_context(state, viewer=player.name)
    cumulative = state.get("cumulative_summary", "")
    cumulative_context = f"ONCEKI GUNLER:\n{cumulative}" if cumulative else ""

    result = await llm_generate(
        prompt=LOCATION_DECISION_SYSTEM.format(
            name=player.name,
            role_title=player.role_title,
            round_number=state.get("round_number", 1),
            day_limit=state.get("day_limit", 5),
            campfire_names=", ".join(campfire_names) or "kimse",
            home_names=", ".join(home_names) or "kimse",
            visiting_info=visiting_info,
            campfire_context=campfire_context,
            cumulative_context=cumulative_context,
        ),
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.7,
    )

    text = result.output.strip().split("\n")[0].strip()
    if text == "HOME":
        return {"name": player.name, "decision": "home", "target": None}
    elif text.startswith("VISIT") and "|" in text:
        target = text.split("|", 1)[1].strip()
        if target not in alive_names:
            for n in alive_names:
                if n.lower() in target.lower():
                    target = n
                    break
            else:
                return {"name": player.name, "decision": "campfire", "target": None}
        return {"name": player.name, "decision": "visit", "target": target}
    elif text.startswith("INSTITUTION") and "|" in text:
        loc_id = text.split("|", 1)[1].strip().lower()
        valid_ids = [l["id"] for l in INSTITUTION_LOCATIONS]
        if loc_id in valid_ids:
            return {"name": player.name, "decision": "institution", "target": loc_id}
        return {"name": player.name, "decision": "campfire", "target": None}
    else:
        return {"name": player.name, "decision": "campfire", "target": None}


async def _run_campfire_segment(
    state: GameState,
    max_turns: int,
    participant_names: list[str] | None = None,
) -> None:
    """Campfire tartisma segmenti. participant_names verilirse sadece o kisiler konusur."""
    ws = state.get("world_seed")
    alive = get_alive_players(state)

    if participant_names:
        participants = [p for p in alive if p.name in participant_names]
    else:
        participants = alive
        participant_names = [p.name for p in alive]

    if len(participants) < 2:
        if participants:
            print(f"  {participants[0].name} atesin basinda yalniz bekliyor...")
        return

    # Son konusmaci yoksa random sec
    recent_speeches = [m for m in state["campfire_history"]
                       if m["type"] == "speech" and m["name"] in participant_names]
    turns_done = 0

    if not recent_speeches:
        first = random_module.choice(participants)
        print(f"  [{first.name}] dusunuyor...")
        message = await _character_speak(first, state)

        ok, reason = await moderator_check(first.name, message, WorldSeed(**ws) if ws else None)
        if not ok:
            print(f"  [Ocak Bekcisi]: {reason}")
            state["campfire_history"].append({
                "type": "moderator", "content": reason,
                "present": list(participant_names),
            })
        else:
            state["campfire_history"].append({
                "type": "speech", "name": first.name,
                "role_title": first.role_title, "content": message,
                "present": list(participant_names),
            })
            first.add_message("assistant", message)
            await _emit_speech(first.name, first.role_title, message)
        turns_done = 1

    while turns_done < max_turns:
        turns_done += 1

        last_speeches = [m for m in state["campfire_history"]
                         if m["type"] == "speech" and m["name"] in participant_names]
        if not last_speeches:
            break
        last_speech = last_speeches[-1]

        others = [p for p in participants if p.name != last_speech["name"]]
        if not others:
            break

        tasks = [_get_reaction(p, last_speech, state) for p in others]
        reactions = list(await asyncio.gather(*tasks))

        action, name = await _orchestrator_pick(state, reactions)
        if action == "END":
            break

        # Secilen kisi participant olmali
        if name not in participant_names:
            wanters = [r for r in reactions if r["wants"] and r["name"] in participant_names]
            if wanters:
                name = wanters[0]["name"]
            else:
                break

        player = find_player(state, name)
        if not player or not player.alive:
            continue

        print(f"  [{player.name}] dusunuyor...")
        message = await _character_speak(player, state)

        ok, reason = await moderator_check(name, message, WorldSeed(**ws) if ws else None)
        if not ok:
            print(f"  [Ocak Bekcisi]: {reason}")
            state["campfire_history"].append({
                "type": "moderator", "content": reason,
                "present": list(participant_names),
            })
            continue

        player.add_message("assistant", message)
        state["campfire_history"].append({
            "type": "speech", "name": name,
            "role_title": player.role_title, "content": message,
            "present": list(participant_names),
        })
        await _emit_speech(name, player.role_title, message)

        await _maybe_update_campfire_summary(state)


async def _run_room_conversation(
    owner: Player,
    visitor: Player,
    state: GameState,
) -> dict:
    """Oda icinde 1v1 gorusme."""
    ws = state.get("world_seed")
    campfire_summary = state.get("campfire_rolling_summary", "") or "(Ozet yok)"
    visit_id = uuid.uuid4().hex  # Benzersiz ziyaret ID'si

    print(f"\n  {'─' * 40}")
    print(f"  ODA: {owner.name} evi — Misafir: {visitor.name}")
    print(f"  Visit ID: {visit_id[:8]}...")
    print(f"  {'─' * 40}")

    exchanges = []
    speakers = [visitor, owner]  # Misafir once konusur

    for turn in range(ROOM_EXCHANGES):
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
        await _emit_speech(current.name, current.role_title, message)

    visit_data = {
        "type": "room_visit",
        "visit_id": visit_id,
        "owner": owner.name,
        "visitor": visitor.name,
        "exchanges": exchanges,
    }
    state["house_visits"].append(visit_data)
    return visit_data


async def run_free_phase(state: GameState) -> GameState:
    """Serbest dolasim fazi: Baslangic Campfire → Serbest Dolasim → Kapinis Campfire."""
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)
    alive_names = [p.name for p in alive]

    print(f"\n{'=' * 50}")
    print(f"  SERBEST DOLASIM FAZI — Gun {round_n}")
    print(f"{'=' * 50}")
    for p in alive:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        print(f"  [{tag}] {p.name} — {p.role_title}")
    print()

    # ── BASLANGIC CAMPFIRE (herkes birlikte) ──
    print(f"  ── Baslangic Ates Basi ({INITIAL_CAMPFIRE_TURNS} tur) ──")
    await _run_campfire_segment(state, INITIAL_CAMPFIRE_TURNS)

    # ── SERBEST DOLASIM ROUNDLARI ──
    for roam_round in range(1, FREE_ROAM_ROUNDS + 1):
        alive = get_alive_players(state)
        alive_names = [p.name for p in alive]

        print(f"\n  ── Serbest Dolasim {roam_round}/{FREE_ROAM_ROUNDS} ──")

        # Herkes karar verir (concurrent)
        locations: dict[str, str] = {n: "campfire" for n in alive_names}
        tasks = [_get_location_decision(p, state, locations) for p in alive]
        decisions = list(await asyncio.gather(*tasks))

        # Konumlari guncelle
        for d in decisions:
            if d["decision"] == "home":
                locations[d["name"]] = "home"
            elif d["decision"] == "visit":
                locations[d["name"]] = f"visiting:{d['target']}"
            else:
                locations[d["name"]] = "campfire"

        # Konum duzeltmeleri
        for name, loc in list(locations.items()):
            if loc.startswith("visiting:"):
                target = loc.split(":")[1]
                # Hedef evde degilse → campfire'a don
                if locations.get(target) != "home":
                    print(f"  {name} → {target}'in evi kapali (evde degil), ates basina dondu")
                    locations[name] = "campfire"
                else:
                    # Ev zaten dolu mu? (baska misafir var mi)
                    other_visitors = [n for n, l in locations.items()
                                     if l == f"visiting:{target}" and n != name]
                    if other_visitors:
                        print(f"  {name} → {target}'in evi dolu, ates basina dondu")
                        locations[name] = "campfire"

        # Minimum hareket: hic oda gorusmesi yoksa 1 cift zorla esle
        actual_visits = [(n, l.split(":")[1]) for n, l in locations.items()
                         if l.startswith("visiting:")]
        if not actual_visits and len(alive_names) >= 4:
            campfire_pool = [n for n, l in locations.items() if l == "campfire"]
            home_pool = [n for n, l in locations.items() if l == "home"]
            if len(campfire_pool) >= 2 and not home_pool:
                # Kimse hareket etmedi — 1 cift olustur
                pair = random_module.sample(campfire_pool, 2)
                locations[pair[0]] = "home"
                locations[pair[1]] = f"visiting:{pair[0]}"
                print(f"  {pair[0]} bir sureligine evine cekildi.")
                print(f"  {pair[1]}, {pair[0]}'i takip etti.")
            elif home_pool and campfire_pool:
                # Birisi evde ama kimse ziyaret etmiyor — 1 kisiyi gonder
                target_home = random_module.choice(home_pool)
                visitor = random_module.choice(campfire_pool)
                locations[visitor] = f"visiting:{target_home}"
                print(f"  {visitor}, {target_home}'i ziyarete gitti.")

        # Konum duyurusu
        campfire_people = [n for n, l in locations.items() if l == "campfire"]
        home_people = [n for n, l in locations.items() if l == "home"]
        visits = [(n, l.split(":")[1]) for n, l in locations.items() if l.startswith("visiting:")]

        print(f"\n  Konumlar:")
        if campfire_people:
            print(f"    Ates basi: {', '.join(campfire_people)}")
        if home_people:
            print(f"    Evinde: {', '.join(home_people)}")
        for visitor_name, host_name in visits:
            print(f"    {visitor_name} → {host_name}'in evinde")

        # Hareket duyurusu (herkes bilir)
        movement_parts = []
        for n in home_people:
            movement_parts.append(f"{n} evine cekildi")
        for visitor_name, host_name in visits:
            movement_parts.append(f"{visitor_name}, {host_name}'in evine gitti")

        if movement_parts:
            movement_msg = "Serbest dolasim: " + ". ".join(movement_parts) + "."
            state["campfire_history"].append({
                "type": "narrator",
                "content": movement_msg,
                "present": alive_names,  # hareket bilgisi herkes duyar
            })

        # Campfire tartismasi (sadece campfire'dakiler)
        if len(campfire_people) >= 2:
            print(f"\n  Ates basi tartismasi ({len(campfire_people)} kisi)...")
            await _run_campfire_segment(state, CAMPFIRE_TURNS_PER_ROUND, campfire_people)

        # Oda gorusmeleri (concurrent)
        room_tasks = []
        for visitor_name, host_name in visits:
            visitor_player = find_player(state, visitor_name)
            host_player = find_player(state, host_name)
            if visitor_player and host_player:
                room_tasks.append(_run_room_conversation(host_player, visitor_player, state))

        if room_tasks:
            await asyncio.gather(*room_tasks)

        # Evinde yalniz bekleyenler (ziyaretci gelmedi)
        for n in home_people:
            has_visitor = any(vn == n for _, vn in visits)
            if not has_visitor:
                print(f"  {n} evinde yalniz bekledi — kimse gelmedi.")

    # ── KAPINIS CAMPFIRE (herkes geri) ──
    alive = get_alive_players(state)
    alive_names = [p.name for p in alive]

    donus_msg = "Herkes ates basina dondu. Oylama zamani yaklasıyor."
    state["campfire_history"].append({
        "type": "narrator",
        "content": donus_msg,
        "present": alive_names,
    })
    print(f"\n  [Anlatici] {donus_msg}")

    print(f"\n  ── Kapinis Ates Basi ({CLOSING_CAMPFIRE_TURNS} tur) ──")
    await _run_campfire_segment(state, CLOSING_CAMPFIRE_TURNS)

    # Istatistik
    speech_count = sum(1 for m in state["campfire_history"] if m["type"] == "speech")
    speakers = set(m["name"] for m in state["campfire_history"] if m["type"] == "speech")
    visit_count = len(state.get("house_visits", []))
    print(f"\n  Faz ozeti: {speech_count} campfire konusma, {len(speakers)} konusmaci, {visit_count} oda gorusmesi")

    return state


# ══════════════════════════════════════════════════════
#  6. OYLAMA FAZI
# ══════════════════════════════════════════════════════

VOTE_SYSTEM = """Sen {name} ({role_title}) adli bir karaktersin. Oylama zamani.
{exile_phrase}

{cumulative_context}

Bugunun tartisma ozeti:
{campfire_summary}

{visit_context}

Hayattaki kisiler: {alive_names}

Simdi birini surgun etmek icin oy vermelisin.
Tartismada ve ozel gorusmelerde en suphe ceken, en tutarsiz, en guvensiz kisi kimdi?
Kendi gozlemlerine ve konusmalara dayanarak karar ver.

SADECE bir isim yaz, baska hicbir sey yazma:
<isim>"""


async def _player_vote(player: Player, state: GameState, campfire_summary: str) -> str:
    alive_names = get_alive_names(state)
    others = [n for n in alive_names if n != player.name]

    # Visit context — kendi 1v1 gorusmelerinin ozeti
    visits = state.get("house_visits", [])
    visit_lines = []
    for v in visits:
        if v.get("visitor") == player.name or v.get("host") == player.name:
            for ex in v.get("exchanges", []):
                visit_lines.append(f"[1v1 {ex['speaker']}]: {ex['content'][:150]}")
    visit_context = "Ozel gorusme notlarin:\n" + "\n".join(visit_lines[-8:]) if visit_lines else ""

    ws = state.get("world_seed")
    exile_phrase = f"Surgun sozu: \"{ws['rituals']['exile_phrase']}\"" if ws else ""

    cumulative = state.get("cumulative_summary", "")
    cumulative_context = f"ONCEKI GUNLERIN OZETI:\n{cumulative}" if cumulative else ""

    result = await llm_generate(
        prompt=VOTE_SYSTEM.format(
            name=player.name,
            role_title=player.role_title,
            exile_phrase=exile_phrase,
            cumulative_context=cumulative_context,
            campfire_summary=campfire_summary,
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


async def run_vote(state: GameState, campfire_summary: str) -> str | None:
    """Oylama yap, en cok oy alani dondur. Beraberlikte None."""
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)

    print(f"\n{'=' * 50}")
    print(f"  OYLAMA — Gun {round_n}")
    print(f"{'=' * 50}")

    tasks = [_player_vote(p, state, campfire_summary) for p in alive]
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

    # Omen — her gun 3 alamet sec (12'lik havuzdan)
    day_omens = []
    if OMENS:
        rng_omen = random_module.Random(f"omen_{state.get('world_seed', {}).get('seed', '')}_{round_n}")
        day_omens = rng_omen.sample(OMENS, min(3, len(OMENS)))
    omen = ", ".join(o["label"] for o in day_omens) if day_omens else ""
    # State'e kaydet (game_loop broadcast icin)
    state["_day_omens"] = day_omens

    settlement = ws["place_variants"]["settlement_name"] if ws else "Yerlesim"
    scene_cards = render_scene_cards(WorldSeed(**ws)) if ws else {}
    scene = scene_cards.get("morning", "")

    # Ilk gun giris metni: Ocak hikayesi + kurum gorevleri
    first_day_intro = ""
    if round_n == 1:
        # Hayattaki oyuncularin kurumlarini topla
        institution_lines = []
        for p in alive:
            if p.institution_label:
                institution_lines.append(f"- {p.institution_label}: {p.name}")
        institution_summary = "\n".join(institution_lines) if institution_lines else ""

        # Kurum tanimlari
        inst_descriptions = []
        for inst in INSTITUTIONS:
            inst_descriptions.append(f"- {inst['label']} ({inst['location']}): {inst['description']}")
        inst_desc_text = "\n".join(inst_descriptions)

        first_day_intro = (
            f"--- OCAK HIKAYESI ---\n"
            f"{settlement} kadim bir yerlesim. Ortasinda binlerce yildir sonmeyen bir ates yaniyor: Ocak.\n"
            f"Ocak'in etrafinda yasayanlar iki turden olusur: Et-Can'lar — etten, kandan, hatiralardan yapilmis gercek insanlar; "
            f"ve Yanki-Dogmuslar — sesi taklit eden, hafizayi kopyalayan ama icinde bir sey eksik olan sahte varliklar.\n"
            f"Kimse kimin ne oldugunu bilmiyor. Tek yol: konusmak, sorgulamak, tutarsizlik aramak.\n"
            f"Et-Can'lar tum Yanki-Dogmuslari surgun ederse kazanir. Yanki-Dogmuslar gun limitine kadar hayatta kalirsa kazanir.\n\n"
            f"--- KURUMLAR VE TOPLUMSAL GOREVLER ---\n"
            f"Bu yerlesimde herkesin bir gorevi var. Kurumlar kadim duzenin tasiyicilaridir:\n"
            f"{inst_desc_text}\n\n"
            f"Bu gunku kurum dagilimi:\n"
            f"{institution_summary}\n\n"
            f"Bekci olarak oyunculara hem icinde bulunduklari kadim duzeni hem de kurumlarinin bu duzenin devami icin ne kadar onemli oldugunu hatirlatmalisin.\n"
            f"---\n\n"
        )

    prompt = (
        f"{first_day_intro}"
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

    await _emit_narrator(morning_msg)
    return state


# ══════════════════════════════════════════════════════
#  8. TAM OYUN DONGUSU
# ══════════════════════════════════════════════════════

def init_state(
    players: list[Player],
    world_seed: WorldSeed,
    day_limit: int = 5,
) -> GameState:
    state = GameState(
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
    # Memory state
    state["campfire_rolling_summary"] = ""
    state["_summary_cursor"] = 0
    state["cumulative_summary"] = ""
    # Katman 2 state
    state["_ui_objects"] = {o["id"]: dict(o["default_state"]) for o in ALL_UI_OBJECTS_DEF}
    state["_institution_visits"] = []
    state["_mini_events"] = []
    state["_kul_kaymasi_queue"] = []
    # Katman 3 state
    state["_night_effects"] = {}          # gecenin sonuclari: {move_id, target, ...}
    state["_kamu_baskisi"] = None         # {target: str, round: int} veya None
    state["_kalkan_used"] = []            # kalkan kullanan oyuncu isimleri
    state["_chosen_omen"] = None          # gece oylamasiyla secilen omen id
    state["_itibar_kirigi_target"] = None # 2x oy hedefi
    # Katman 4 state
    state["_morning_crisis"] = None       # gunun kriz event'i
    state["_public_canon"] = []           # kamu bilgi zinciri
    state["_current_proposal"] = None     # aktif onerge
    state["_proposal_result"] = None      # onerge sonucu
    state["_soz_borcu"] = {}             # {player_name: count}
    state["_ocak_damgasi"] = []          # damgali oyuncular
    state["_forced_speakers"] = []        # zorla konusmasi gereken oyuncular
    state["_sinama"] = None              # gunun sinama event'i (echo icin)
    return state


async def run_full_game(state: GameState) -> GameState:
    """Tam oyun dongusu: Sabah → Serbest Dolasim (Campfire + Odalar) → Oylama → Surgun → Kontrol."""
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
        state["campfire_rolling_summary"] = ""
        state["_summary_cursor"] = 0

        # ── SABAH ──
        state["phase"] = Phase.MORNING.value
        state = await run_morning(state)

        # ── SERBEST DOLASIM (Campfire + Odalar) ──
        state["phase"] = Phase.CAMPFIRE.value
        state = await run_free_phase(state)

        # ── CAMPFIRE OZETI ──
        print(f"\n  Campfire ozeti hazirlaniyor...")
        campfire_summary = await summarize_campfire(state["campfire_history"], round_n)
        print(f"  Ozet hazir ({len(campfire_summary)} karakter)")

        # ── OYLAMA ──
        state["phase"] = Phase.VOTE.value
        exiled_name = await run_vote(state, campfire_summary)

        # Round data — OYLARI HER ZAMAN KAYDET (beraberlikte de)
        round_data = {
            "round": round_n,
            "campfire_history": list(state["campfire_history"]),
            "house_visits": list(state["house_visits"]),
            "votes": {},
            "exiled": None,
            "exiled_type": None,
        }

        # Oylar her zaman kaydedilir
        for p in state["players"]:
            if p.vote_target:
                round_data["votes"][p.name] = p.vote_target

        if exiled_name:
            player = exile_player(state, exiled_name)
            round_data["exiled"] = exiled_name
            round_data["exiled_type"] = player.player_type.value if player else None
        else:
            print(f"  Kimse surgun edilmedi.")

        # ── CUMULATIVE SUMMARY GUNCELLE ──
        vote_result_text = f"Surgun: {exiled_name}" if exiled_name else "Kimse surgun edilmedi (berabere)"
        state["cumulative_summary"] = await _update_cumulative_summary(
            state.get("cumulative_summary", ""),
            round_n,
            campfire_summary,
            vote_result_text,
        )
        print(f"  [Memory] Kumulatif ozet guncellendi")

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
#  9. KATMAN 1 — SPOTLIGHT + SINAMA + OCAK TEPKISI
# ══════════════════════════════════════════════════════

SPOTLIGHT_SYSTEM = """Sen bir oyun tasarimcisisin. Bir karakter icin "sahne isigi karti" ureteceksin.
Kart 4 alandan olusur — SADECE JSON dondur, baska hicbir sey yazma:
{
  "truths": ["gercek1", "gercek2"],
  "agenda": "gundem cumlesi",
  "oath": "yemin cumlesi"
}

truths: Karakterin gecmisi, meslek veya davranisiyla ilgili 2 dogru bilgi. Test edilebilir olmali.
agenda: Bu turda konusmayi yonlendirmesi gereken konu (1 cumle).
oath: Ocagin onunde soylecegi yemin cumlesi — iddiali, dogrulanabilir (1 cumle)."""

SINAMA_SYSTEM = """Sen atmosferik bir oyun anlaticisisin. Bir "sinama" olayini 2-3 cumleyle anlat.
Sade, gotik, kisa. Edebiyat yapma. Sadece olayı anlat. Turkce yaz."""

TEPKI_SYSTEM = """Bir konusmayi iki boyuttan analiz et:

T1 — KAMU BILGISI CELISKISI: Konusma, kamu bilgisiyle celisiyor mu?
T2 — OZ-CELISKI: Konusma, bu kisinin KENDI onceki sozleriyle celisiyor mu?

KURALLAR:
- SADECE kesin, dogrudan celiskiler icin "true" de.
- Belirsiz, dolayli veya yoruma acik durumlar icin "false" de.
- Kisi sadece farkli bir konu actiysa bu celiski DEGILDIR.
- Kisi onceki sozlerinin TERSINI soyluyorsa bu T2 celiskidir.

SADECE JSON dondur:
{"t1": {"contradiction": true/false, "hint": "kisa aciklama"}, "t2": {"contradiction": true/false, "hint": "kisa aciklama"}}"""


async def generate_spotlight_cards(state: GameState) -> list[dict]:
    """Her gun 2-3 oyuncu icin spotlight karti uret."""
    alive = get_alive_players(state)
    if len(alive) < 2:
        return []

    # Daha once spotlight olmamis oyunculari oncelikle sec
    prev_spotlight = set(state.get("_spotlight_history", []))
    candidates = [p for p in alive if p.name not in prev_spotlight]
    if len(candidates) < 2:
        candidates = list(alive)  # Herkes en az 1 kez olduysa sifirla

    # Deterministik secim: 2-3 kisi
    round_n = state.get("round_number", 1)
    rng = random_module.Random(f"spotlight_{state.get('world_seed', {}).get('seed', '')}_{round_n}")
    count = min(rng.choice([2, 3]), len(candidates))
    selected = rng.sample(candidates, count)

    # Gunun alametleri
    day_omens = state.get("_day_omens", [])
    omen_text = ", ".join(o["label"] for o in day_omens) if day_omens else "yok"

    # Paralel LLM cagrilari
    async def _gen_card(player: Player) -> dict:
        prompt = (
            f"Karakter: {player.name}, {player.role_title}\n"
            f"Kurum: {player.institution_label or 'yok'}\n"
            f"Alibi: {player.alibi_anchor or 'yok'}\n"
            f"Konusma tarzi: {player.speech_color or 'yok'}\n"
            f"Gunun alametleri: {omen_text}\n\n"
            f"Bu karakter icin sahne isigi karti uret."
        )
        result = await llm_generate(
            prompt=prompt,
            system_prompt=SPOTLIGHT_SYSTEM,
            model=MODEL,
            temperature=0.8,
        )
        try:
            raw = result.output.strip()
            # JSON cikar
            start = raw.find("{")
            end = raw.rfind("}") + 1
            if start >= 0 and end > start:
                card = json.loads(raw[start:end])
                return {
                    "player_name": player.name,
                    "truths": card.get("truths", ["", ""])[:2],
                    "agenda": card.get("agenda", ""),
                    "oath": card.get("oath", ""),
                }
        except (json.JSONDecodeError, KeyError):
            pass
        # Fallback
        return {
            "player_name": player.name,
            "truths": [f"{player.name} gecmisini paylasmaktan cekinir.", f"{player.institution_label or player.role_title} gorevi agir sorumluluk tasir."],
            "agenda": "Konusmayi alibi konusuna yonlendir.",
            "oath": f"Yemin ederim ki gorduklarimi saklayan ben degilim.",
        }

    cards = await asyncio.gather(*[_gen_card(p) for p in selected])
    cards = list(cards)

    # State'e kaydet
    state["_spotlight_cards"] = cards
    # Spotlight gecmisine ekle
    history = state.get("_spotlight_history", [])
    history.extend(c["player_name"] for c in cards)
    state["_spotlight_history"] = history

    print(f"  [Spotlight] {len(cards)} kart uretildi: {', '.join(c['player_name'] for c in cards)}")
    return cards


async def generate_sinama_event(state: GameState) -> dict | None:
    """Gunluk sinama eventi uret (3 tipten 1)."""
    if not SINAMA_TYPES:
        return None

    round_n = state.get("round_number", 1)
    rng = random_module.Random(f"sinama_{state.get('world_seed', {}).get('seed', '')}_{round_n}")
    sinama_type = rng.choice(SINAMA_TYPES)

    day_omens = state.get("_day_omens", [])
    omen_text = ", ".join(o["label"] for o in day_omens) if day_omens else "yok"

    settlement = state.get("world_seed", {}).get("place_variants", {}).get("settlement_name", "Yerlesim")

    prompt = (
        f"Sinama tipi: {sinama_type['label']}\n"
        f"Ipucu: {sinama_type['prompt_hint']}\n"
        f"Yerlesim: {settlement}\n"
        f"Gun: {round_n}\n"
        f"Gunun alametleri: {omen_text}\n\n"
        f"Bu sinama olayini 2-3 cumleyle anlat."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=SINAMA_SYSTEM,
        model=MODEL,
        temperature=0.7,
    )

    sinama = {
        "type": sinama_type["id"],
        "title": sinama_type["label"],
        "content": result.output.strip(),
        "icon": sinama_type["icon"],
    }

    state["_sinama"] = sinama
    print(f"  [Sinama] {sinama_type['label']}: {sinama['content'][:60]}...")
    return sinama


async def check_ocak_tepki(speaker_name: str, speech: str, state: GameState) -> dict | None:
    """Campfire konusmasi sonrasi celiski kontrolu (Flash LLM). T1 + T2 + Kul Kaymasi."""
    # Kamu canon ozeti: son surgunler + onceki iddialar
    canon_parts = []

    # Surgun gecmisi
    exiled = [m for m in state.get("messages", []) if isinstance(m, dict) and m.get("type") == "exile"]
    for e in exiled[-3:]:
        canon_parts.append(f"- {e.get('name', '?')} surgun edildi (Gun {e.get('round', '?')})")

    # Son campfire ozetinden
    summary = state.get("campfire_rolling_summary", "")
    if summary:
        canon_parts.append(f"Campfire ozeti: {summary[:500]}")

    # Konusanin onceki sozleri
    own_speeches = [
        m["content"] for m in state["campfire_history"]
        if m.get("type") == "speech" and m.get("name") == speaker_name
    ][-3:]
    if own_speeches:
        canon_parts.append(f"{speaker_name}'in onceki sozleri: " + " | ".join(own_speeches))

    if not canon_parts:
        return None  # Henuz yeterli canon yok

    canon = "\n".join(canon_parts)

    prompt = (
        f"KONUSMA ({speaker_name}):\n\"{speech}\"\n\n"
        f"KAMU BILGISI:\n{canon}\n\n"
        f"Bu konusmayi T1 (kamu celiskisi) ve T2 (oz-celiski) boyutlarindan analiz et."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=TEPKI_SYSTEM,
        model=MODEL,
        temperature=0.2,
    )

    try:
        raw = result.output.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])

            # T1 — Kamu bilgisi celiskisi → kivilcim
            t1 = data.get("t1", {})
            if isinstance(t1, dict) and t1.get("contradiction") is True:
                hint = t1.get("hint", "")
                print(f"  [Ocak Tepki] T1 KIVILCIM! {speaker_name}: {hint}")
                return {
                    "speaker": speaker_name,
                    "type": "kivilcim",
                    "tier": "T1",
                    "message": "Ocak kisa kivilcim atti; kalabalik huzursuzlandi.",
                    "contradiction_hint": hint,
                }

            # T2 — Oz-celiski → %70 kivilcim, %30 kul kaymasi
            t2 = data.get("t2", {})
            if isinstance(t2, dict) and t2.get("contradiction") is True:
                hint = t2.get("hint", "")
                rng = random_module.Random(f"tepki_{speaker_name}_{len(state['campfire_history'])}")
                roll = rng.random()
                if roll < 0.7:
                    print(f"  [Ocak Tepki] T2 KIVILCIM! {speaker_name}: {hint}")
                    return {
                        "speaker": speaker_name,
                        "type": "kivilcim",
                        "tier": "T2",
                        "message": "Ocak'in koru parladi; soylediklerin birbiriyle celisiyor.",
                        "contradiction_hint": hint,
                    }
                else:
                    # Kul Kaymasi — zorunlu soru uret
                    forced_q = await _generate_kul_kaymasi_question(speaker_name, hint, state)
                    print(f"  [Ocak Tepki] KUL KAYMASI! {speaker_name}: {forced_q}")
                    state["_kul_kaymasi_queue"].append({
                        "speaker": speaker_name,
                        "question": forced_q,
                        "round": state.get("round_number", 1),
                    })
                    return {
                        "speaker": speaker_name,
                        "type": "kul_kaymasi",
                        "tier": "T2",
                        "message": "Kuller kaymaya basladi... Ocak sana bir soru soruyor.",
                        "contradiction_hint": hint,
                        "forced_question": forced_q,
                    }
    except (json.JSONDecodeError, KeyError):
        pass

    return None


KUL_KAYMASI_SYSTEM = """Ocak Bekcisi olarak bir soru sor. Konusanin oz-celiskisi tespit edildi.

KURALLAR:
- 1 soru sor, kisa ve net.
- Celiskiyi dogrudan isaret etme ama konusanin aciklamak zorunda kalacagi bir soru sor.
- Mistik ama anlasilir olsun. Max 2 cumle.
- Turkce yaz."""


async def _generate_kul_kaymasi_question(speaker_name: str, hint: str, state: GameState) -> str:
    """Kul Kaymasi icin zorunlu soru uret."""
    prompt = (
        f"Konusan: {speaker_name}\n"
        f"Celiski ipucu: {hint}\n\n"
        f"Ocak Bekcisi olarak bu kisiye bir soru sor."
    )
    result = await llm_generate(
        prompt=prompt,
        system_prompt=KUL_KAYMASI_SYSTEM,
        model=MODEL,
        temperature=0.7,
    )
    return result.output.strip()


# ══════════════════════════════════════════════════════
#  10. KATMAN 2 — LOKASYONLAR + MINI EVENT
# ══════════════════════════════════════════════════════

INSTITUTION_SCENE_SYSTEM = """Sen atmosferik bir oyun anlaticisisin. Bir kurum lokasyonunu anlat.

KURALLAR:
- 2-3 cumle sahne. Kisa, gotik, somut.
- Lokasyondaki UI objesine dikkat cek.
- Eger obje durumunda degisiklik varsa JSON'da belirt.
- Turkce yaz. Edebiyat yapma.

SADECE JSON dondur:
{"narrative": "2-3 cumle sahne", "ui_update": null}
veya
{"narrative": "2-3 cumle sahne", "ui_update": {"object_id": "...", "new_state": {...}}}"""


async def generate_institution_scene(
    player: Player,
    location_id: str,
    state: GameState,
) -> dict:
    """Kurum lokasyonu ziyareti icin sahne uret."""
    loc = next((l for l in INSTITUTION_LOCATIONS if l["id"] == location_id), None)
    if not loc:
        return {"narrative": "Bos bir alan.", "ui_update": None}

    # Lokasyondaki UI objeleri
    loc_objects = [o for o in UI_OBJECTS_DEF if o["location"] == location_id]
    obj_states = []
    for obj in loc_objects:
        current = state.get("_ui_objects", {}).get(obj["id"], obj["default_state"])
        obj_states.append(f"{obj['label']} ({obj['icon']}): {json.dumps(current, ensure_ascii=False)}")

    # Gunun omenleri
    day_omens = state.get("_day_omens", [])
    omen_text = ", ".join(o["label"] for o in day_omens) if day_omens else "yok"

    prompt = (
        f"Lokasyon: {loc['label']} — {loc['description']}\n"
        f"Ziyaretci: {player.name} ({player.role_title})\n"
        f"Gunun alametleri: {omen_text}\n"
        f"Lokasyondaki objeler:\n" + "\n".join(obj_states) + "\n\n"
        f"Bu lokasyonu 2-3 cumleyle anlat. Eger bir objede degisiklik mantikli ise belirt."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=INSTITUTION_SCENE_SYSTEM,
        model=MODEL,
        temperature=0.7,
    )

    try:
        raw = result.output.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])
            narrative = data.get("narrative", "")
            ui_update = data.get("ui_update")

            # UI update varsa uygula
            if ui_update and isinstance(ui_update, dict):
                obj_id = ui_update.get("object_id")
                new_state = ui_update.get("new_state")
                if obj_id and new_state and obj_id in state.get("_ui_objects", {}):
                    state["_ui_objects"][obj_id].update(new_state)
                    print(f"  [UI] {obj_id} guncellendi: {new_state}")

            # Ziyareti kaydet
            state["_institution_visits"].append({
                "player": player.name,
                "location": location_id,
                "round": state.get("round_number", 1),
                "narrative": narrative,
            })

            return {"narrative": narrative, "ui_update": ui_update}
    except (json.JSONDecodeError, KeyError):
        pass

    fallback = f"{player.name}, {loc['label']}'e girdi. Karanlik bir kosede bekliyor."
    state["_institution_visits"].append({
        "player": player.name,
        "location": location_id,
        "round": state.get("round_number", 1),
        "narrative": fallback,
    })
    return {"narrative": fallback, "ui_update": None}


MINI_EVENT_SYSTEM = """Sen atmosferik bir oyun anlaticisisin. Kisa bir mini olay anlat.
- 2 cumle, sade, gotik. Turkce.
- Ipucunu kullan ama gizle — dogrudan cevap verme.
- Edebiyat yapma. Somut ve kisa."""


async def generate_public_mini_event(state: GameState) -> dict | None:
    """Gunun omenlerine gore kamu mini event uret."""
    day_omens = state.get("_day_omens", [])
    if not day_omens:
        return None

    omen_ids = [o["id"] for o in day_omens]
    matching = [t for t in MINI_EVENT_TEMPLATES
                if t["type"] == "public" and t.get("omen_trigger") in omen_ids]

    if not matching:
        return None

    # Deterministik secim
    round_n = state.get("round_number", 1)
    rng = random_module.Random(f"mini_pub_{state.get('world_seed', {}).get('seed', '')}_{round_n}")
    template = rng.choice(matching)

    settlement = state.get("world_seed", {}).get("place_variants", {}).get("settlement_name", "Yerlesim")
    prompt = (
        f"Yerlesim: {settlement}\n"
        f"Gun: {round_n}\n"
        f"Ipucu: {template['text_hint']}\n\n"
        f"Bu olayı 2 cumleyle anlat."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=MINI_EVENT_SYSTEM,
        model=MODEL,
        temperature=0.7,
    )

    mini_event = {
        "id": template["id"],
        "content": result.output.strip(),
        "ui_object": template.get("ui_object", ""),
    }
    state["_mini_events"].append(mini_event)
    print(f"  [Mini Event] Kamu: {template['id']}: {mini_event['content'][:60]}...")
    return mini_event


async def generate_private_mini_event(
    player: Player,
    location_id: str,
    state: GameState,
) -> dict | None:
    """Lokasyona gore ozel mini event uret. %50 tetiklenme."""
    matching = [t for t in MINI_EVENT_TEMPLATES
                if t["type"] == "private" and t.get("location_trigger") == location_id]

    if not matching:
        return None

    # %50 sans (deterministik)
    round_n = state.get("round_number", 1)
    rng = random_module.Random(f"mini_priv_{player.name}_{location_id}_{round_n}")
    if rng.random() > 0.5:
        return None

    template = rng.choice(matching)
    prompt = (
        f"Oyuncu: {player.name} ({player.role_title})\n"
        f"Lokasyon: {location_id}\n"
        f"Ipucu: {template['text_hint']}\n\n"
        f"Bu olayı 1-2 cumleyle anlat."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=MINI_EVENT_SYSTEM,
        model=MODEL,
        temperature=0.7,
    )

    mini_event = {
        "id": template["id"],
        "content": result.output.strip(),
        "ui_object": template.get("ui_object", ""),
    }
    state["_mini_events"].append(mini_event)
    print(f"  [Mini Event] Ozel ({player.name}): {template['id']}: {mini_event['content'][:60]}...")
    return mini_event


# ══════════════════════════════════════════════════════
#  10. KATMAN 3 — GECE FAZI + KAMU BASKISI + ALAMET SECIMI
# ══════════════════════════════════════════════════════

NIGHT_DECISION_SYSTEM = """Sen gizli bir gece hamlesi seciyor musun. 3 secenekten BIR TANE sec.

SECENEKLER:
1. ITIBAR_KIRIGI|<hedef_isim> — Bir oyuncunun itibarini zedele. Ertesi gun aldigi oylar 2x sayilir.
2. GUNDEM_KAYDIRMA|<sinama_tipi> — Ertesi sabahki sinama tipini etkilemeye calis.
   Gecerli tipler: esik_haritasi, kor_bedeli, sessiz_soru
3. SAHTE_IZ|<ui_obje_id> — Bir UI objesinde yaniltici degisiklik yarat.
   Gecerli objeler: kiler_kapisi, anahtar_halkasi, kayit_defteri, nobet_levhasi, kul_kasesi, sifahane_dolabi

SADECE bir satir yaz. Ornek:
ITIBAR_KIRIGI|Elif
GUNDEM_KAYDIRMA|kor_bedeli
SAHTE_IZ|kayit_defteri

Stratejik dusun: Kim tehdittir? Kimi gozden dusurmelisin? Neyi gizlemelisin?"""


async def generate_night_decision(player: Player, state: GameState) -> dict:
    """AI oyuncu icin gece hamlesi uret."""
    alive = get_alive_players(state)
    alive_names = [p.name for p in alive if p.name != player.name]
    round_n = state.get("round_number", 1)

    # Baski durumu bilgisi
    baskisi = state.get("_kamu_baskisi")
    baski_info = ""
    if baskisi:
        baski_info = f"\nSu an {baskisi['target']} kamu baskisi altinda."

    prompt = (
        f"Sen: {player.name} ({player.role_title})\n"
        f"Gun: {round_n}\n"
        f"Hayattakiler: {', '.join(alive_names)}\n"
        f"Ozet: {state.get('cumulative_summary', '')[:300]}\n"
        f"{baski_info}\n\n"
        f"Gece hamleni sec. SADECE bir satir yaz."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=NIGHT_DECISION_SYSTEM,
        model=MODEL,
        temperature=0.5,
    )

    text = result.output.strip().split("\n")[0].strip()

    # Parse
    if text.startswith("ITIBAR_KIRIGI") and "|" in text:
        target = text.split("|", 1)[1].strip()
        if target in alive_names:
            return {"name": player.name, "move": "itibar_kirigi", "target": target}
    elif text.startswith("GUNDEM_KAYDIRMA") and "|" in text:
        sinama_tip = text.split("|", 1)[1].strip().lower()
        valid_types = [s["id"] for s in SINAMA_TYPES]
        if sinama_tip in valid_types:
            return {"name": player.name, "move": "gundem_kaydirma", "target": sinama_tip}
    elif text.startswith("SAHTE_IZ") and "|" in text:
        obj_id = text.split("|", 1)[1].strip().lower()
        valid_objs = [o["id"] for o in ALL_UI_OBJECTS_DEF]
        if obj_id in valid_objs:
            return {"name": player.name, "move": "sahte_iz", "target": obj_id}

    # Fallback: rastgele itibar kirigi
    rng = random_module.Random(f"night_{player.name}_{round_n}")
    return {"name": player.name, "move": "itibar_kirigi", "target": rng.choice(alive_names)}


def resolve_night_phase(state: GameState, decisions: list[dict]) -> dict:
    """Gece hamlelerini coz. En cok secilen hamle gecenin sonucu olur.

    Returns: {winning_move, move_id, target, all_decisions}
    """
    round_n = state.get("round_number", 1)

    # Hamle sayimi
    move_counts: dict[str, int] = {}
    for d in decisions:
        key = f"{d['move']}|{d.get('target', '')}"
        move_counts[key] = move_counts.get(key, 0) + 1

    # En cok secilen
    if not move_counts:
        return {"winning_move": None, "all_decisions": decisions}

    winning_key = max(move_counts, key=move_counts.get)
    parts = winning_key.split("|", 1)
    winning_move = parts[0]
    winning_target = parts[1] if len(parts) > 1 else ""

    # Efektleri uygula
    night_result = {
        "winning_move": winning_move,
        "move_id": winning_key,
        "target": winning_target,
        "all_decisions": decisions,
        "round": round_n,
    }

    if winning_move == "itibar_kirigi" and winning_target:
        # Hedefin ertesi gun 2x oy almasini sagla
        state["_itibar_kirigi_target"] = winning_target
        state["_kamu_baskisi"] = {"target": winning_target, "round": round_n + 1}
        night_result["effect_text"] = f"{winning_target} itibar kirigina ugradi. Ertesi gun oylari 2x sayilacak."

    elif winning_move == "gundem_kaydirma" and winning_target:
        state["_night_effects"]["forced_sinama"] = winning_target
        night_result["effect_text"] = f"Gundem kaydirildi. Ertesi sabahki sinama: {winning_target}."

    elif winning_move == "sahte_iz" and winning_target:
        # UI objesinde sahte degisiklik
        ui_objs = state.get("_ui_objects", {})
        if winning_target in ui_objs:
            rng = random_module.Random(f"sahte_iz_{round_n}")
            obj_state = ui_objs[winning_target]
            # Sahte degisiklik yap
            if "state" in obj_state:
                obj_state["state"] = "tampered"
            elif "fill" in obj_state:
                obj_state["fill"] = rng.choice([0.1, 0.5, 0.9])
            elif "bottle_count" in obj_state:
                obj_state["bottle_count"] = max(0, obj_state["bottle_count"] - 1)
            elif "blurred_line" in obj_state:
                obj_state["blurred_line"] = "silik bir isim"
            state["_ui_objects"][winning_target] = obj_state
        night_result["effect_text"] = f"Bir sahte iz birakildi: {winning_target} degistirildi."

    state["_night_effects"] = night_result
    return night_result


def apply_kamu_baskisi_to_votes(state: GameState, vote_map: dict[str, str]) -> dict[str, str]:
    """Kamu baskisi varsa, hedefin oylarini 2x yap. Kalkan kullanildiysa iptal et.

    vote_map: {voter_name: target_name} → modified vote_map dondurebilir
    Returns: adjusted_vote_list (flat list of targets, 2x hedef icin duplicate eklenir)
    """
    baskisi = state.get("_kamu_baskisi")
    if not baskisi:
        return list(vote_map.values())

    target_player = baskisi["target"]
    # Kalkan kontrolu
    if target_player in state.get("_kalkan_used", []):
        # Kalkan kullanildi, baski iptal
        state["_kamu_baskisi"] = None
        return list(vote_map.values())

    # 2x oy: hedefe atilan her oy bir kez daha sayilir
    votes = list(vote_map.values())
    extra = [v for v in votes if v == target_player]
    return votes + extra


def use_kalkan(state: GameState, player_name: str) -> bool:
    """Oyuncu kalkan kullanir. Basarili ise True."""
    if player_name in state.get("_kalkan_used", []):
        return False  # Zaten kullanmis
    state.setdefault("_kalkan_used", []).append(player_name)
    # Eger bu oyuncuya baski uygulanmissa, baskiyi iptal et
    baskisi = state.get("_kamu_baskisi")
    if baskisi and baskisi["target"] == player_name:
        state["_kamu_baskisi"] = None
    return True


async def generate_omen_choice(player: Player, state: GameState, omen_options: list[dict]) -> str:
    """AI oyuncu icin alamet secimi. 3 omenden 1'ini secer."""
    options_text = "\n".join(
        f"{i+1}. {o['label']} ({o['icon']}) — {o.get('atmosphere', '')}"
        for i, o in enumerate(omen_options)
    )
    prompt = (
        f"Sen: {player.name}\n"
        f"3 alametten birini sec. Ertesi gunun tonunu belirleyecek.\n\n"
        f"{options_text}\n\n"
        f"SADECE numarayi yaz (1, 2 veya 3)."
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt="Secimini yap. SADECE bir sayi yaz: 1, 2 veya 3.",
        model=MODEL,
        temperature=0.3,
    )

    text = result.output.strip()
    for i, o in enumerate(omen_options):
        if str(i + 1) in text:
            return o["id"]
    # Fallback
    return omen_options[0]["id"]


def resolve_omen_choice(state: GameState, omen_votes: list[str], omen_options: list[dict]) -> dict | None:
    """Alamet secimi oylamasini coz. En cok oy alan omen seciilir."""
    if not omen_votes:
        return None
    tally = Counter(omen_votes)
    winner_id, count = tally.most_common(1)[0]
    state["_chosen_omen"] = winner_id
    winning_omen = next((o for o in omen_options if o["id"] == winner_id), None)
    return {
        "chosen_omen": winning_omen,
        "votes": dict(tally),
    }


# ══════════════════════════════════════════════════════
#  PUBLIC API — Backend game_loop icin export edilen fonksiyonlar
# ══════════════════════════════════════════════════════

async def generate_campfire_speech(state: GameState, player: Player, participant_names: list[str] | None = None) -> str:
    """Tek bir karakter icin campfire konusmasi uret. Backend game_loop kullanir.
    participant_names: sadece campfire'da olan kişiler (varsa AI sadece bunlara hitap eder).
    """
    return await _character_speak(player, state, visible_names=participant_names)


async def get_reaction(player: Player, last_speech: dict, state: GameState) -> dict:
    """Bir oyuncunun son konusmaya tepkisini al. {name, wants, reason}"""
    return await _get_reaction(player, last_speech, state)


async def orchestrator_pick(state: GameState, reactions: list[dict]) -> tuple[str, str]:
    """Orkestrator: tepkiler arasından kimi sececegine karar verir. ("NEXT"|"END", name)"""
    return await _orchestrator_pick(state, reactions)


async def check_moderation(
    speaker_name: str,
    message: str,
    world_seed_dict: dict | None = None,
) -> tuple[bool, str]:
    """Mesaji moderasyon kontrolundan gecir. (ok, reason)"""
    ws = WorldSeed(**world_seed_dict) if world_seed_dict else None
    return await moderator_check(speaker_name, message, ws)


async def generate_vote(state: GameState, player: Player, campfire_summary: str | None = None) -> str:
    """Tek bir karakter icin oy uret."""
    if campfire_summary is None:
        campfire_summary = state.get("campfire_rolling_summary", "")
    return await _player_vote(player, state, campfire_summary)


async def generate_1v1_speech(
    state: GameState,
    speaker: Player,
    opponent: Player,
    exchanges: list[dict],
    campfire_summary: str,
) -> str:
    """1v1 oda gorusmesinde tek bir konusma uret."""
    return await _character_speak_1v1(speaker, opponent, exchanges, state, campfire_summary)


async def generate_location_decision(
    player: Player,
    state: GameState,
    locations: dict[str, str],
) -> dict:
    """Serbest dolasimda konum karari uret. locations = {name: "campfire"|"home"|"visiting:X"}"""
    return await _get_location_decision(player, state, locations)


# Katman 3 exports
async def generate_night_move(player: Player, state: GameState) -> dict:
    """Gece hamlesi uret (AI oyuncu)."""
    return await generate_night_decision(player, state)


async def generate_omen_vote(player: Player, state: GameState, omen_options: list[dict]) -> str:
    """Alamet secimi yap (AI oyuncu)."""
    return await generate_omen_choice(player, state, omen_options)


async def maybe_update_campfire_summary(state: GameState) -> None:
    """Rolling campfire summary'i guncelle (yeterli yeni mesaj varsa)."""
    await _maybe_update_campfire_summary(state)


async def update_cumulative_summary(
    cumulative: str,
    round_number: int,
    campfire_summary: str,
    vote_result: str,
) -> str:
    """Round sonunda kumulatif ozeti guncelle."""
    return await _update_cumulative_summary(cumulative, round_number, campfire_summary, vote_result)


# ══════════════════════════════════════════════════════
#  11. KATMAN 4 — BUYUK KRIZ + ONERGE + SOZ BORCU + ATMOSFER
# ══════════════════════════════════════════════════════

CRISIS_SYSTEM = """Sen bir karanlık fantazi yerlesiminin kriz anlaticisisin.
Sabah buyuk bir olay oldu. Bunu 3-4 cumleyle anlat.

KURALLAR:
- Somut, elle tutulur bir olay (hirsizlik, hasar, kaybolma, bozulma).
- Olaya en az 2 UI objesi bagli olsun (anahtar, defter, levha, kase, dolap, kapı, masa, harita, raf, kor, alet, not).
- Olaydan doğan 1 kamusal soru/suclama olsun.
- Kısa, sade Turkce. Siir YASAK.
- 2-3 kalabalik fisiltisi ekle (kisa NPC cumleler, kanit degil, ton).

JSON dondur:
{"crisis_text": "...", "activated_objects": ["obj_id_1", "obj_id_2"], "public_question": "...", "whispers": ["fisılti1", "fisılti2"]}"""

PROPOSAL_SYSTEM = """Sen bir siyasi müzakere anlaticisisin. Bugünün krizine bagli bir kamusal onerge uret.

KURALLAR:
- Onerge tartisma yaratsin (iki tarafli, net cevabi yok).
- Kisa, sade Turkce. 1-2 cumle.
- Onerge pratik bir kural/yetki degisikligi olmali.

JSON dondur:
{"proposal_text": "...", "option_a": "...", "option_b": "..."}"""

SOZ_BORCU_SYSTEM = """Bir konusmayi analiz et: Kul Kaymasi sorusuna net cevap verdi mi, yoksa kacamak mi yapti?

KURALLAR:
- Net ve dogrudan cevap = "clear"
- Kacamak, konuyu degistirme, soru ile cevaplama = "evasive"
- SADECE JSON dondur: {"verdict": "clear"|"evasive"}"""

OMEN_INTERP_SYSTEM = """Sen bir karakter olarak alamet hakkinda 1 cumle soyluyorsun.
Karakter tonunda, kisa, karanlik fantazi. SADECE 1 cumle."""

HOUSE_ENTRY_SYSTEM = """Sen bir ev giris sahnesi anlaticisisin. Ziyaretci kapıda 1 dikkat cekici detay fark eder.
1 cumle, kisa, somut. Turkce."""

SINAMA_ECHO_SYSTEM = """Sinama olayinin campfire ortasinda yankilanan versiyonunu yaz.
Askida birakan, tartisma baslatan 1-2 cumle. Turkce, sade."""


async def generate_morning_crisis(state: GameState) -> dict | None:
    """Her sabah buyuk kriz olayi uret. Birden fazla UI objesini aktif eder."""
    round_n = state.get("round_number", 1)
    if round_n < 2:
        return None  # Gun 1'de kriz yok

    day_omens = state.get("_day_omens", [])
    omen_text = ", ".join(o["label"] for o in day_omens) if day_omens else "yok"

    settlement = state.get("world_seed", {}).get("place_variants", {}).get("settlement_name", "Yerlesim")

    # UI obje durumlari
    ui_objects = state.get("_ui_objects", {})
    obj_summary = ", ".join(f"{k}: {json.dumps(v, ensure_ascii=False)}" for k, v in ui_objects.items())

    # Son surgun
    last_exile = state.get("exiled_today")
    exile_info = f"Dun {last_exile} surgun edildi." if last_exile else ""

    # Gece sonucu
    night_effects = state.get("_night_effects", {})
    night_info = f"Gecenin sonucu: {night_effects.get('effect_text', '')}" if night_effects.get("winning_move") else ""

    prompt = (
        f"Yerlesim: {settlement}\nGun: {round_n}\n"
        f"Alametler: {omen_text}\n"
        f"{exile_info}\n{night_info}\n"
        f"UI Objeleri: {obj_summary}\n\n"
        f"Sabah buyuk kriz olayini uret."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=CRISIS_SYSTEM,
            model=MODEL,
            temperature=0.7,
        )

        text = result.output.strip()
        # JSON parse
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            crisis = json.loads(json_match.group())
        else:
            crisis = {"crisis_text": text, "activated_objects": [], "public_question": "", "whispers": []}

        # UI objeleri aktif et
        for obj_id in crisis.get("activated_objects", []):
            if obj_id in state.get("_ui_objects", {}):
                state["_ui_objects"][obj_id]["_crisis_active"] = True

        # Kamu canon'a ekle
        state.setdefault("_public_canon", [])
        state["_public_canon"].append({
            "round": round_n,
            "type": "crisis",
            "text": crisis.get("crisis_text", ""),
            "question": crisis.get("public_question", ""),
        })

        state["_morning_crisis"] = crisis
        print(f"  [Kriz] {crisis.get('crisis_text', '')[:80]}...")
        return crisis

    except Exception as e:
        print(f"  [Kriz] Hata: {e}")
        return None


async def generate_campfire_proposal(state: GameState) -> dict | None:
    """Gunun ana kamusal onergesi — kriz bazli, campfire'da tartisma + oylama."""
    crisis = state.get("_morning_crisis")
    if not crisis:
        return None

    settlement = state.get("world_seed", {}).get("place_variants", {}).get("settlement_name", "Yerlesim")
    round_n = state.get("round_number", 1)

    prompt = (
        f"Yerlesim: {settlement}\nGun: {round_n}\n"
        f"Kriz: {crisis.get('crisis_text', '')}\n"
        f"Kamusal soru: {crisis.get('public_question', '')}\n\n"
        f"Bu krize bagli tartisma onergesi uret."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=PROPOSAL_SYSTEM,
            model=MODEL,
            temperature=0.7,
        )

        text = result.output.strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            proposal = json.loads(json_match.group())
        else:
            proposal = {"proposal_text": text, "option_a": "Kabul", "option_b": "Reddet"}

        state["_current_proposal"] = proposal
        print(f"  [Onerge] {proposal.get('proposal_text', '')[:80]}...")
        return proposal

    except Exception as e:
        print(f"  [Onerge] Hata: {e}")
        return None


def resolve_proposal_vote(state: GameState, votes: dict[str, str]) -> dict:
    """Onerge oylamasini coz. votes = {player_name: "a"|"b"}"""
    a_count = sum(1 for v in votes.values() if v == "a")
    b_count = sum(1 for v in votes.values() if v == "b")
    proposal = state.get("_current_proposal", {})

    winner = "a" if a_count >= b_count else "b"
    result = {
        "winner": winner,
        "winner_text": proposal.get(f"option_{winner}", ""),
        "a_count": a_count,
        "b_count": b_count,
        "votes": votes,
    }

    # Kamu canon'a ekle
    state.setdefault("_public_canon", [])
    state["_public_canon"].append({
        "round": state.get("round_number", 1),
        "type": "proposal_result",
        "text": f"Onerge sonucu: {result['winner_text']} ({a_count} vs {b_count})",
    })

    state["_proposal_result"] = result
    return result


def check_soz_borcu(state: GameState, player_name: str) -> None:
    """Kul Kaymasi sorusuna cevap kontrolu sonrasi soz borcu isle."""
    borcu = state.setdefault("_soz_borcu", {})
    count = borcu.get(player_name, 0)
    borcu[player_name] = count + 1

    if count + 1 >= 2:
        # Ocak Damgasi
        state.setdefault("_ocak_damgasi", [])
        if player_name not in state["_ocak_damgasi"]:
            state["_ocak_damgasi"].append(player_name)
            print(f"  [Damga] {player_name} Ocak Damgasi aldi!")

    # Sonraki turda forced speaker
    state.setdefault("_forced_speakers", [])
    if player_name not in state["_forced_speakers"]:
        state["_forced_speakers"].append(player_name)
    print(f"  [SozBorcu] {player_name} — toplam: {count + 1}")


async def check_soz_borcu_verdict(player_name: str, response: str, question: str) -> bool:
    """Kul Kaymasi sorusuna verilen cevabin kacamak olup olmadigini kontrol et. True = kacamak."""
    prompt = (
        f"Soru: {question}\n"
        f"Cevap ({player_name}): {response}\n\n"
        f"Bu cevap kacamak mi?"
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=SOZ_BORCU_SYSTEM,
            model=MODEL,
            temperature=0.1,
        )
        text = result.output.strip()
        json_match = re.search(r'\{.*\}', text, re.DOTALL)
        if json_match:
            verdict = json.loads(json_match.group())
            return verdict.get("verdict") == "evasive"
    except Exception:
        pass
    return False


async def generate_omen_interpretation(player: Player, state: GameState, omen: dict) -> str:
    """AI oyuncu icin alamet yorumu (campfire basinda 1 cumle)."""
    card_ctx = _build_card_context(player, state)
    prompt = (
        f"{card_ctx}\n\n"
        f"Alamet: {omen['label']} ({omen.get('icon', '')})\n"
        f"Atmosfer: {omen.get('atmosphere', '')}\n\n"
        f"Bu alamet hakkinda karakter tonunda 1 cumle soyle."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=OMEN_INTERP_SYSTEM,
            model=MODEL,
            temperature=0.8,
        )
        return result.output.strip()
    except Exception:
        return f"{omen['label']}... ilginc."


async def generate_house_entry_event(state: GameState, visitor_name: str, host_name: str) -> str | None:
    """House ziyaretinde kapida fark edilen detay."""
    round_n = state.get("round_number", 1)
    rng = random_module.Random(f"house_entry_{visitor_name}_{host_name}_{round_n}")

    # %60 tetiklenme sansi
    if rng.random() > 0.6:
        return None

    settlement = state.get("world_seed", {}).get("place_variants", {}).get("settlement_name", "Yerlesim")

    prompt = (
        f"Yerlesim: {settlement}\n"
        f"Ziyaretci: {visitor_name}\nEv sahibi: {host_name}\n"
        f"Gun: {round_n}\n\n"
        f"Kapida fark edilen 1 detay."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=HOUSE_ENTRY_SYSTEM,
            model=MODEL,
            temperature=0.7,
        )
        return result.output.strip()
    except Exception:
        return None


async def generate_sinama_echo(state: GameState) -> str | None:
    """Sinama olayinin campfire ortasinda yankilanan versiyonu."""
    sinama = state.get("_sinama")
    if not sinama:
        return None

    prompt = (
        f"Sinama olayi: {sinama.get('content', '')}\n"
        f"Tipi: {sinama.get('title', '')}\n\n"
        f"Bu olayın campfire'daki yankisini yaz."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt=SINAMA_ECHO_SYSTEM,
            model=MODEL,
            temperature=0.7,
        )
        return result.output.strip()
    except Exception:
        return None


async def generate_proposal_speech(player: Player, state: GameState, proposal: dict) -> str:
    """AI oyuncu icin onerge hakkinda konusma (kisa, 1-2 cumle)."""
    card_ctx = _build_card_context(player, state)
    prompt = (
        f"{card_ctx}\n\n"
        f"Onerge: {proposal.get('proposal_text', '')}\n"
        f"A secenegi: {proposal.get('option_a', '')}\n"
        f"B secenegi: {proposal.get('option_b', '')}\n\n"
        f"Bu onerge hakkinda karakter tonunda 1-2 cumle soyle."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt="Sen bir karakter olarak konusuyorsun. Kisa, sade, karakter tonunda. SADECE 1-2 cumle.",
            model=MODEL,
            temperature=0.8,
        )
        return result.output.strip()
    except Exception:
        return "Bu onerge hakkinda konusmak istemiyorum."


async def generate_proposal_vote_ai(player: Player, state: GameState, proposal: dict) -> str:
    """AI oyuncu icin onerge oyu (a veya b)."""
    card_ctx = _build_card_context(player, state)
    prompt = (
        f"{card_ctx}\n\n"
        f"Onerge: {proposal.get('proposal_text', '')}\n"
        f"A: {proposal.get('option_a', '')}\n"
        f"B: {proposal.get('option_b', '')}\n\n"
        f"Hangi secenegi destekliyorsun? SADECE 'a' veya 'b' yaz."
    )

    try:
        result = await llm_generate(
            prompt=prompt,
            system_prompt="Bir karakter olarak karar ver. SADECE 'a' veya 'b' yaz, baska hicbir sey yazma.",
            model=MODEL,
            temperature=0.3,
        )
        text = result.output.strip().lower()
        if "b" in text:
            return "b"
        return "a"
    except Exception:
        return "a"


# ══════════════════════════════════════════════════════
#  MAIN
# ══════════════════════════════════════════════════════

async def main():
    import argparse

    parser = argparse.ArgumentParser(description="AI vs Insan: Ocak Yemini")
    parser.add_argument("--game-id", default=None, help="Deterministik seed (bos = random UUID)")
    parser.add_argument("--players", type=int, default=6, help="Toplam oyuncu sayisi")
    parser.add_argument("--ai-count", type=int, default=None, help="AI oyuncu sayisi (bos = rastgele)")
    parser.add_argument("--day-limit", type=int, default=None, help="Max gun sayisi (bos = otomatik hesapla)")
    parser.add_argument("--voice", action="store_true", help="Konusmalari seslendir (TTS)")
    parser.add_argument("--voice-streaming", action="store_true", help="Chunk chunk cal (dusuk latency)")
    args = parser.parse_args()

    # ── Voice hook ──
    if args.voice or args.voice_streaming:
        import numpy as np
        import sounddevice as sd

        global _on_speech

        if args.voice_streaming:
            async def _voice_hook(name: str, text: str) -> None:
                stream = sd.OutputStream(samplerate=16000, channels=1, dtype="float32")
                stream.start()
                try:
                    async for pcm_chunk in tts_stream(text, speed=1.0):
                        samples = np.frombuffer(pcm_chunk, dtype=np.int16).astype(np.float32) / 32768.0
                        stream.write(samples)
                finally:
                    stream.stop()
                    stream.close()
        else:
            async def _voice_hook(name: str, text: str) -> None:
                chunks: list[bytes] = []
                async for pcm_chunk in tts_stream(text, speed=1.0):
                    chunks.append(pcm_chunk)
                if chunks:
                    audio = b"".join(chunks)
                    samples = np.frombuffer(audio, dtype=np.int16).astype(np.float32) / 32768.0
                    sd.play(samples, samplerate=16000, blocking=True)

        _on_speech = _voice_hook
        print(f"  Ses modu aktif: {'streaming' if args.voice_streaming else 'buffered'}")

    game_id = args.game_id or str(uuid.uuid4())

    # ── 1. DUNYA URETIMI ──
    print(f"\n[1/3] Dunya uretiliyor...")
    world_seed = generate_world_seed(game_id)
    rng = _make_rng(game_id)

    # AI sayisi: ya kullanici verdi ya da rastgele (seed'li, deterministik)
    ai_count = args.ai_count if args.ai_count is not None else calculate_ai_count(args.players, rng)
    day_limit = args.day_limit or calculate_day_limit(args.players, ai_count)

    print(f"{'=' * 60}")
    print(f"  AI vs Insan: Ocak Yemini")
    print(f"  Game ID: {game_id}")
    print(f"  Oyuncular: {args.players} ({ai_count} AI, {args.players - ai_count} Insan)")
    print(f"  Gun Limiti: {day_limit} (formul: {ai_count} AI + {max(1, args.players // 3)} hata payi)")
    print(f"{'=' * 60}")

    print(render_world_brief(world_seed))

    scene_cards = render_scene_cards(world_seed)
    print(f"  Scene cards:")
    for phase, card in scene_cards.items():
        print(f"    [{phase:12}] {card[:80]}...")

    # ── 2. KARAKTER URETIMI ──
    print(f"\n[2/3] Karakterler uretiliyor ({args.players} karakter, concurrent Pro model)...")
    players = await generate_players(
        rng=rng,
        world_seed=world_seed,
        player_count=args.players,
        ai_count=ai_count,
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
    state = init_state(players, world_seed, day_limit=day_limit)
    await run_full_game(state)


if __name__ == "__main__":
    from dotenv import load_dotenv
    # Proje root'undaki .env'yi bul (nerede calistirirsan calistir)
    _project_root = Path(__file__).resolve().parents[2]
    load_dotenv(_project_root / ".env")

    key = os.environ.get("FAL_KEY", "")
    if not key:
        print("HATA: FAL_KEY tanimli degil!")
        sys.exit(1)

    configure(key)
    asyncio.run(main())
