"""
world_gen.py — Seed'li Evren Uretim Sistemi
=============================================
Her mac icin deterministik world seed uretir.
Ayni game_id = ayni evren (replay yapilabilir).

Kullanim:
    uv run python src/prototypes/world_gen.py
    uv run python src/prototypes/world_gen.py --game-id test123
"""

import hashlib
import json
import random as random_module
from pydantic import BaseModel


# ── Pydantic Modeller ────────────────────────────────

class MythVariant(BaseModel):
    name: str
    rumor: str
    origin_story: str
    existential_question: str


class PlaceVariants(BaseModel):
    settlement_name: str
    forest_name: str
    outer_wastes_name: str


class Rituals(BaseModel):
    hand_raise_phrase: str
    oath_refresh_phrase: str
    exile_phrase: str


class MechanicSkin(BaseModel):
    campfire_turn_explanation: str
    house_visit_limit_explanation: str


class WorldSeed(BaseModel):
    world_seed: str
    game_id: str
    tone: str
    season: str
    ocak_rengi: str
    ocak_rengi_mood: str
    mask_source: str
    council_style: str
    myth_variant: MythVariant
    daily_omens: list[str]
    place_variants: PlaceVariants
    rituals: Rituals
    mechanic_skin: MechanicSkin
    taboo_words: list[str]


# ══════════════════════════════════════════════════════
#  SEED HAVUZLARI (World Bible'dan)
# ══════════════════════════════════════════════════════

# -- Ton --
TONES = [
    "karanlik_masalsi",
    "gotik_rituel",
    "sisli_efsane",
    "kuru_col_yemini",
]

# -- Mevsim --
SEASONS = [
    "kis_sonu",
    "sonbahar",
    "yagmur_mevsimi",
    "ilkbahar_baslangici",
]

# -- Ocak Rengi --
OCAK_COLORS = [
    {"id": "kehribar", "mood": "Sicak ve guven veren, ama aldatici — kul kokusu"},
    {"id": "soluk_mavi_titreme", "mood": "Soguk ve tedirgin, her an sonebilir — suphe ve urperti"},
    {"id": "kizil_kor", "mood": "Ofkeli ve sabirsiz, kavga cagiriyor — hizlanan kararlar"},
    {"id": "beyaz_kivilcim", "mood": "Saf ve keskin, gercegi ariyor — yargi hissi"},
]

# -- Maske Kaynagi --
MASK_SOURCES = [
    "kadim_muhur",
    "konsey_antlasmasi",
    "ocak_laneti",
]

# -- Konsey Stili --
COUNCIL_STYLES = [
    "sert_ama_adil",
    "sessiz_ve_korkulu",
    "paranoyak",
]

# -- Efsane / Soylenti Varyantlari --
MYTH_VARIANTS = [
    MythVariant(
        name="Mavi Titreme",
        rumor="Ocak bu ay mavi titriyor. Boyle olunca 'onlar' gelir derler.",
        origin_story="Buyuk Sessizlik'te sozler taslara gomuldu. Sesler ham izlerini kaybetti.",
        existential_question="Insani insan yapan bedel mi, hatira mi?",
    ),
    MythVariant(
        name="Kul Yazmasi",
        rumor="Kul, isimleri yazmaya basladi. Bazilari henuz olmemis isimleri.",
        origin_story="Konsey bir gunahi muhurledi, duman geri sizdi. O gunden beri kuller konusuyor.",
        existential_question="Dogru mu toplulugu yasatir, yoksa korku mu?",
    ),
    MythVariant(
        name="Can Izi",
        rumor="Her surgende can calar. Ama bazen can kendiligindan caliyor.",
        origin_story="Eski Bekci bir can dikti. 'Gercek olmayanlar cani duyamaz' dedi. Ama herkes duydugunu iddia etti.",
        existential_question="Affetmek mi zayiflik, yoksa insanlik mi?",
    ),
]

# -- Gunluk Alametler --
DAILY_OMENS = [
    "Kuzgunlar cemberin ustunde uc tur atti.",
    "Bir evin esiginde is yerine tuz bulundu.",
    "Ocak kulunde ince bir can izi cikti.",
    "Ruzgar bugün kelime taklit ediyor, dikkatli ol.",
    "Muhur kapisinda catlak gorundu.",
    "Bu sabah cesmenin suyu bulanik akti.",
    "Gece boyunca kopekler havladi. Hicbiri uyumadi.",
    "Sabah ciginde kan rengi izler bulundu.",
    "Meydandaki tas sutunun golgesi bugun ters tarafa dustu.",
    "Eski kuyu bu gece yanki yapti. Icine kim fisildadi?",
]

# -- Rituel Cumleleri --
HAND_RAISE_PHRASES = [
    "Ates isterim.",
    "Sozumu ocaga baglarim.",
    "Cemberden soz talep ederim.",
]

OATH_REFRESH_PHRASES = [
    "Kulum sozum, sozum kulum.",
    "Atesin yaninda dilim temiz.",
    "Yemin tazelenir: dis diyarlarin dili burada gecmez.",
]

EXILE_PHRASES = [
    "Cember disina adim at. Atesin seni artik tanimiyor.",
    "Konsey kararini verdi. Kapin muhurlendi.",
    "Atesin isigi senden cekildi. Yolun Sis-Disi'na.",
]

# -- Yer Isimleri Parcalari --
SETTLEMENT_PARTS = ["Kul", "Sis", "Bozkir", "Corak", "Demir", "Ocak", "Kara"]
SETTLEMENT_SUFFIXES = ["Ocagi", "Kalesi", "Yurdu", "Kapisi", "Siginagi", "Cemberi"]

FOREST_PARTS = ["Fisiltili", "Golge", "Diken", "Kurt", "Baykus", "Sogut-Kara"]
FOREST_SUFFIXES = ["Ormani", "Korulugu", "Gecidi", "Vadisi"]

WASTES_PARTS = ["Kara", "Tuz", "Kul", "Catlak", "Olu", "Sis"]
WASTES_SUFFIXES = ["Colu", "Ovasi", "Diyari", "Boslugu", "Disi"]

# -- Taboo Kelimeler --
TABOO_CORE = [
    "AI", "LLM", "model", "prompt", "sistem", "bot", "algoritma",
    "yapay", "zeka", "chatbot", "GPT", "neural", "token",
]
TABOO_REAL_WORLD = [
    "internet", "telefon", "bilgisayar", "ekran", "uygulama",
    "web", "sosyal medya", "google", "whatsapp",
]
TABOO_META = [
    "oyun", "round", "tur sayisi", "skor", "puan", "NPC", "quest",
]


# ══════════════════════════════════════════════════════
#  DETERMINISTIK SEED URETIMI
# ══════════════════════════════════════════════════════

SALT = "ocak_yemini_v1"


def _make_rng(game_id: str, salt: str = SALT) -> random_module.Random:
    """game_id'den deterministik lokal RNG olustur."""
    digest = hashlib.sha256(f"{game_id}:{salt}".encode()).hexdigest()
    seed_int = int(digest[:16], 16)
    return random_module.Random(seed_int)


def generate_world_seed(game_id: str) -> WorldSeed:
    """Verilen game_id icin tam bir WorldSeed uret. Deterministik."""
    rng = _make_rng(game_id)
    digest = hashlib.sha256(f"{game_id}:{SALT}".encode()).hexdigest()

    # Temel secimler
    tone = rng.choice(TONES)
    season = rng.choice(SEASONS)
    ocak = rng.choice(OCAK_COLORS)
    mask_source = rng.choice(MASK_SOURCES)
    council_style = rng.choice(COUNCIL_STYLES)
    myth = rng.choice(MYTH_VARIANTS)
    omens = rng.sample(DAILY_OMENS, k=rng.randint(2, 3))

    # Yer isimleri
    settlement = rng.choice(SETTLEMENT_PARTS) + " " + rng.choice(SETTLEMENT_SUFFIXES)
    forest = rng.choice(FOREST_PARTS) + " " + rng.choice(FOREST_SUFFIXES)
    wastes = rng.choice(WASTES_PARTS) + " " + rng.choice(WASTES_SUFFIXES)

    # Ritueller
    rituals = Rituals(
        hand_raise_phrase=rng.choice(HAND_RAISE_PHRASES),
        oath_refresh_phrase=rng.choice(OATH_REFRESH_PHRASES),
        exile_phrase=rng.choice(EXILE_PHRASES),
    )

    # Mekanik kaplamalari
    mechanic_skin = MechanicSkin(
        campfire_turn_explanation=(
            f"Ates Basi'nda sirayla konusulur. "
            f"Konusmak isteyen '{rituals.hand_raise_phrase}' der."
        ),
        house_visit_limit_explanation=(
            f"Konsey kurali: her gece en fazla 3 kapi calinir. "
            f"{settlement} siniri."
        ),
    )

    # Taboo listesi
    taboo = TABOO_CORE + TABOO_REAL_WORLD + TABOO_META

    return WorldSeed(
        world_seed=digest,
        game_id=game_id,
        tone=tone,
        season=season,
        ocak_rengi=ocak["id"],
        ocak_rengi_mood=ocak["mood"],
        mask_source=mask_source,
        council_style=council_style,
        myth_variant=myth,
        daily_omens=omens,
        place_variants=PlaceVariants(
            settlement_name=settlement,
            forest_name=forest,
            outer_wastes_name=wastes,
        ),
        rituals=rituals,
        mechanic_skin=mechanic_skin,
        taboo_words=taboo,
    )


# ══════════════════════════════════════════════════════
#  RENDER FONKSIYONLARI
# ══════════════════════════════════════════════════════

def render_world_brief(ws: WorldSeed) -> str:
    """Oyunculara gosterilecek 10-12 satirlik evren ozeti."""
    season_tr = ws.season.replace("_", " ").title()
    ocak_tr = ws.ocak_rengi.replace("_", " ")
    mask_tr = ws.mask_source.replace("_", " ")

    omens_block = "\n".join(f"  - {o}" for o in ws.daily_omens)

    return f"""{ws.place_variants.settlement_name} — Ocak Yemini
{'=' * 40}
Mevsim: {season_tr}
Ocak: {ocak_tr} renkte yaniyor — {ws.ocak_rengi_mood}
Ses Maskesi: {mask_tr}
Konsey: {ws.council_style.replace('_', ' ')}

Soylenti: "{ws.myth_variant.rumor}"

Gunun alametleri:
{omens_block}

Kurallar:
  - Konusmak icin: "{ws.rituals.hand_raise_phrase}"
  - Yemin: "{ws.rituals.oath_refresh_phrase}"
  - Surgun: "{ws.rituals.exile_phrase}"
"""


def render_scene_cards(ws: WorldSeed) -> dict[str, str]:
    """Her faz icin atmosfer karti. AI actor'lara verilecek."""
    ocak_tr = ws.ocak_rengi.replace("_", " ")
    return {
        "morning": (
            f"Yeni bir gun {ws.place_variants.settlement_name}'da. "
            f"{ws.daily_omens[0]} "
            f"Ocak {ocak_tr} renkte yaniyor."
        ),
        "campfire": (
            f"Ates Basi Cemberi'nde tartisma zamani. "
            f"{ws.ocak_rengi_mood}. "
            f"{ws.mechanic_skin.campfire_turn_explanation}"
        ),
        "house_visit": (
            f"{ws.place_variants.settlement_name} sokaklarinda sessizlik. "
            f"Evler Halkasi'nda kapı calinacak. "
            f"{ws.mechanic_skin.house_visit_limit_explanation}"
        ),
        "vote": (
            f"Konsey toplandi. Surgun zamani. "
            f"'{ws.rituals.exile_phrase}'"
        ),
    }


# ══════════════════════════════════════════════════════
#  STANDALONE CALISTIRMA
# ══════════════════════════════════════════════════════

def main():
    import argparse
    import uuid

    parser = argparse.ArgumentParser(description="Ocak Yemini — World Seed Generator")
    parser.add_argument("--game-id", default=None, help="Deterministik seed. Bos birakilirsa random UUID.")
    args = parser.parse_args()

    game_id = args.game_id or str(uuid.uuid4())

    print("=" * 50)
    print("  Ocak Yemini — World Seed Generator")
    print(f"  Game ID: {game_id}")
    print("=" * 50)

    # Uret
    ws = generate_world_seed(game_id)

    # World Brief
    print(f"\n{'─' * 50}")
    print("  WORLD BRIEF (oyunculara gosterilecek)")
    print(f"{'─' * 50}\n")
    print(render_world_brief(ws))

    # Scene Cards
    print(f"\n{'─' * 50}")
    print("  SCENE CARDS (AI actor'lara verilecek)")
    print(f"{'─' * 50}\n")
    cards = render_scene_cards(ws)
    for phase, card in cards.items():
        print(f"  [{phase.upper():12}] {card}")

    # Full WorldSeed JSON
    print(f"\n{'─' * 50}")
    print("  FULL WORLD SEED (JSON)")
    print(f"{'─' * 50}\n")
    print(json.dumps(ws.model_dump(), ensure_ascii=False, indent=2))

    # Determinism check
    print(f"\n{'─' * 50}")
    print("  DETERMINISM CHECK")
    print(f"{'─' * 50}")
    ws2 = generate_world_seed(game_id)
    if ws == ws2:
        print(f"  Ayni game_id ({game_id}) → AYNI WorldSeed")
    else:
        print(f"  HATA: Ayni game_id farkli sonuc uretti!")

    # Farkli seed check
    ws3 = generate_world_seed(game_id + "_farkli")
    if ws != ws3:
        print(f"  Farkli game_id → FARKLI WorldSeed")
    else:
        print(f"  UYARI: Farkli game_id ayni sonuc uretti (cok dusuk ihtimal)")


if __name__ == "__main__":
    main()
