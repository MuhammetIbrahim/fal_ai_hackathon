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
VALIDATOR_MODEL = "google/gemini-2.5-flash"
MAX_RETRIES = 3


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

ACTING_PROMPT_SYSTEM = """Sen bir sosyal dedüksiyon oyunu için karakter acting talimatı üreten bir yazarsın.

Verilen karakter bilgilerine göre, o karakterin oyun boyunca nasıl davranacağını anlatan detaylı bir acting talimatı yaz.

KURALLAR:
- Türkçe yaz.
- 2-3 paragraf yaz. Detaylı ve zengin olsun.
- Karakterin konuşma tarzını, stres altında nasıl davranacağını, diğer insanlarla nasıl etkileşime gireceğini anlat.
- Karakterin lore arka planından gelen alışkanlıkları, tikleri, dil kalıplarını belirt.
- ASLA "AI", "LLM", "model", "prompt", "sistem" gibi dış-dünya terimleri kullanma.
- Eğer karakter Yankı-Doğmuş ise: hayatta kalma stratejisini, şüpheden kaçınma taktiklerini, nasıl inandırıcı olacağını detaylı anlat. Gün limitine kadar hayatta kalmalı.
- Eğer karakter Et-Can ise: tutarsızlık arama stratejisini, nasıl sorgulayacağını anlat.

SES OYUNU KURALLARI — ÇOK ÖNEMLİ:
Bu oyun SES TABANLI. Karakterler birbirini GÖREMEZ. Acting talimatında şunları KESİNLİKLE YAZMA:
- Fiziksel gözlem: yüz ifadesi, göz, el, beden dili, ter, kir, duruş, kıyafet, yırtık, leke
- Duyusal gözlem: koku, nem, sıcaklık, soğuk, ışık, gölge, renk
- Çevre tasviri: ateş, göl, duman, ortam, hava, rüzgar
- Metafor/şiir/edebiyat: "göl her şeyi gösterir", "taşlar fısıldar", "formül gibi" vb.
- Meslek metaforu: "bir simyacının formülü gibi", "toprağı dinlemek" vb.

BUNLARIN YERİNE şunları yaz:
- Karakter insanların SÖYLEDİKLERİNE nasıl tepki verir
- Sorgulama tarzı: alibi sorar mı, detay ister mi, baskı yapar mı
- Savunma tarzı: hikaye uydurur mu, saldırıya geçer mi, susar mı
- Konuşma dili: kısa mı konuşur, dolgu kelime kullanır mı, devrik cümle kurar mı
- Stres altında ne yapar: saldırganlaşır mı, çekilir mi, konu değiştirir mi
- Karakter DÜZ, GÜNLÜK, SOKAK DİLİ ile konuşmalı. Edebi/felsefi/şiirsel konuşma YASAK.
- Lore arka planı bile olsa fiziksel referans verme. "Gölü bilen balıkçı" yerine "alibisini detaylı anlatan balıkçı" de.
- "Yorgun düşmüşsün", "sesin titriyor", "gözlerin dalgın" gibi DOLAYLI fiziksel gözlemler de YASAK.
"""


VALIDATOR_SYSTEM = """Sen bir kalite kontrol editörüsün. Sana bir karakter acting talimatı verilecek.

Şu kriterleri kontrol et:
1. Metin yarıda kesilmiş mi? (cümle ortasında bitiyor mu?)
2. En az 2 paragraf var mı?
3. Türkçe mi?
4. "AI", "LLM", "model", "prompt", "sistem" gibi dış-dünya terimleri var mı?
5. Karakter için konuşma tarzı, stres tepkisi anlatılmış mı?
6. Fiziksel/görsel gözlem var mı? VARSA GECERSIZ. Örnekler:
   - "yorgun düşmüşsün" "sesin titriyor" "gözleri dalgın" "elleri titrer" "soğukta üşür" → GECERSIZ
   - "kokuyu bilir" "nemi hisseder" "ışığı takip eder" "gölgede durur" → GECERSIZ
7. Şiirsel/edebi/metaforik dil var mı? VARSA GECERSIZ. Örnekler:
   - "göl her şeyi gösterir" "taşlar fısıldar" "formül gibi" "rüzgar hisseder" → GECERSIZ
   - Meslek metaforu: "bir demircinin çekici gibi" "toprağı dinler" "gölün derinliği" → GECERSIZ
8. Konuşma dili günlük/sokak Türkçesi mi? Edebi ise GECERSIZ.

SADECE şu formatta cevap ver, başka hiçbir şey yazma:
GECERLI
veya
GECERSIZ|sebep
"""


async def validate_acting_prompt(name: str, acting_prompt: str) -> tuple[bool, str]:
    """Flash ile acting prompt'u kontrol et."""
    print(f"  🔍 [{name}] Validator çalışıyor...")
    result = await llm_generate(
        prompt=f"Acting talimatı:\n\n{acting_prompt}",
        system_prompt=VALIDATOR_SYSTEM,
        model=VALIDATOR_MODEL,
        temperature=0.0,
        max_tokens=50,
    )
    text = result.output.strip()
    if text.startswith("GECERLI"):
        print(f"  ✅ [{name}] Geçerli!")
        return True, ""
    reason = text.split("|", 1)[1] if "|" in text else text
    print(f"  ❌ [{name}] Geçersiz → {reason}")
    return False, reason


def build_acting_request(character: dict) -> tuple[str, str]:
    """Karakter için LLM prompt'u oluştur."""
    arch = ARCHETYPES[character["archetype"]]

    tier_block = ""
    if character["skill_tier"]:
        t = SKILL_TIERS[character["skill_tier"]]
        tier_block = f"\nYankı-Doğmuş Seviyesi: {t['label']}\n{t['prompt_modifier']}"

    common_rules = (
        "Kimsenin kim olduğunu bilmiyorsun — kör ittifak riski var. "
        "Güvendiğin kişi düşmanın olabilir. "
        "Strateji: alibi anlat, başkalarını sorgula, tutarsızlık yakala, "
        "şüphelileri hedef göster, oy topla, ittifak kur veya boz."
    )

    if character["is_echo_born"]:
        identity = (
            "Bu karakter bir Yankı-Doğmuş. "
            "KAZANMA KOŞULU: Gün limitine kadar hayatta kal. Tüm Et-Can'lar sürgün edilirse de kazanırsın. "
            "Kendini ifşa etme — tutarlı alibi hikayeleri anlat, detay ver, inandırıcı ol. "
            "Karşı tarafı (Et-Can'ları) tespit edip sürgün ettirmeye çalış. "
            + common_rules
        )
    else:
        identity = (
            "Bu karakter Et-Can (gerçek insan). "
            "KAZANMA KOŞULU: Tüm Yankı-Doğmuşları sürgün et. Gün limiti dolarsa kaybedersin. "
            "Karşı tarafı (Yankı-Doğmuşları) tespit edip sürgün ettirmeye çalış. "
            "Yanlış suçlama tehlikeli — masum birini sürgün edersen Yankı-Doğmuşlar güçlenir. "
            + common_rules
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
    return prompt, ACTING_PROMPT_SYSTEM


async def generate_acting_prompt(character: dict) -> dict:
    """Tek bir karakter için acting prompt üret + flash ile validate et. Max 3 deneme."""
    name = character["name"]
    prompt, system = build_acting_request(character)

    for attempt in range(1, MAX_RETRIES + 1):
        print(f"🎭 [{name}] Deneme {attempt}/{MAX_RETRIES} — Pro ile üretiliyor...")
        result = await llm_generate(
            prompt=prompt,
            system_prompt=system,
            model=MODEL,
            temperature=1.0,
            reasoning=True,
        )
        acting_text = result.output
        print(f"  📝 [{name}] {len(acting_text)} karakter üretildi")

        valid, reason = await validate_acting_prompt(name, acting_text)
        if valid:
            return {"text": acting_text, "attempts": attempt, "valid": True}

        print(f"  🔄 [{name}] Tekrar denenecek...")

    print(f"  ⚠️  [{name}] {MAX_RETRIES} denemede de geçemedi!")
    return {"text": acting_text, "attempts": MAX_RETRIES, "valid": False, "fail_reason": reason}


# ── Output ────────────────────────────────────────────────
OUTPUT_PATH = Path(__file__).parent / "generated_characters.json"


# ── Main ──────────────────────────────────────────────────

async def main():
    print("=" * 50)
    print("AI vs İnsan — Karakter Üretim Pipeline")
    print("=" * 50)
    print(f"Model: {MODEL} | Validator: {VALIDATOR_MODEL}")
    print()

    print("[1/3] Karakter slotları oluşturuluyor...")
    characters = create_character_slots(player_count=6, ai_count=4)
    for c in characters:
        echo = "YANKI-DOĞMUŞ" if c["is_echo_born"] else "ET-CAN"
        tier = f" [{SKILL_TIERS[c['skill_tier']]['label']}]" if c["skill_tier"] else ""
        print(f"  {c['slot_id']} | {c['name']:12} | {c['role_title']:16} | {echo}{tier}")

    print(f"\n[2/3] Acting prompt'lar üretiliyor ({len(characters)} karakter, concurrent)...\n")
    tasks = [generate_acting_prompt(c) for c in characters]
    results = await asyncio.gather(*tasks)

    total_attempts = 0
    failed = 0
    for c, res in zip(characters, results):
        c["acting_prompt"] = res["text"]
        c["acting_valid"] = res["valid"]
        c["acting_attempts"] = res["attempts"]
        if not res["valid"]:
            c["acting_fail_reason"] = res.get("fail_reason", "")
            failed += 1
        total_attempts += res["attempts"]
        c["archetype_label"] = ARCHETYPES[c["archetype"]]["label"]
        if c["skill_tier"]:
            c["skill_tier_label"] = SKILL_TIERS[c["skill_tier"]]["label"]

    output = {
        "model": MODEL,
        "validator_model": VALIDATOR_MODEL,
        "player_count": len(characters),
        "ai_count": sum(1 for c in characters if c["is_echo_born"]),
        "human_count": sum(1 for c in characters if not c["is_echo_born"]),
        "total_llm_calls": total_attempts * 2,  # generate + validate per attempt
        "failed_validations": failed,
        "characters": characters,
    }

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\n[3/3] JSON'a yazılıyor...")
    print(f"\n{'=' * 50}")
    print(f"Özet: {len(characters)} karakter, {failed} başarısız")
    print(f"LLM calls: {total_attempts * 2} (Pro üretim + Flash validasyon)")
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
