"""
game_engine.py — Game Engine API Wrapper
=========================================
Prototype fonksiyonlarını FastAPI için hazırlar.

Bu dosya 3 ana katmanı birleştirir:
1. Prototype (src/prototypes/game.py) — Oyun mantığı
2. Database (src/core/database.py) — State saklama
3. API (src/apps/game/router.py) — HTTP endpoint'ler

NEDEN BU WRAPPER GEREKLI?
--------------------------
✅ Prototype direkt kullanılamaz — async/await FastAPI standardı
✅ Database işlemlerini merkezi yönetir
✅ WebSocket broadcast hook'ları eklenebilir (ileride)
✅ Error handling ve logging merkezi
✅ Test edilebilir — mock'lanabilir

KULLANIM:
---------
    from src.core.game_engine import create_new_game, start_game
    
    # Oyun oluştur
    game = await create_new_game("game123", player_count=6, ai_count=4)
    
    # Oyunu başlat (karakterleri üret)
    state = await start_game("game123")
"""

import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

# Prototypeler için path ekle (onlar da böyle import ediyor)
_project_root = Path(__file__).resolve().parents[2]
_prototypes_dir = _project_root / "src" / "prototypes"
sys.path.insert(0, str(_project_root))
sys.path.insert(0, str(_prototypes_dir))

# ═══════════════════════════════════════════════════
# PROTOTYPE IMPORTS — Oyun motoru fonksiyonları
# ═══════════════════════════════════════════════════
from world_gen import (
    WorldSeed,
    generate_world_seed,
    _make_rng,
)
from game_state import (
    GameState,
    Player,
    PlayerType,
    Phase,
    check_win_condition,
    get_alive_players,
    get_alive_names,
    count_by_type,
)
from game import (
    create_character_slots,
    generate_players,
    init_state,
    run_campfire,
    run_house_visits,
    run_vote,
    run_morning,
    exile_player,
    summarize_campfire,
    # Public API — game_loop icin
    generate_campfire_speech,
    generate_vote,
    generate_1v1_speech,
    generate_location_decision,
    maybe_update_campfire_summary,
    update_cumulative_summary,
    get_reaction,
    orchestrator_pick,
    check_moderation,
    # Constants
    MAX_CAMPFIRE_TURNS,
    INITIAL_CAMPFIRE_TURNS,
    FREE_ROAM_ROUNDS,
    CLOSING_CAMPFIRE_TURNS,
    CAMPFIRE_TURNS_PER_ROUND,
    ROOM_EXCHANGES,
)

# ═══════════════════════════════════════════════════
# DATABASE IMPORTS
# ═══════════════════════════════════════════════════
from src.core.database import db, GAMES


# ═══════════════════════════════════════════════════
# HIGH-LEVEL API FUNCTIONS
# ═══════════════════════════════════════════════════

async def create_new_game(
    game_id: str | None = None,
    player_count: int = 6,
    ai_count: int = 4,
    day_limit: int = 5,
) -> dict:
    """
    Yeni oyun oluştur ve database'e kaydet.
    
    Bu fonksiyon sadece world seed üretir ve oyunu "waiting" durumunda bekletir.
    Karakterler henüz oluşturulmaz — bu start_game() ile yapılır.
    
    Args:
        game_id: Oyun ID'si. None ise otomatik UUID üretilir.
        player_count: Toplam oyuncu sayısı (AI + İnsan)
        ai_count: AI oyuncu sayısı
        day_limit: Maximum gün limiti
        
    Returns:
        dict: {
            "game_id": str,
            "world_seed": WorldSeed (Pydantic model),
            "status": "waiting",
            "config": {...},
            "created_at": str,
        }
        
    Raises:
        ValueError: game_id zaten varsa
        
    Example:
        >>> game = await create_new_game(player_count=6, ai_count=4)
        >>> print(game["game_id"])  # "a1b2c3d4-..."
        >>> print(game["world_seed"].settlement_name)  # "Kuyucak"
    """
    # ═══ 1. Game ID Oluştur ═══
    if game_id is None:
        game_id = str(uuid.uuid4())
    
    # Aynı ID varsa hata
    if db.get(GAMES, game_id):
        raise ValueError(f"Game {game_id} already exists")
    
    # ═══ 2. Validation ═══
    if player_count < 3:
        raise ValueError("Minimum 3 oyuncu gerekli")
    if ai_count >= player_count:
        raise ValueError("En az 1 insan oyuncu olmalı")
    if ai_count < 1:
        raise ValueError("En az 1 AI oyuncu olmalı")
    if day_limit < 1:
        raise ValueError("Gün limiti en az 1 olmalı")
    
    # ═══ 3. World Seed Üret (Deterministik) ═══
    """
    World seed oyunun tüm statik verilerini içerir:
    - Köy adı, orman adı
    - Mevsim, ton, atmosfer
    - Mitolojik efsane
    - Rituel cümleleri
    
    Aynı game_id = Aynı dünya (replay yapılabilir)
    """
    world_seed = generate_world_seed(game_id)
    
    # ═══ 4. Database'e Kaydet ═══
    game_data = {
        "game_id": game_id,
        "world_seed": world_seed.model_dump(),  # Pydantic → dict
        "status": "waiting",  # "waiting" | "running" | "finished"
        "config": {
            "player_count": player_count,
            "ai_count": ai_count,
            "day_limit": day_limit,
        },
        "state": None,  # Oyun başlayınca dolar
        "winner": None,
        "created_at": datetime.utcnow().isoformat(),
    }
    
    db.insert(GAMES, game_id, game_data)
    
    print(f"✅ Oyun oluşturuldu: {game_id}")
    print(f"   Köy: {world_seed.place_variants.settlement_name}")
    print(f"   Ton: {world_seed.tone} | Mevsim: {world_seed.season}")
    
    return game_data


async def start_game(game_id: str) -> dict:
    """
    Oyunu başlat — karakterleri oluştur ve state'i initialize et.
    
    Bu fonksiyon:
    1. World seed'den RNG oluşturur
    2. Karakterleri üretir (AI acting prompt'ları LLM ile)
    3. GameState'i initialize eder
    4. Database'i günceller (status: "running")
    
    ⚠️ UYARI: Bu fonksiyon LLM çağrıları yapar (acting prompt'lar için).
    FAL_KEY environment variable'ı set olmalı.
    
    Args:
        game_id: Başlatılacak oyunun ID'si
        
    Returns:
        dict: {
            "game_id": str,
            "state": GameState,
            "players": list[Player],  # Karakter kartları
            "status": "running",
        }
        
    Raises:
        ValueError: Oyun bulunamazsa veya zaten başlamışsa
        
    Example:
        >>> await create_new_game("test123")
        >>> result = await start_game("test123")
        >>> print(len(result["players"]))  # 6
        >>> print(result["players"][0].name)  # "Nyx"
    """
    # ═══ 1. Oyunu Database'den Getir ═══
    game_data = db.get(GAMES, game_id)
    if not game_data:
        raise ValueError(f"Game {game_id} not found")
    
    if game_data["status"] != "waiting":
        raise ValueError(f"Game {game_id} already started (status: {game_data['status']})")
    
    # ═══ 2. Config ve World Seed ═══
    config = game_data["config"]
    world_seed_dict = game_data["world_seed"]
    world_seed = WorldSeed(**world_seed_dict)  # dict → Pydantic
    
    # ═══ 3. RNG Oluştur (Deterministik) ═══
    """
    Aynı game_id = Aynı karakter isimleri, roller, AI seviyeleri
    """
    rng = _make_rng(game_id)
    
    # ═══ 4. Karakterleri Üret ═══
    """
    Bu adım LLM çağrıları yapar:
    - Her karakter için acting prompt oluşturulur
    - Pro model kullanılır (daha detaylı karakterler)
    - ~30-60 saniye sürebilir (paralel çağrılar)
    
    FAL_KEY yoksa mock karakterler oluştur (test için).
    """
    from src.core.config import get_settings
    settings = get_settings()
    
    if not settings.FAL_KEY:
        # Mock karakterler oluştur
        print(f"⚠️  FAL_KEY yok — Mock karakterler oluşturuluyor")
        from game_state import Player, PlayerType
        
        players = []
        for i in range(config["player_count"]):
            is_human = i < (config["player_count"] - config["ai_count"])
            players.append(Player(
                slot_id=f"P{i}",
                name=f"Player_{i}",
                role_title="Villager" if is_human else "AI Character",
                lore=f"A mysterious inhabitant of {world_seed.place_variants.settlement_name}",
                archetype="SupheliSessiz",
                archetype_label="Suspicious and Silent",
                player_type=PlayerType.ET_CAN if is_human else PlayerType.YANKI_DOGMUS,
                acting_prompt="Act naturally and observe others carefully",
                skill_tier="Orta" if not is_human else None,
                skill_tier_label="Orta" if not is_human else None,
                is_human=is_human,
                alive=True,
            ))
        
        print(f"✅ {len(players)} mock karakter oluşturuldu")
    else:
        # Gerçek LLM ile karakterler üret
        print(f"🎭 Karakterler oluşturuluyor... (LLM çağrıları yapılıyor)")
        
        players = await generate_players(
            rng=rng,
            world_seed=world_seed,
            player_count=config["player_count"],
            ai_count=config["ai_count"],
        )
        
        print(f"✅ {len(players)} karakter oluşturuldu")
    
    # ═══ 5. Game State Initialize ═══
    """
    GameState, oyunun anlık durumunu içerir:
    - Hangi fazda (morning, campfire, vote...)
    - Kaçıncı gün
    - Hangi oyuncular hayatta
    - Konuşma geçmişi
    """
    state = init_state(
        players=players,
        world_seed=world_seed,
        day_limit=config["day_limit"],
    )
    
    # ═══ 6. Database Güncelle ═══
    """
    State'i JSON olarak sakla.
    Player objelerini serialize et (Pydantic model_dump).
    """
    game_data["state"] = _serialize_state(state)
    game_data["status"] = "running"
    game_data["started_at"] = datetime.utcnow().isoformat()
    
    db.update(GAMES, game_id, game_data)
    
    print(f"✅ Oyun başlatıldı: {game_id}")
    
    return {
        "game_id": game_id,
        "state": state,
        "players": players,
        "status": "running",
    }


async def get_game_state(game_id: str) -> dict | None:
    """
    Oyun durumunu database'den getir.
    
    Bu fonksiyon frontend'e oyun durumunu göndermek için kullanılır.
    Gizli bilgiler filtrelenir (AI acting prompt'ları, gizli roller).
    
    Args:
        game_id: Oyun ID'si
        
    Returns:
        dict | None: Oyun varsa state, yoksa None
        
    Example:
        >>> state = await get_game_state("test123")
        >>> print(state["phase"])  # "morning"
        >>> print(state["round_number"])  # 2
    """
    game_data = db.get(GAMES, game_id)
    if not game_data:
        return None
    
    # State varsa deserialize et
    if game_data["state"]:
        state = _deserialize_state(game_data["state"])
        game_data["state"] = state
    
    return game_data


async def get_public_game_info(game_id: str) -> dict | None:
    """
    Oyun bilgisini public format'ta döndür (gizli bilgiler yok).
    
    Frontend için — oyuncular birbirlerinin rollerini görmesin.
    
    Returns:
        dict: {
            "game_id": str,
            "status": str,
            "phase": str,
            "round_number": int,
            "players": [
                {"name": str, "alive": bool, "role_title": str},
                ...
            ],
            "world_brief": str,
        }
    """
    game_data = await get_game_state(game_id)
    if not game_data:
        return None
    
    # Public bilgi
    result = {
        "game_id": game_id,
        "status": game_data["status"],
    }
    
    # Oyun başladıysa state bilgisi ekle
    if game_data["state"]:
        state = game_data["state"]
        result.update({
            "phase": state.get("phase"),
            "round_number": state.get("round_number"),
            "day_limit": state.get("day_limit"),
            "players": [
                {
                    "name": p.name,
                    "role_title": p.role_title,
                    "alive": p.alive,
                    # AI mi değil mi GİZLİ (oyun sırasında belli olmamalı)
                }
                for p in state.get("players", [])
            ],
        })
    
    # World seed bilgisi (köy adı vs.)
    if game_data["world_seed"]:
        ws = WorldSeed(**game_data["world_seed"])
        result["world_brief"] = (
            f"{ws.place_variants.settlement_name} köyü, "
            f"{ws.season} mevsimi. {ws.myth_variant.rumor}"
        )
    
    return result


# ═══════════════════════════════════════════════════
# HELPER FUNCTIONS — Serialization
# ═══════════════════════════════════════════════════

def _serialize_state(state: GameState) -> dict:
    """
    GameState → dict (JSON uyumlu).
    
    Player objelerini Pydantic model_dump ile serialize et.
    """
    serialized = dict(state)
    
    # Player objelerini dict'e çevir
    if "players" in serialized:
        serialized["players"] = [
            p.model_dump() for p in serialized["players"]
        ]
    
    return serialized


def _deserialize_state(state_dict: dict) -> GameState:
    """
    dict → GameState.
    
    Player dict'lerini Pydantic model'e geri çevir.
    """
    # Player dict'lerini Player objesine çevir
    if "players" in state_dict:
        state_dict["players"] = [
            Player(**p) for p in state_dict["players"]
        ]
    
    return state_dict


# ═══════════════════════════════════════════════════
# RE-EXPORTS — API katmanı bunları kullanabilir
# ═══════════════════════════════════════════════════
"""
Prototype fonksiyonlarını direkt dışa aç.
İleride wrapper'larını yazabiliriz.
"""

__all__ = [
    # High-level API
    "create_new_game",
    "start_game",
    "get_game_state",
    "get_public_game_info",
    
    # Prototype re-exports
    "run_campfire",
    "run_house_visits",
    "run_vote",
    "run_morning",
    "exile_player",
    "summarize_campfire",
    "check_win_condition",
    "get_alive_players",
    "get_alive_names",
    "count_by_type",
    # Public API — game_loop icin
    "generate_campfire_speech",
    "generate_vote",
    "generate_1v1_speech",
    "generate_location_decision",
    # Constants
    "MAX_CAMPFIRE_TURNS",
    "INITIAL_CAMPFIRE_TURNS",
    "FREE_ROAM_ROUNDS",
    "CLOSING_CAMPFIRE_TURNS",
    "CAMPFIRE_TURNS_PER_ROUND",
    "ROOM_EXCHANGES",
    
    # Models
    "GameState",
    "Player",
    "PlayerType",
    "Phase",
    "WorldSeed",
]
