"""
Test script for game_engine.py
===============================
Game engine wrapper'ını test eder.

Kullanım:
    python -m src.core.test_game_engine
"""

import asyncio
import sys
from pathlib import Path

# Add project root to path
project_root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(project_root))

from src.core.game_engine import create_new_game, get_game_state, get_public_game_info


async def test_create_game():
    """Test 1: Oyun oluşturma"""
    print("=" * 60)
    print("TEST 1: Oyun Oluşturma")
    print("=" * 60)
    
    game = await create_new_game(
        game_id="test_game_123",
        player_count=6,
        ai_count=4,
        day_limit=5,
    )
    
    print(f"\n✅ Oyun oluşturuldu:")
    print(f"   ID: {game['game_id']}")
    print(f"   Status: {game['status']}")
    print(f"   Köy: {game['world_seed']['place_variants']['settlement_name']}")
    print(f"   Ton: {game['world_seed']['tone']}")
    print(f"   Mevsim: {game['world_seed']['season']}")
    
    return game["game_id"]


async def test_get_state(game_id: str):
    """Test 2: State getirme"""
    print("\n" + "=" * 60)
    print("TEST 2: Oyun State Getirme")
    print("=" * 60)
    
    state = await get_game_state(game_id)
    
    if state:
        print(f"\n✅ State getirildi:")
        print(f"   Status: {state['status']}")
        print(f"   Config: {state['config']}")
    else:
        print("❌ State bulunamadı")


async def test_public_info(game_id: str):
    """Test 3: Public info"""
    print("\n" + "=" * 60)
    print("TEST 3: Public Info (Frontend için)")
    print("=" * 60)
    
    info = await get_public_game_info(game_id)
    
    if info:
        print(f"\n✅ Public info:")
        print(f"   ID: {info['game_id']}")
        print(f"   Status: {info['status']}")
        if "world_brief" in info:
            print(f"   Dünya: {info['world_brief']}")
    else:
        print("❌ Info bulunamadı")


async def main():
    """Ana test suite"""
    print("\n🎮 GAME ENGINE TEST SUITE\n")
    
    try:
        # Test 1: Oyun oluştur
        game_id = await test_create_game()
        
        # Test 2: State getir
        await test_get_state(game_id)
        
        # Test 3: Public info
        await test_public_info(game_id)
        
        print("\n" + "=" * 60)
        print("✅ TÜM TESTLER BAŞARILI!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ TEST HATASI: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
