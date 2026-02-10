#!/usr/bin/env python3
"""
Test Game Loop
==============
Oyun oluşturur, başlatır ve WebSocket üzerinden event'leri dinler.

Usage:
    python test_game_loop.py
"""

import asyncio
import httpx
import websockets
import json
from datetime import datetime

API_BASE = "http://localhost:8000"
WS_BASE = "ws://localhost:8000"

async def test_full_game_flow():
    """Tam oyun akışını test et."""
    
    print("=" * 60)
    print("🎮 GAME LOOP TEST")
    print("=" * 60)
    
    # ═══ 1. OYUN OLUŞTUR ═══
    print("\n📝 Step 1: Oyun oluşturuluyor...")
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{API_BASE}/api/game/",
            json={
                "game_id": "test-game-loop",
                "player_count": 5,
                "ai_count": 4,
                "day_limit": 3,
            }
        )
        
        if response.status_code != 201:
            print(f"❌ Oyun oluşturulamadı: {response.text}")
            return
        
        game_data = response.json()
        print(f"✅ Oyun oluşturuldu: {game_data['game_id']}")
        print(f"   Köy: {game_data['settlement_name']}")
        print(f"   Durum: {game_data['status']}")
    
    # ═══ 2. WEBSOCKET BAĞLAN ═══
    print("\n🔌 Step 2: WebSocket bağlanıyor...")
    game_id = game_data["game_id"]
    player_id = "P0"  # İnsan oyuncu
    
    ws_uri = f"{WS_BASE}/ws/{game_id}/{player_id}"
    
    try:
        async with websockets.connect(ws_uri) as ws:
            print(f"✅ WebSocket connected: {ws_uri}")
            
            # Hoş geldin mesajı
            welcome = await ws.recv()
            print(f"📥 {json.loads(welcome)}")
            
            # ═══ 3. OYUNU BAŞLAT (Background Task) ═══
            print("\n🚀 Step 3: Oyun başlatılıyor...")
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(f"{API_BASE}/api/game/{game_id}/start")
                
                if response.status_code != 200:
                    print(f"❌ Oyun başlatılamadı: {response.text}")
                    return
                
                result = response.json()
                print(f"✅ {result['message']}")
            
            # ═══ 4. EVENT'LERİ DİNLE ═══
            print("\n👂 Step 4: Game loop event'lerini dinliyorum...")
            print("-" * 60)
            
            event_count = 0
            max_events = 20  # Max 20 event dinle
            
            while event_count < max_events:
                try:
                    # Event bekle (timeout 2s)
                    msg = await asyncio.wait_for(ws.recv(), timeout=2.0)
                    event = json.loads(msg)
                    
                    event_type = event.get("event")
                    event_data = event.get("data", {})
                    
                    # Event'i formatla ve göster
                    timestamp = datetime.now().strftime("%H:%M:%S")
                    
                    if event_type == "game_started":
                        print(f"\n🎮 [{timestamp}] GAME STARTED")
                        print(f"   Round: {event_data.get('round')}")
                        print(f"   Phase: {event_data.get('phase')}")
                        
                    elif event_type == "phase_change":
                        print(f"\n🔄 [{timestamp}] PHASE CHANGE → {event_data.get('phase').upper()}")
                        print(f"   Round: {event_data.get('round')}")
                        print(f"   Message: {event_data.get('message')}")
                        
                    elif event_type == "morning_message":
                        print(f"\n☀️  [{timestamp}] MORNING MESSAGE")
                        print(f"   {event_data.get('content')}")
                        
                    elif event_type == "vote_phase":
                        print(f"\n🗳️  [{timestamp}] VOTE PHASE")
                        print(f"   Alive: {event_data.get('alive_players')}")
                        
                    elif event_type == "player_exiled":
                        print(f"\n⚖️  [{timestamp}] PLAYER EXILED")
                        print(f"   Player: {event_data.get('player')}")
                        
                    elif event_type == "game_over":
                        print(f"\n🏆 [{timestamp}] GAME OVER")
                        print(f"   Winner: {event_data.get('winner')}")
                        print(f"   Message: {event_data.get('message')}")
                        break
                        
                    elif event_type == "error":
                        print(f"\n❌ [{timestamp}] ERROR")
                        print(f"   Code: {event_data.get('code')}")
                        print(f"   Message: {event_data.get('message')}")
                        
                    else:
                        print(f"\n📦 [{timestamp}] {event_type.upper()}")
                        print(f"   Data: {event_data}")
                    
                    event_count += 1
                    
                except asyncio.TimeoutError:
                    print(".", end="", flush=True)
                    continue
            
            print("\n" + "-" * 60)
            print(f"\n✅ Test tamamlandı! {event_count} event alındı.")
            
    except Exception as e:
        print(f"\n❌ Hata: {e}")

if __name__ == "__main__":
    asyncio.run(test_full_game_flow())
