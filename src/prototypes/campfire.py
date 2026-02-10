"""
campfire.py — Tam Oyun Prototipi
=================================
Tartisma → Oylama → Surgun → Kazanan Kontrol.
Gun limitine veya tum yanki-dogmus elenene kadar tekrar.

Kullanim:
    uv run python src/prototypes/campfire.py
"""

import asyncio
import json
import os
import random
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fal_services import llm_generate, configure
from game_state import (
    Player, PlayerType, Phase, GameState,
    get_alive_players, get_alive_names, find_player,
    check_win_condition, count_by_type,
)

# -- Config -------------------------------------------------------

MODEL = "google/gemini-2.5-flash"
CHARS_PATH = Path(__file__).parent / "generated_characters.json"
MAX_CAMPFIRE_TURNS = 18
OUTPUT_PATH = Path(__file__).parent / "game_log.json"


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

    for p in players:
        p.is_human = False

    return players


def init_state(players: list[Player]) -> GameState:
    return GameState(
        messages=[],
        players=players,
        phase=Phase.CAMPFIRE.value,
        round_number=1,
        day_limit=5,
        current_speaker=None,
        campfire_history=[],
        house_visits=[],
        exiled_today=None,
        winner=None,
    )


# -- Utility -------------------------------------------------------

def format_campfire_history(state: GameState, last_n: int | None = None) -> str:
    speeches = [m for m in state["campfire_history"] if m["type"] in ("speech", "moderator")]
    if last_n:
        speeches = speeches[-last_n:]
    lines = []
    for msg in speeches:
        if msg["type"] == "speech":
            lines.append(f"[{msg['name']}] ({msg['role_title']}): {msg['content']}")
        elif msg["type"] == "moderator":
            lines.append(f"[Ocak Bekcisi]: {msg['content']}")
    return "\n".join(lines)


# -- Tepki (Reaction) ---------------------------------------------

REACTION_SYSTEM = """Sen {name} ({role_title}) adli bir karaktersin. Tartisma fazindasin.

Az once birisi konustu. Bu konusmaya tepki vermek istiyor musun?

- Soylecek bir seyin varsa (cevap, suclama, savunma, soru, yorum):
WANT|<neden konusmak istiyorsun — 1 kisa cumle>

- Su an soylecek bir seyin yoksa:
PASS

SADECE bu formatta cevap ver. Baska hicbir sey yazma.
Karakter olarak dusun — her mesaja tepki vermek zorunda degilsin."""


async def get_reaction(player: Player, last_speech: dict, state: GameState) -> dict:
    history_text = format_campfire_history(state, last_n=6)
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


async def broadcast_and_collect(state: GameState, last_speech: dict) -> list[dict]:
    alive = get_alive_players(state)
    others = [p for p in alive if p.name != last_speech["name"]]
    tasks = [get_reaction(p, last_speech, state) for p in others]
    reactions = await asyncio.gather(*tasks)
    return list(reactions)


# -- Orchestrator --------------------------------------------------

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


async def orchestrator_pick(state: GameState, reactions: list[dict]) -> tuple[str, str]:
    wanters = [r for r in reactions if r["wants"]]
    if not wanters:
        return "END", ""

    reactions_text = "\n".join(
        f"- {r['name']}: {'WANT — ' + r['reason'] if r['wants'] else 'PASS'}"
        for r in reactions
    )
    history_text = format_campfire_history(state, last_n=4)
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


# -- Karakter Konusmasi -------------------------------------------

CHARACTER_WRAPPER = """Tartisma fazindasin. Gun {round_number}/{day_limit}.
Hayattaki kisiler: {alive_names}
{exiled_context}
Soz hakki sana geldi.

BU BIR SES OYUNU — YASAKLAR:
- Fiziksel ortam YOK. Kimseyi goremez, dokunamaz, koklayamazsin.
- ASLA fiziksel/gorsel gozlem yapma. Su kelimeleri KULLANMA: yuz, goz, el, ter, kir, koku, nem, rutubet, sicaklik, soguk, ates, gol, duman, golge, isik, renk, kiyafet, yirtik, leke, kan, durus, oturma, bakmak, gormek.
- ASLA metafor/siir/edebiyat yapma. "Gol her seyi gosterir", "taslar fisildar", "atesin sokmesi" gibi seyler YASAK.
- ASLA meslek metaforu yapma. "Bir simyacinin formulu gibi", "topragi dinlemek" gibi seyler YASAK.
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

DİL — COK ONEMLI:
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


async def character_speak(player: Player, state: GameState) -> str:
    history_text = format_campfire_history(state, last_n=8)
    alive_names = ", ".join(get_alive_names(state))

    own_msgs = [
        m["content"] for m in state["campfire_history"]
        if m["type"] == "speech" and m["name"] == player.name
    ][-2:]
    own_last = "\n".join(own_msgs) if own_msgs else "(henuz konusmadin)"

    # Surgun bilgisi (role_title dahil — hafiza hatasi onleme)
    game_log = state.get("messages", [])
    exiles = [m for m in game_log if isinstance(m, dict) and m.get("type") == "exile"]
    if exiles:
        exile_lines = [f"- Gun {e['round']}: {e['name']} ({e['role_title']}) surgun edildi" for e in exiles]
        exiled_context = "Onceki surgunler:\n" + "\n".join(exile_lines)
    else:
        exiled_context = "(Henuz kimse surgun edilmedi)"

    prompt = CHARACTER_WRAPPER.format(
        round_number=state.get("round_number", 1),
        day_limit=state.get("day_limit", 5),
        alive_names=alive_names,
        exiled_context=exiled_context,
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


# -- Moderator -----------------------------------------------------

MODERATOR_SYSTEM = """Sen Ocak Bekcisi'sin. Konusmalari sessizce izliyorsun.

Kural ihlali var mi kontrol et:
1. Dis-dunya terimleri (AI, LLM, model, prompt, sistem, oyun, bot, algoritma)
2. Gercek hayat referanslari (internet, telefon, bilgisayar vb.)
3. Dogrudan kimlik iddiasi ("ben gercek insanim", "ben Yanki-Dogmusum", "sen bir AI'sin")

ONEMLI: Evren ici fantastik terimler (Yanki-Dogmus, Et-Can, Ocak, Bekci vb.) kural ihlali DEGILDIR.
Karakter birini suclamasi, soru sormasi, tartismasi normaldir.
Sadece GERCEKTEN dis-dunya terimi kullanilirsa mudahale et.

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
#  TARTISMA FAZI (CAMPFIRE)
# ==================================================================

async def run_campfire(state: GameState) -> GameState:
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)

    print(f"\n{'=' * 50}")
    print(f"  TARTISMA — Gun {round_n}")
    print(f"{'=' * 50}")
    for p in alive:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        print(f"  [{tag}] {p.name} — {p.role_title}")
    print()

    # Campfire history'yi temizle (her round icin yeni)
    state["campfire_history"] = []

    # Ilk konusmaci
    first = random.choice(alive)
    print(f"  [{first.name}] dusunuyor...")
    message = await character_speak(first, state)

    ok, reason = await moderator_check(first.name, message)
    if not ok:
        print(f"  MODERATOR: {reason}")
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

        print(f"\n  Broadcast — tepkiler toplanıyor...")
        reactions = await broadcast_and_collect(state, last_speech)

        for r in reactions:
            status = f"WANT — {r['reason']}" if r["wants"] else "pas"
            print(f"    {r['name']}: {status}")

        action, name = await orchestrator_pick(state, reactions)
        if action == "END":
            print(f"\n  Tartisma sona erdi.")
            break

        player = find_player(state, name)
        if not player or not player.alive:
            continue

        print(f"  [{player.name}] dusunuyor...")
        message = await character_speak(player, state)

        ok, reason = await moderator_check(name, message)
        if not ok:
            print(f"  MODERATOR: {reason}")
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


# ==================================================================
#  OYLAMA FAZI
# ==================================================================

VOTE_SYSTEM = """Sen {name} ({role_title}) adli bir karaktersin. Oylama zamani.

Tartisma sirasinda su konusmalar gecti:
{history}

Hayattaki kisiler: {alive_names}

Simdi birini surgun etmek icin oy vermelisin.
Tartismada en suphe ceken, en tutarsiz, en guvensiz kisi kimdi?
Kendi gozlemlerine ve tartismaya dayanarak karar ver.

SADECE bir isim yaz, baska hicbir sey yazma:
<isim>"""


async def player_vote(player: Player, state: GameState) -> str:
    history_text = format_campfire_history(state, last_n=12)
    alive_names = get_alive_names(state)
    others = [n for n in alive_names if n != player.name]

    result = await llm_generate(
        prompt=VOTE_SYSTEM.format(
            name=player.name,
            role_title=player.role_title,
            history=history_text,
            alive_names=", ".join(others),
        ),
        system_prompt=player.acting_prompt,
        model=MODEL,
        temperature=0.5,
    )

    vote = result.output.strip().split("\n")[0].strip()
    # Validate — secilen isim hayatta mi?
    if vote not in others:
        # Fuzzy match dene
        for n in others:
            if n.lower() in vote.lower():
                vote = n
                break
        else:
            vote = random.choice(others)

    return vote


async def run_vote(state: GameState) -> str | None:
    """Oylama yap, en cok oy alani surgun et. Beraberlikte kimse surgun edilmez."""
    round_n = state.get("round_number", 1)
    alive = get_alive_players(state)

    print(f"\n{'=' * 50}")
    print(f"  OYLAMA — Gun {round_n}")
    print(f"{'=' * 50}")

    # Concurrent oylama
    tasks = [player_vote(p, state) for p in alive]
    votes = await asyncio.gather(*tasks)

    vote_map = {}
    for player, vote in zip(alive, votes):
        player.vote_target = vote
        vote_map[player.name] = vote
        print(f"  {player.name} -> {vote}")

    # Sayim
    tally = Counter(votes)
    print(f"\n  Oy dagilimi: {dict(tally)}")

    top_vote, top_count = tally.most_common(1)[0]

    # Beraberlik kontrolu
    tied = [name for name, count in tally.items() if count == top_count]
    if len(tied) > 1:
        print(f"  BERABERLIK! {', '.join(tied)} — kimse surgun edilmedi.")
        return None

    print(f"\n  SURGUN: {top_vote} ({top_count} oyla surgun edildi!)")
    return top_vote


# ==================================================================
#  SURGUN
# ==================================================================

def exile_player(state: GameState, name: str) -> Player | None:
    player = find_player(state, name)
    if player:
        player.alive = False
        state["exiled_today"] = name

        # Surgun logunu messages'a ekle (roundlar arasi hafiza)
        state["messages"].append({
            "type": "exile",
            "round": state.get("round_number", 1),
            "name": name,
            "role_title": player.role_title,
            "was_echo_born": player.is_echo_born,
        })

        tag = "YANKI-DOGMUS" if player.is_echo_born else "ET-CAN"
        print(f"  {name} ({player.role_title}) surgun edildi! Gercek kimlik: [{tag}]")

    return player


# ==================================================================
#  TAM OYUN DONGUSU
# ==================================================================

async def run_full_game(state: GameState) -> GameState:
    game_log = {
        "rounds": [],
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

    day_limit = state.get("day_limit", 5)

    while True:
        round_n = state.get("round_number", 1)

        print(f"\n{'#' * 50}")
        print(f"  GUN {round_n} / {day_limit}")
        et, yanki = count_by_type(state)
        print(f"  Hayatta: {et} Et-Can, {yanki} Yanki-Dogmus")
        print(f"{'#' * 50}")

        # 1. Tartisma
        state = await run_campfire(state)

        round_data = {
            "round": round_n,
            "campfire_history": list(state["campfire_history"]),
            "votes": {},
            "exiled": None,
            "exiled_type": None,
        }

        # 2. Oylama
        exiled_name = await run_vote(state)

        if exiled_name:
            player = exile_player(state, exiled_name)
            round_data["exiled"] = exiled_name
            round_data["exiled_type"] = player.player_type.value if player else None

            # Oy bilgilerini kaydet
            for p in state["players"]:
                if p.vote_target:
                    round_data["votes"][p.name] = p.vote_target
        else:
            print(f"  Kimse surgun edilmedi.")

        game_log["rounds"].append(round_data)

        # 3. Kazanan kontrol
        winner = check_win_condition(state)
        if winner:
            state["winner"] = winner
            break

        # 4. Sonraki gune gec
        state["round_number"] = round_n + 1
        state["exiled_today"] = None

        # Vote target'lari temizle
        for p in state["players"]:
            p.vote_target = None

    # Oyun bitti
    et, yanki = count_by_type(state)
    winner = state["winner"]

    print(f"\n{'*' * 50}")
    print(f"  OYUN BITTI!")
    if winner == "et_can":
        print(f"  ET-CANLAR KAZANDI! Tum Yanki-Dogmuslar surgun edildi.")
    else:
        print(f"  YANKI-DOGMUSLAR KAZANDI! Gun limiti doldu, {yanki} Yanki-Dogmus hayatta.")
    print(f"{'*' * 50}")

    # Final skor tablosu
    print(f"\n  SKOR TABLOSU:")
    for p in state["players"]:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        status = "HAYATTA" if p.alive else "SURGUN"
        print(f"  [{tag:6}] {p.name:12} — {p.role_title:16} — {status}")

    game_log["winner"] = winner
    game_log["total_rounds"] = state.get("round_number", 1)
    game_log["final_alive"] = [
        {"name": p.name, "type": p.player_type.value}
        for p in get_alive_players(state)
    ]

    # JSON kaydet
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(game_log, f, ensure_ascii=False, indent=2)
    print(f"\n  Game log -> {OUTPUT_PATH}")

    return state


# -- Main -----------------------------------------------------------

async def main():
    print("=" * 50)
    print("  AI vs Insan — Tam Oyun Prototipi")
    print("=" * 50)

    print("\nKarakterler yukleniyor...")
    players = load_players()
    state = init_state(players)

    et, yanki = count_by_type(state)
    print(f"  {len(players)} oyuncu: {et} Et-Can, {yanki} Yanki-Dogmus")
    print(f"  Gun limiti: {state['day_limit']}")

    for p in players:
        tag = "YANKI" if p.is_echo_born else "ET-CAN"
        print(f"  [{tag:6}] {p.name:12} — {p.role_title}")
    print()

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
