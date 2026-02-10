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
from fal_services import llm_generate, configure, tts_stream
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
    # Bas kismi sahne yonergesi — (öfkeyle), (sakin bir tonla), (fisiltıyla) vb.
    text = re.sub(r'^\([^)]{1,40}\)\s*', '', text.strip())
    # Orta/son kisim uzun sahne yonergesi (20+ karakter)
    text = re.sub(r'\([^)]{20,}\)', '', text)
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
            lines.append(f"[{msg['name']}] ({msg['role_title']}): {msg['content']}")
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
{cumulative_context}
Soz hakki sana geldi.

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, yuzun, yuzunde, yuzune, goz, gozler, el, eller, ter, kir, koku, nem, rutubet, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma, bakmak, gormek, panik, korku, titreme.
- "yuzunde X var", "gozlerinde Y", "elleri titredi" gibi HERHANGI BIR fiziksel tasvir YASAK.
- ASLA metafor/siir/edebiyat yapma. YASAK.
- Tek bilgi kaynagin: insanlarin SOYLEDIKLERI ve soylemedikleri.

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

FORMAT:
- Direkt konus. Sadece diyalog.
- SADECE bu isimlere hitap et: {alive_names}

DIL — COK ONEMLI:
- Duz, sade, gunluk Turkce. Edebiyat YASAK. Siir YASAK. Felsefe YASAK.
- Kisa cumleler, yarim dusunceler, devrik cumleler
- "hani", "yani", "sey", "ya", "bak", "ne biliyim", "olm" gibi dolgu kelimeler
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya", "mal misin"
- Max 3-4 cumle. Monolog yapma.
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


async def _character_speak(player: Player, state: GameState) -> str:
    history_text = _format_campfire_context(state, viewer=player.name)
    alive_names = ", ".join(get_alive_names(state))

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
            temperature=0.9 + (attempt * 0.1),
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

DIL:
- Duz, sade, gunluk Turkce. Edebi/felsefi/siirsel YASAK.
- Kisa cumleler, devrik cumleler, yarim dusunceler
- "hani", "yani", "bak", "olm", "ne biliyim", "ya"
- Sert olabilirsin: "ne sacmaliyorsun", "birak ya"
- Max 3-4 cumle.
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
            temperature=0.9 + (attempt * 0.1),
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
        await _emit_speech(current.name, current.role_title, message)

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
VISIT|<isim>"""


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

    print(f"\n  {'─' * 40}")
    print(f"  ODA: {owner.name} evi — Misafir: {visitor.name}")
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
