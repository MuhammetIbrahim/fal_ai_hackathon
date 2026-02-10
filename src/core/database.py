"""
database.py — In-Memory Mock Database
======================================
Hackathon icin basit in-memory store.
Production icin Redis/PostgreSQL'e gecilecek.
Tum app'ler burayi kullanir — tek kaynak.
"""

from __future__ import annotations

import threading
from datetime import datetime
from typing import Any


class InMemoryDB:
    """Thread-safe in-memory key-value store with collections."""

    def __init__(self):
        self._lock = threading.Lock()
        self._collections: dict[str, dict[str, dict]] = {}

    # ── Collection CRUD ──────────────────────────────

    def insert(self, collection: str, id: str, data: dict) -> dict:
        """Kayit ekle. Ayni id varsa uzerine yazar."""
        with self._lock:
            if collection not in self._collections:
                self._collections[collection] = {}
            record = {
                **data,
                "_id": id,
                "_created_at": datetime.utcnow().isoformat(),
                "_updated_at": datetime.utcnow().isoformat(),
            }
            self._collections[collection][id] = record
            return record

    def get(self, collection: str, id: str) -> dict | None:
        """ID ile kayit getir."""
        with self._lock:
            return self._collections.get(collection, {}).get(id)

    def update(self, collection: str, id: str, data: dict) -> dict | None:
        """Kayit guncelle (merge)."""
        with self._lock:
            coll = self._collections.get(collection, {})
            if id not in coll:
                return None
            coll[id] = {
                **coll[id],
                **data,
                "_updated_at": datetime.utcnow().isoformat(),
            }
            return coll[id]

    def delete(self, collection: str, id: str) -> bool:
        """Kayit sil."""
        with self._lock:
            coll = self._collections.get(collection, {})
            if id in coll:
                del coll[id]
                return True
            return False

    def list(self, collection: str, filter_fn: Any = None) -> list[dict]:
        """Collection'daki tum kayitlari listele. Opsiyonel filter."""
        with self._lock:
            coll = self._collections.get(collection, {})
            records = list(coll.values())
            if filter_fn:
                records = [r for r in records if filter_fn(r)]
            return records

    def count(self, collection: str) -> int:
        """Collection'daki kayit sayisi."""
        with self._lock:
            return len(self._collections.get(collection, {}))

    def clear(self, collection: str | None = None):
        """Collection temizle. None ise tum DB sifirla."""
        with self._lock:
            if collection:
                self._collections.pop(collection, None)
            else:
                self._collections.clear()


# ── Singleton Instance ───────────────────────────────

db = InMemoryDB()


def init_memory_db():
    """
    In-memory database'i başlatır (collections oluşturur).
    Application startup'ta çağrılır.
    """
    db.clear()  # Temiz başlat
    print("📦 In-memory DB collections initialized: games, lobbies, players, game_logs")


# ── Collection Isimleri (sabitler) ───────────────────

GAMES = "games"
LOBBIES = "lobbies"
PLAYERS = "players"
GAME_LOGS = "game_logs"
