"""
house_visit.py — 1v1 Ozel Gorusme Prototipi
=============================================
Karakterler kiminle gorusmek istediklerini secer,
eslestirilir, bire bir konusma yaparlar.

Kullanim:
    uv run python src/prototypes/house_visit.py
"""

import asyncio
import json
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fal_services import llm_generate, configure
from game_state import (
    Player, PlayerType, Phase, GameState,
    get_alive_players, get_alive_names, find_player,
)

# -- Config -------------------------------------------------------

MODEL = "google/gemini-2.5-flash"
CHARS_PATH = Path(__file__).parent / "generated_characters.json"
CAMPFIRE_LOG_PATH = Path(__file__).parent / "campfire_log.json"
OUTPUT_PATH = Path(__file__).parent / "house_visit_log.json"
MAX_EXCHANGES = 8


# -- Karakter Yukleme ---------------------------------------------

def load_players() -> list[Player]:
    with open(CHARS_PATH) as f:
        data = json.load(f)

    players = []
    for c in data["characters"]:
        player = Player(
            slot_id=c["slot_id"],
            name=c["name"],
            role_title=c["role_title"],
            lore=c["lore"],
            archetype=c["archetype"],
            archetype_label=c.get("archetype_label", c["archetype"]),
            player_type=PlayerType.YANKI_DOGMUS if c["is_echo_born"] else PlayerType.ET_CAN,
            acting_prompt=c["acting_prompt"],
            skill_tier=c.get("skill_tier"),
            skill_tier_label=c.get("skill_tier_label"),
        )
        players.append(player)
    return players


SUMMARIZE_SYSTEM = """Sen bir tartisma ozetcisisin. Sana bir grup tartismasinin tam logunu verecegim.

Kisa ve net bir ozet yaz (max 10 cumle). Su bilgileri icermeli:
- Kim kimi sucladi?
- Kim alibi verdi, ne dedi?
- Hangi tutarsizliklar ortaya cikti?
- Kim en cok suphe topladi?
- Kim suskundu, kim saldirgandi?
- Onemli ittifaklar veya catismalar

Turkce yaz. Duz, sade dil. Madde madde yaz."""


# Cache: gun → ozet
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


async def load_campfire_summary() -> str:
    """Standalone mod: campfire_log.json veya game_log.json'dan ozet uret."""
    # game_log.json varsa gun gun ozetle
    game_log_path = Path(__file__).parent / "game_log.json"
    if game_log_path.exists():
        with open(game_log_path) as f:
            game_log = json.load(f)

        summaries = []
        for round_data in game_log.get("rounds", []):
            history = round_data.get("campfire_history", [])
            round_n = round_data.get("round", 1)
            if history:
                summary = await summarize_campfire(history, round_n)
                summaries.append(summary)

        if summaries:
            return "\n\n".join(summaries)

    # Fallback: campfire_log.json (tek round)
    if CAMPFIRE_LOG_PATH.exists():
        with open(CAMPFIRE_LOG_PATH) as f:
            log = json.load(f)
        history = log.get("campfire_history", [])
        if history:
            return await summarize_campfire(history, 1)

    return "(Onceki tartisma yok)"


def init_state(players: list[Player]) -> GameState:
    return GameState(
        messages=[],
        players=players,
        phase=Phase.HOUSES.value,
        round_number=1,
        day_limit=5,
        current_speaker=None,
        campfire_history=[],
        house_visits=[],
        exiled_today=None,
        winner=None,
    )


# -- Moderator (campfire ile ayni) --------------------------------

MODERATOR_SYSTEM = """Sen Ocak Bekcisi'sin. Konusmalari sessizce izliyorsun.

Kural ihlali var mi kontrol et:
1. Dis-dunya terimleri (AI, LLM, model, prompt, sistem, oyun, bot, algoritma)
2. Gercek hayat referanslari (internet, telefon, bilgisayar vb.)
3. Dogrudan kimlik iddiasi ("ben gercek insanim", "ben Yanki-Dogmusum", "sen bir AI'sin")

ONEMLI: Evren ici fantastik terimler (Yanki-Dogmus, Et-Can, Ocak, Bekci vb.) kural ihlali DEGILDIR.

SADECE su formatta cevap ver:
OK
veya
REMOVE|<kisa aciklama>"""


async def moderator_check(speaker_name: str, message: str) -> tuple[bool, str]:
    result = await llm_generate(
        prompt=f"[{speaker_name}]: {message}",
        system_prompt=MODERATOR_SYSTEM,
        model=MODEL,
        temperature=0.1,
    )
    text = result.output.strip()
    if text.startswith("REMOVE"):
        reason = text.split("|", 1)[1].strip() if "|" in text else "Kural ihlali."
        return False, reason
    return True, ""


# ==================================================================
#  1. ISTEK TOPLAMA — Her karakter kiminle gorusmek istiyor?
# ==================================================================

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


async def get_visit_request(player: Player, state: GameState, campfire_summary: str) -> dict:
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

        # Validate isim
        if target not in alive_names:
            for n in alive_names:
                if n.lower() in target.lower():
                    target = n
                    break
            else:
                return {"name": player.name, "wants": False, "target": "", "reason": ""}

        return {"name": player.name, "wants": True, "target": target, "reason": reason}

    return {"name": player.name, "wants": False, "target": "", "reason": ""}


async def collect_requests(state: GameState, campfire_summary: str) -> list[dict]:
    alive = get_alive_players(state)
    tasks = [get_visit_request(p, state, campfire_summary) for p in alive]
    return list(await asyncio.gather(*tasks))


# ==================================================================
#  2. ESLESTIRME
# ==================================================================

def match_pairs(requests: list[dict]) -> list[tuple[str, str, str]]:
    """Isteklerden ciftler olustur. Return: [(visitor, host, reason), ...]"""
    wanters = {r["name"]: r for r in requests if r["wants"]}
    matched = set()
    pairs = []

    # Oncelik 1: karsilikli istekler (A→B ve B→A)
    for name, req in wanters.items():
        target = req["target"]
        if target in wanters and wanters[target]["target"] == name:
            if name not in matched and target not in matched:
                pairs.append((name, target, req["reason"]))
                matched.add(name)
                matched.add(target)

    # Oncelik 2: tek tarafli istekler (A→B, B musait)
    for name, req in wanters.items():
        if name in matched:
            continue
        target = req["target"]
        if target not in matched:
            pairs.append((name, target, req["reason"]))
            matched.add(name)
            matched.add(target)

    return pairs


# ==================================================================
#  3. 1v1 KONUSMA
# ==================================================================

VISIT_WRAPPER = """Ozel gorusme. Karsinizda: {opponent_name} ({opponent_role}).
Gun {round_number}/{day_limit}.
{exiled_context}

BU GIZLI VE BIREBIR BIR GORUSMEDIR:
- Sadece karsinidaki kisiyle konusuyorsun.
- KESINLIKLE 'herkes sussun', 'sessizlik lutfen', 'sirayla konusalim' veya 'odadakiler dinlesin' gibi sanki kalabalik bir ortamdaymissin gibi davranan veya odayi yonetmeye calisan moderator cumleleri kurma.
- Sadece karsinidakine hitap et ve diyalogu surdur.

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
- Kendini tekrarlama.

ONCEKI TARTISMADAN BILGILER:
{campfire_summary}

KONUSMA:
{visit_history}

SENIN SON SOZLERIN (tekrarlama):
{own_last}

Simdi sen konus ({name}, {role_title}):"""


async def character_speak_1v1(
    player: Player,
    opponent: Player,
    exchanges: list[dict],
    state: GameState,
    campfire_summary: str,
) -> str:
    # Konusma gecmisi
    visit_lines = []
    for ex in exchanges:
        visit_lines.append(f"[{ex['speaker']}] ({ex['role_title']}): {ex['content']}")
    visit_history = "\n".join(visit_lines) if visit_lines else "(henuz konusmadin)"

    # Kendi son sozleri
    own_msgs = [ex["content"] for ex in exchanges if ex["speaker"] == player.name][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    # Surgun bilgisi
    game_log = state.get("messages", [])
    exiles = [m for m in game_log if isinstance(m, dict) and m.get("type") == "exile"]
    if exiles:
        exile_lines = [f"- Gun {e['round']}: {e['name']} ({e['role_title']}) surgun edildi" for e in exiles]
        exiled_context = "Onceki surgunler:\n" + "\n".join(exile_lines)
    else:
        exiled_context = "(Henuz kimse surgun edilmedi)"

    prompt = VISIT_WRAPPER.format(
        opponent_name=opponent.name,
        opponent_role=opponent.role_title,
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        exiled_context=exiled_context,
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


async def run_visit(
    visitor: Player,
    host: Player,
    reason: str,
    state: GameState,
    campfire_summary: str,
) -> dict:
    """Tek bir 1v1 gorusme. Alternating turns, max MAX_EXCHANGES."""
    print(f"\n  {'─' * 40}")
    print(f"  {visitor.name} ({visitor.role_title}) → {host.name} ({host.role_title})")
    print(f"  Sebep: {reason}")
    print(f"  {'─' * 40}")

    exchanges = []
    speakers = [visitor, host]  # alternating

    for turn in range(MAX_EXCHANGES):
        current = speakers[turn % 2]
        opponent = speakers[(turn + 1) % 2]

        print(f"  [{current.name}] dusunuyor...")
        message = await character_speak_1v1(current, opponent, exchanges, state, campfire_summary)

        # Moderator
        ok, mod_reason = await moderator_check(current.name, message)
        if not ok:
            print(f"  MODERATOR: {mod_reason}")
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


# ==================================================================
#  4. TUM ZIYARETLER
# ==================================================================

async def run_all_visits(state: GameState, campfire_summary: str | None = None) -> list[dict]:
    if campfire_summary is None:
        print(f"  Campfire ozeti uretiliyor...")
        campfire_summary = await load_campfire_summary()

    print(f"\n{'=' * 50}")
    print(f"  OZEL GORUSMELER — Istek toplaniyor...")
    print(f"{'=' * 50}")

    # 1. Istek topla
    requests = await collect_requests(state, campfire_summary)
    for r in requests:
        if r["wants"]:
            print(f"  {r['name']} → {r['target']}: {r['reason']}")
        else:
            print(f"  {r['name']}: PASS")

    # 2. Esle
    pairs = match_pairs(requests)
    if not pairs:
        print(f"\n  Kimse gorusmek istemedi.")
        return []

    print(f"\n  Eslesmeler ({len(pairs)} gorusme):")
    for v, h, reason in pairs:
        print(f"    {v} → {h}")

    # 3. Gorusmeleri calistir (concurrent)
    tasks = []
    for visitor_name, host_name, reason in pairs:
        visitor = find_player(state, visitor_name)
        host = find_player(state, host_name)
        if visitor and host:
            tasks.append(run_visit(visitor, host, reason, state, campfire_summary))

    visits = await asyncio.gather(*tasks)
    return list(visits)


# -- Main -----------------------------------------------------------

async def main():
    print("=" * 50)
    print("  AI vs Insan — 1v1 Gorusme Prototipi")
    print("=" * 50)

    print("\nKarakterler yukleniyor...")
    players = load_players()
    state = init_state(players)

    for p in players:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        print(f"  [{tag:6}] {p.name:12} — {p.role_title}")

    visits = await run_all_visits(state)

    # JSON kaydet
    log = {
        "visits": [v for v in visits if v],
        "summary": {
            "total_visits": len(visits),
            "total_exchanges": sum(len(v["exchanges"]) for v in visits if v),
        },
    }
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(log, f, ensure_ascii=False, indent=2)
    print(f"\n  Log → {OUTPUT_PATH}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    key = os.environ.get("FAL_KEY", "")
    if not key:
        print("HATA: FAL_KEY tanimli degil!")
        sys.exit(1)

    configure(key)
    asyncio.run(main())
