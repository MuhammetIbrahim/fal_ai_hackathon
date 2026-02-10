"""
service.py — WebSocket Connection Manager
==========================================
Tüm WebSocket bağlantılarını merkezi yöneten servis.

SORUMLULUKLAR:
--------------
✅ Oyuncu bağlantılarını kaydet/sil
✅ Broadcast (tüm oyunculara mesaj)
✅ Unicast (tek oyuncuya mesaj)
✅ Game-based grouping

KULLANIM:
---------
    manager = ConnectionManager()
    
    # Oyuncu bağlandı
    await manager.connect("game123", "P0", websocket)
    
    # Tüm oyunculara mesaj
    await manager.broadcast("game123", {"event": "campfire_speech", ...})
    
    # Tek oyuncuya mesaj
    await manager.send_to("game123", "P0", {"event": "your_turn", ...})
"""

import logging
from typing import Dict, Optional
from fastapi import WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    WebSocket bağlantılarını yöneten merkezi sınıf.
    
    Veri yapısı:
    {
        "game_id_1": {
            "P0": WebSocket,
            "P1": WebSocket,
            "P2": WebSocket,
        },
        "game_id_2": {
            "P0": WebSocket,
            "P3": WebSocket,
        }
    }
    """
    
    def __init__(self):
        """Initialize connection manager."""
        # game_id → {player_id → WebSocket}
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}
        logger.info("ConnectionManager initialized")
    
    async def connect(self, game_id: str, player_id: str, websocket: WebSocket):
        """
        Yeni WebSocket bağlantısı ekle.
        
        Args:
            game_id: Oyun ID'si
            player_id: Oyuncu ID'si (P0, P1, P2...)
            websocket: FastAPI WebSocket instance
            
        Flow:
            1. WebSocket kabul et (accept)
            2. Game grubu yoksa oluştur
            3. Player'ı gruba ekle
            4. Diğer oyunculara bildir
        """
        # WebSocket bağlantısını kabul et
        await websocket.accept()
        
        # Game grubu yoksa oluştur
        if game_id not in self.active_connections:
            self.active_connections[game_id] = {}
        
        # Player'ı ekle
        self.active_connections[game_id][player_id] = websocket
        
        logger.info(f"✅ Player {player_id} connected to game {game_id}")
        logger.info(f"   Active players in game: {list(self.active_connections[game_id].keys())}")
        
        # Diğer oyunculara bildir
        await self.broadcast(
            game_id,
            {
                "event": "player_connected",
                "data": {
                    "player_id": player_id,
                    "active_players": list(self.active_connections[game_id].keys()),
                }
            },
            exclude=[player_id],  # Kendisine gönderme
        )
    
    def disconnect(self, game_id: str, player_id: str):
        """
        WebSocket bağlantısını kaldır.
        
        Args:
            game_id: Oyun ID'si
            player_id: Oyuncu ID'si
            
        Flow:
            1. Player'ı game grubundan çıkar
            2. Game grubu boşaldıysa sil
        """
        if game_id in self.active_connections:
            if player_id in self.active_connections[game_id]:
                del self.active_connections[game_id][player_id]
                logger.info(f"❌ Player {player_id} disconnected from game {game_id}")
            
            # Game grubu boşsa sil
            if not self.active_connections[game_id]:
                del self.active_connections[game_id]
                logger.info(f"🗑️  Game {game_id} group deleted (no active players)")
    
    async def send_to(self, game_id: str, player_id: str, message: dict):
        """
        Tek bir oyuncuya mesaj gönder (unicast).
        
        Args:
            game_id: Oyun ID'si
            player_id: Hedef oyuncu ID'si
            message: JSON mesaj
            
        Use Cases:
            - Ev ziyareti (sadece 2 oyuncuya)
            - Özel bildirim
            - Karakter kartı (sadece o oyuncuya)
            
        Example:
            await manager.send_to("game123", "P0", {
                "event": "your_turn",
                "data": {"action": "speak"}
            })
        """
        websocket = self.active_connections.get(game_id, {}).get(player_id)
        
        if websocket:
            try:
                await websocket.send_json(message)
                logger.debug(f"📤 Sent to {player_id} in {game_id}: {message['event']}")
            except Exception as e:
                logger.error(f"❌ Failed to send to {player_id}: {e}")
                # Bağlantı kopmuş olabilir, temizle
                self.disconnect(game_id, player_id)
        else:
            logger.warning(f"⚠️  Player {player_id} not found in game {game_id}")
    
    async def broadcast(
        self,
        game_id: str,
        message: dict,
        exclude: Optional[list[str]] = None,
    ):
        """
        Oyundaki tüm oyunculara mesaj gönder (broadcast).
        
        Args:
            game_id: Oyun ID'si
            message: JSON mesaj
            exclude: Gönderilmeyecek oyuncu ID'leri (optional)
            
        Use Cases:
            - Campfire konuşmaları (herkes duyar)
            - Oylama sonuçları
            - Oyun fazı değişimi
            - Sabah duyuruları
            
        Example:
            await manager.broadcast("game123", {
                "event": "campfire_speech",
                "data": {
                    "speaker": "Fenris",
                    "content": "Ben dün gece..."
                }
            })
        """
        exclude = exclude or []
        
        if game_id not in self.active_connections:
            logger.warning(f"⚠️  No active connections for game {game_id}")
            return
        
        # Tüm oyunculara gönder (exclude hariç)
        disconnected_players = []
        
        for player_id, websocket in self.active_connections[game_id].items():
            if player_id in exclude:
                continue
            
            try:
                await websocket.send_json(message)
                logger.debug(f"📢 Broadcast to {player_id}: {message['event']}")
            except Exception as e:
                logger.error(f"❌ Failed to broadcast to {player_id}: {e}")
                disconnected_players.append(player_id)
        
        # Kopuk bağlantıları temizle
        for player_id in disconnected_players:
            self.disconnect(game_id, player_id)
    
    def get_active_players(self, game_id: str) -> list[str]:
        """
        Oyundaki aktif oyuncuların listesini döndür.
        
        Args:
            game_id: Oyun ID'si
            
        Returns:
            list[str]: Player ID'leri (["P0", "P1", "P2"])
        """
        return list(self.active_connections.get(game_id, {}).keys())
    
    def is_connected(self, game_id: str, player_id: str) -> bool:
        """
        Oyuncunun bağlı olup olmadığını kontrol et.
        
        Args:
            game_id: Oyun ID'si
            player_id: Oyuncu ID'si
            
        Returns:
            bool: Bağlı mı?
        """
        return player_id in self.active_connections.get(game_id, {})
    
    def get_connection_count(self, game_id: str) -> int:
        """
        Oyundaki toplam bağlantı sayısını döndür.
        
        Args:
            game_id: Oyun ID'si
            
        Returns:
            int: Bağlı oyuncu sayısı
        """
        return len(self.active_connections.get(game_id, {}))


# ═══════════════════════════════════════════════════
# SINGLETON INSTANCE
# ═══════════════════════════════════════════════════

# Global ConnectionManager instance
# Tüm uygulama boyunca tek bir instance kullanılır
manager = ConnectionManager()
