"""
generate_characters.py — Karakter üretim prototipi
===================================================
data.json'dan rastgele karakter seç, LLM ile acting prompt üret.
Sadece karakter init pipeline'ını test eder.

Kullanım:
    uv run python src/prototypes/generate_characters.py
"""

import asyncio
import json
import random
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from fal_services import llm_generate, configure

# ── Data ──────────────────────────────────────────────────
DATA_PATH = Path(__file__).parent / "data.json"
with open(DATA_PATH) as f:
    DATA = json.load(f)

ARCHETYPES = DATA["archetypes"]
ROLE_TITLES = DATA["role_titles"]
SKILL_TIERS = DATA["skill_tiers"]
NAMES_POOL = DATA["names_pool"]

MODEL = "google/gemini-2.5-pro"


# ── Karakter Oluşturma ────────────────────────────────────

def create_character_slots(player_count: int = 6, ai_count: int = 4) -> list[dict]:
    """Rastgele karakter slotları oluştur."""
    names = random.sample(NAMES_POOL, player_count)
    roles = random.sample(ROLE_TITLES, player_count)
    archetype_keys = list(ARCHETYPES.keys())
    tier_keys = list(SKILL_TIERS.keys())

    characters = []

    # İnsan oyuncu
    characters.append({
        "slot_id": "P0",
        "name": names[0],
        "role_title": roles[0]["title"],
        "lore": roles[0]["lore"],
        "archetype": random.choice(archetype_keys),
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
            "archetype": random.choice(archetype_keys),
            "is_echo_born": is_ai,
            "skill_tier": random.choice(tier_keys) if is_ai else None,
        })

    random.shuffle(characters)
    return characters


# ── Acting Prompt Üretimi ─────────────────────────────────

ACTING_PROMPT_SYSTEM = """Sen bir fantastik roleplay oyunu için karakter acting talimatı üreten bir yazarsın.

Verilen karakter bilgilerine göre, o karakterin oyun boyunca nasıl davranacağını anlatan detaylı bir acting talimatı yaz.

KURALLAR:
- Türkçe yaz.
- 2-3 paragraf yaz. Detaylı ve zengin olsun.
- Karakterin konuşma tarzını, duygusal tepkilerini, stres altında nasıl davranacağını, diğer insanlarla nasıl etkileşime gireceğini anlat.
- Karakterin lore arka planından gelen alışkanlıkları, tikleri, dil kalıplarını belirt.
- ASLA "AI", "LLM", "model", "prompt", "sistem" gibi dış-dünya terimleri kullanma.
- Evren içi kal: bu Ocak'ın etrafındaki izole yerleşimde geçen bir sosyal dedüksiyon oyunu.
- Eğer karakter Yankı-Doğmuş ise: hayatta kalma stratejisini, şüpheden kaçınma taktiklerini, nasıl inandırıcı olacağını detaylı anlat. Kazanma motivasyonunu ver — gün limitine kadar hayatta kalmalı.
- Eğer karakter Et-Can ise: gözlem yapma motivasyonunu, tutarsızlık arama stratejisini, nasıl sorgulayacağını anlat.
- Varoluşsal temayı hissettir: "Gerçek olmayı belirleyen nedir? Hafıza mı, tutarlılık mı, empati mi?"
"""


async def generate_acting_prompt(character: dict) -> str:
    """Tek bir karakter için acting prompt üret."""
    arch = ARCHETYPES[character["archetype"]]

    tier_block = ""
    if character["skill_tier"]:
        t = SKILL_TIERS[character["skill_tier"]]
        tier_block = f"\nYankı-Doğmuş Seviyesi: {t['label']}\n{t['prompt_modifier']}"

    if character["is_echo_born"]:
        identity = (
            "Bu karakter bir Yankı-Doğmuş. Amacı gün sonuna kadar hayatta kalmak. "
            "Kendini ifşa etmemeli, şüpheyi başkalarına yönlendirmeli, "
            "tutarlı bir hikâye anlatmalı. Ama kör ittifak riski var — "
            "ittifak kurduğu kişinin ne olduğunu bilmiyor."
        )
    else:
        identity = (
            "Bu karakter Et-Can (gerçek insan). Amacı Yankı-Doğmuşları bulmak. "
            "Davranışları gözlemlemeli, tutarsızlıkları yakalamalı, "
            "sorularla test etmeli. Ama yanlış suçlama da tehlikeli — "
            "masum birini sürgün ederse Yankı-Doğmuşlar güçlenir."
        )

    prompt = (
        f"KARAKTERİN:\n"
        f"İsim: {character['name']}\n"
        f"Ünvan: {character['role_title']}\n\n"
        f"LORE ARKA PLAN:\n{character['lore']}\n\n"
        f"ARKETİP: {arch['label']}\n{arch['description']}\n"
        f"Konuşma Tarzı: {arch['speech_style']}\n\n"
        f"KİMLİK:\n{identity}\n"
        f"{tier_block}\n\n"
        f"Bu karakter için detaylı bir acting talimatı yaz (2-3 paragraf):"
    )

    result = await llm_generate(
        prompt=prompt,
        system_prompt=ACTING_PROMPT_SYSTEM,
        model=MODEL,
        temperature=1.0,
        max_tokens=500,
        reasoning=True,
    )
    return result.output


# ── Output ────────────────────────────────────────────────
OUTPUT_PATH = Path(__file__).parent / "generated_characters.json"


# ── Main ──────────────────────────────────────────────────

async def main():
    characters = create_character_slots(player_count=6, ai_count=4)

    tasks = [generate_acting_prompt(c) for c in characters]
    prompts = await asyncio.gather(*tasks)

    for c, acting_prompt in zip(characters, prompts):
        c["acting_prompt"] = acting_prompt
        c["archetype_label"] = ARCHETYPES[c["archetype"]]["label"]
        if c["skill_tier"]:
            c["skill_tier_label"] = SKILL_TIERS[c["skill_tier"]]["label"]

    output = {
        "model": MODEL,
        "player_count": len(characters),
        "ai_count": sum(1 for c in characters if c["is_echo_born"]),
        "human_count": sum(1 for c in characters if not c["is_echo_born"]),
        "characters": characters,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"Done → {OUTPUT_PATH}")


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    key = os.environ.get("FAL_KEY", "")
    if not key:
        print("HATA: FAL_KEY tanımlı değil!")
        sys.exit(1)

    configure(key)
    asyncio.run(main())
