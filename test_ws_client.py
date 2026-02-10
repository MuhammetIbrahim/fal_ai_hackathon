"""
WebSocket Test Client
=====================
ws/router.py'yi test etmek için basit client.

Usage:
    python test_ws_client.py game123 P0
"""

import asyncio
import websockets
import json
import sys

async def test_websocket(game_id: str, player_id: str):
    uri = f"ws://localhost:8000/ws/{game_id}/{player_id}"
    
    print(f"🔌 Connecting to {uri}...")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ Connected!")
            
            # Hoş geldin mesajı al
            welcome = await websocket.recv()
            print(f"📥 Received: {welcome}")
            
            # Test: Heartbeat gönder
            print("\n💓 Sending heartbeat...")
            await websocket.send(json.dumps({
                "event": "heartbeat",
                "data": {"timestamp": 12345}
            }))
            
            pong = await websocket.recv()
            print(f"📥 Received: {pong}")
            
            # Test: Speak event gönder
            print("\n🗣️  Sending speech...")
            await websocket.send(json.dumps({
                "event": "speak",
                "data": {"content": "Merhaba herkese! Test konuşması."}
            }))
            
            # Broadcast'i dinle (10 saniye)
            print("\n👂 Listening for broadcasts (10s)...")
            for i in range(10):
                try:
                    msg = await asyncio.wait_for(websocket.recv(), timeout=1.0)
                    print(f"📥 Received: {msg}")
                except asyncio.TimeoutError:
                    print(".", end="", flush=True)
            
            print("\n\n✅ Test completed!")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python test_ws_client.py <game_id> <player_id>")
        print("Example: python test_ws_client.py game123 P0")
        sys.exit(1)
    
    game_id = sys.argv[1]
    player_id = sys.argv[2]
    
    asyncio.run(test_websocket(game_id, player_id))
