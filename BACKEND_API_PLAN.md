# Backend API Plan — AI vs Insan: Ocak Yemini

## Genel Bakis

Game engine (prototipler) hazir. Bu plan, engine'i serve edecek FastAPI + WebSocket katmanini tanimlar.
Modular monolith yaklasim: her feature kendi app'inde, tek process'te calisir.

---

## Folder Structure

```
src/
  core/                         ← Paylasilan is mantigi (game engine burada)
    __init__.py
    config.py                   ← Env vars, FAL_KEY, Redis config (HAZIR)
    database.py                 ← In-memory mock DB (HAZIR)
    dependencies.py             ← FastAPI dependency injection (HAZIR)
    game_engine.py              ← game.py'den import edilen fonksiyonlar (wrapper)
    world_gen.py                ← Dunya uretimi (mevcut — kopyalanacak)
    game_state.py               ← Player, GameState (mevcut — kopyalanacak)
    fal_services.py             ← LLM/TTS/STT wrapper (mevcut — kopyalanacak)
    data.json                   ← Karakter verileri (mevcut — kopyalanacak)

  apps/
    game/                       ← Oyun CRUD + lifecycle
      __init__.py
      router.py                 ← POST /game, GET /game/{id}, POST /game/{id}/start
      schema.py                 ← Request/Response Pydantic modelleri
      models.py                 ← DB modelleri (SQLite/Redis)
      service.py                ← Oyun olustur, state getir, engine cagir

    lobby/                      ← Lobi + oyuncu yonetimi
      __init__.py
      router.py                 ← POST /lobby, POST /lobby/{id}/join, GET /lobby/{id}
      schema.py                 ← Lobby request/response
      models.py                 ← Lobby DB modeli
      service.py                ← Lobi olustur, oyuncu ekle, oyun baslat

    ws/                         ← WebSocket + real-time events
      __init__.py
      router.py                 ← WS /ws/{game_id}/{player_id}
      schema.py                 ← WebSocket event tipleri
      service.py                ← Connection manager, event broadcast

  main.py                       ← FastAPI app factory, router mounting
```

---

## Tech Stack

- **FastAPI** — REST + WebSocket
- **Pydantic v2** — Schema validation (zaten projede var)
- **In-Memory DB** — `src/core/database.py` (HAZIR, asagida detay)
- **uvicorn** — ASGI server

### pyproject.toml'a eklenecekler
```toml
dependencies = [
    "fastapi>=0.115",
    "uvicorn[standard]>=0.30",
    "python-dotenv",
]
```

---

## In-Memory Database (`src/core/database.py` — HAZIR)

Thread-safe, singleton, collection-based mock DB. Tum app'ler bunu kullanir.
Production icin Redis/PostgreSQL'e geciste sadece bu dosya degisir.

### Kullanim

```python
from src.core.database import db, GAMES, LOBBIES, PLAYERS, GAME_LOGS

# Kayit ekle
db.insert(GAMES, "game_123", {"status": "waiting", "world_seed": {...}})

# Getir
game = db.get(GAMES, "game_123")

# Guncelle (merge)
db.update(GAMES, "game_123", {"status": "running", "round": 2})

# Filtreli listele
running = db.list(GAMES, filter_fn=lambda g: g["status"] == "running")

# Sayim
count = db.count(LOBBIES)

# Sil
db.delete(GAMES, "game_123")

# Temizle
db.clear(GAMES)       # tek collection
db.clear()             # tum DB
```

### Collection Sabitleri

| Sabit | Kullanim |
|-------|----------|
| `GAMES` | Oyun kayitlari (world_seed, state, status, winner) |
| `LOBBIES` | Lobi kayitlari (code, host, players, status) |
| `PLAYERS` | Oyuncu session kayitlari (slot_id, game_id, ws_connected) |
| `GAME_LOGS` | Bitmis oyun loglari (rounds, votes, exiles) |

### Otomatik meta alanlar

Her kayitta otomatik eklenir:
- `_id` — kayit ID'si
- `_created_at` — olusturulma zamani (ISO)
- `_updated_at` — son guncelleme zamani (ISO)

### ONEMLI: models.py yerine database.py kullan

App'lerdeki `models.py` dosyalarina dataclass/SQLModel yazmak yerine,
direkt `database.py`'yi kullan. Ornek:

```python
# YANLIS — kendi store'unu yazma:
_games: dict[str, dict] = {}

# DOGRU — merkezi DB kullan:
from src.core.database import db, GAMES
db.insert(GAMES, game_id, {"status": "waiting", ...})
game = db.get(GAMES, game_id)
```

Bu sayede tum data tek yerde, debug kolay, production gecisi temiz.

---

## APP 1: game/ — Oyun Yonetimi

### router.py

```python
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/game", tags=["game"])

@router.post("/", response_model=GameCreateResponse)
async def create_game(req: GameCreateRequest):
    """Yeni oyun olustur. World seed uretilir, game_id doner."""

@router.get("/{game_id}", response_model=GameStateResponse)
async def get_game(game_id: str):
    """Oyun durumunu getir (public — gizli bilgi yok)."""

@router.post("/{game_id}/start")
async def start_game(game_id: str):
    """Oyunu baslat. Karakterler uretilir, game loop baslar."""

@router.get("/{game_id}/log", response_model=GameLogResponse)
async def get_game_log(game_id: str):
    """Bitmis oyunun logunu getir."""
```

### schema.py

```python
from pydantic import BaseModel

class GameCreateRequest(BaseModel):
    game_id: str | None = None      # None ise UUID uretilir
    player_count: int = 6
    ai_count: int = 4
    day_limit: int = 5

class GameCreateResponse(BaseModel):
    game_id: str
    world_brief: str                # oyunculara gosterilecek
    settlement_name: str
    status: str                     # "waiting" | "running" | "finished"

class PlayerPublic(BaseModel):
    slot_id: str
    name: str
    role_title: str
    alive: bool

class GameStateResponse(BaseModel):
    game_id: str
    status: str
    phase: str
    round_number: int
    day_limit: int
    players: list[PlayerPublic]
    world_brief: str

class GameLogResponse(BaseModel):
    game_id: str
    winner: str | None
    total_rounds: int
    rounds: list[dict]
```

### service.py

```python
from src.core.database import db, GAMES
from src.core.game_engine import generate_world_seed, generate_players, init_state, _make_rng

async def create_game(game_id: str, player_count: int, ai_count: int, day_limit: int) -> dict:
    world_seed = generate_world_seed(game_id)
    return db.insert(GAMES, game_id, {
        "world_seed": world_seed.model_dump(),
        "status": "waiting",
        "state": None,
        "config": {"player_count": player_count, "ai_count": ai_count, "day_limit": day_limit},
    })

async def start_game(game_id: str) -> dict:
    game = db.get(GAMES, game_id)
    if not game:
        raise ValueError(f"Game {game_id} not found")

    config = game["config"]
    world_seed = generate_world_seed(game_id)
    rng = _make_rng(game_id)

    # Karakter uret
    players = await generate_players(rng, world_seed, config["player_count"], config["ai_count"])
    state = init_state(players, world_seed, config["day_limit"])

    db.update(GAMES, game_id, {"status": "running", "state": state})

    # Background task olarak game loop baslat
    asyncio.create_task(_run_game_loop(game_id))
    return db.get(GAMES, game_id)

async def get_game(game_id: str) -> dict:
    game = db.get(GAMES, game_id)
    if not game:
        raise ValueError(f"Game {game_id} not found")
    return game

async def _run_game_loop(game_id: str):
    """Game loop — her fazda WS event broadcast + DB update eder."""
    game = db.get(GAMES, game_id)
    state = game["state"]
    # run_full_game'i ADIM ADIM calistir, her fazda:
    #   1. db.update(GAMES, game_id, {"state": state})
    #   2. ws manager.broadcast(...)
    pass
```

### models.py

```python
# models.py'ye dataclass/SQLModel YAZMA.
# Tum data src/core/database.py uzerinden yonetilir.
# Bu dosya bos kalabilir veya sadece type hint'ler icin kullanilir.
#
# Ornek type hint:
# GameData = dict  # db.get(GAMES, id) donen tip
# LobbyData = dict
```

---

## APP 2: lobby/ — Lobi Yonetimi

### router.py

```python
router = APIRouter(prefix="/lobby", tags=["lobby"])

@router.post("/", response_model=LobbyResponse)
async def create_lobby(req: LobbyCreateRequest):
    """Yeni lobi olustur. Kod doner."""

@router.post("/{lobby_code}/join", response_model=JoinResponse)
async def join_lobby(lobby_code: str, req: JoinRequest):
    """Lobiye katil. Player slot ata."""

@router.get("/{lobby_code}", response_model=LobbyResponse)
async def get_lobby(lobby_code: str):
    """Lobi durumunu getir."""

@router.post("/{lobby_code}/start")
async def start_from_lobby(lobby_code: str):
    """Lobi sahibi oyunu baslatir. game/ service'e devreder."""
```

### schema.py

```python
class LobbyCreateRequest(BaseModel):
    host_name: str
    max_players: int = 6

class JoinRequest(BaseModel):
    player_name: str

class LobbyPlayer(BaseModel):
    slot_id: str
    name: str
    is_host: bool
    is_human: bool
    ready: bool

class LobbyResponse(BaseModel):
    lobby_code: str             # 6 haneli kod (ABCD12)
    host: str
    players: list[LobbyPlayer]
    max_players: int
    status: str                 # "waiting" | "starting" | "in_game"

class JoinResponse(BaseModel):
    slot_id: str
    lobby_code: str
```

### service.py

```python
import random
import string
from src.core.database import db, LOBBIES

def _generate_code() -> str:
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

async def create_lobby(host_name: str, max_players: int) -> dict:
    code = _generate_code()
    return db.insert(LOBBIES, code, {
        "code": code,
        "host": host_name,
        "max_players": max_players,
        "players": [{"slot_id": "P0", "name": host_name, "is_host": True, "is_human": True, "ready": True}],
        "status": "waiting",
    })

async def join_lobby(code: str, player_name: str) -> dict:
    lobby = db.get(LOBBIES, code)
    if not lobby:
        raise ValueError(f"Lobby {code} not found")

    slot_id = f"P{len(lobby['players'])}"
    player = {"slot_id": slot_id, "name": player_name, "is_host": False, "is_human": True, "ready": False}
    lobby["players"].append(player)
    db.update(LOBBIES, code, {"players": lobby["players"]})
    # Kalan slotlar AI ile doldurulacak (oyun baslarken)
    return player

async def get_lobby(code: str) -> dict:
    lobby = db.get(LOBBIES, code)
    if not lobby:
        raise ValueError(f"Lobby {code} not found")
    return lobby
```

---

## APP 3: ws/ — WebSocket + Real-time

### router.py

```python
from fastapi import WebSocket, WebSocketDisconnect

router = APIRouter(tags=["ws"])

@router.websocket("/ws/{game_id}/{player_id}")
async def game_websocket(ws: WebSocket, game_id: str, player_id: str):
    await ws.accept()
    manager.connect(game_id, player_id, ws)
    try:
        while True:
            data = await ws.receive_json()
            await handle_player_event(game_id, player_id, data)
    except WebSocketDisconnect:
        manager.disconnect(game_id, player_id)
```

### schema.py — Event Tipleri

```python
# Server → Client Events
class ServerEvent(BaseModel):
    event: str
    data: dict

# Event tipleri:
# "morning"           → {"content": "Yeni bir gun..."}
# "campfire_speech"   → {"name": "Fenris", "role_title": "Demirci", "content": "..."}
# "moderator"         → {"content": "Ocak Yemini titredi..."}
# "visit_start"       → {"visitor": "X", "host": "Y"}
# "visit_speech"      → {"speaker": "X", "content": "..."}
# "vote_phase"        → {"alive_names": [...]}
# "vote_result"       → {"votes": {...}, "exiled": "X", "exiled_type": "yanki_dogmus"}
# "game_over"         → {"winner": "et_can", "final_alive": [...]}
# "phase_change"      → {"phase": "campfire", "round": 2}

# Client → Server Events
# "speak"             → {"content": "Ben dun gece..."} (insan oyuncu campfire konusmasi)
# "vote"              → {"target": "Fenris"}
# "visit_request"     → {"target": "Nyx"}
# "visit_speak"       → {"content": "Sana bir sey soracam..."}
```

### service.py — Connection Manager

```python
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        # game_id → {player_id → WebSocket}
        self.connections: dict[str, dict[str, WebSocket]] = {}

    def connect(self, game_id: str, player_id: str, ws: WebSocket):
        if game_id not in self.connections:
            self.connections[game_id] = {}
        self.connections[game_id][player_id] = ws

    def disconnect(self, game_id: str, player_id: str):
        if game_id in self.connections:
            self.connections[game_id].pop(player_id, None)

    async def broadcast(self, game_id: str, event: str, data: dict):
        """Tum oyunculara event gonder."""
        if game_id in self.connections:
            msg = {"event": event, "data": data}
            for ws in self.connections[game_id].values():
                await ws.send_json(msg)

    async def send_to(self, game_id: str, player_id: str, event: str, data: dict):
        """Tek oyuncuya event gonder (ornegin ozel gorusme)."""
        ws = self.connections.get(game_id, {}).get(player_id)
        if ws:
            await ws.send_json({"event": event, "data": data})

manager = ConnectionManager()
```

---

## main.py — App Factory

```python
from fastapi import FastAPI
from src.apps.game.router import router as game_router
from src.apps.lobby.router import router as lobby_router
from src.apps.ws.router import router as ws_router
from src.core.config import get_settings

def create_app() -> FastAPI:
    app = FastAPI(
        title="Ocak Yemini — AI vs Insan",
        version="0.1.0",
    )

    app.include_router(game_router)
    app.include_router(lobby_router)
    app.include_router(ws_router)

    @app.on_event("startup")
    async def startup():
        from src.core.dependencies import init_fal
        init_fal()

    return app

app = create_app()

# Calistirma: uvicorn src.main:app --reload
```

---

## core/config.py

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    FAL_KEY: str
    REDIS_URL: str = "redis://localhost:6379"
    ENV: str = "development"

    class Config:
        env_file = ".env"

_settings = None

def get_settings() -> Settings:
    global _settings
    if not _settings:
        _settings = Settings()
    return _settings
```

---

## KRITIK: Game Engine Entegrasyonu

Game engine simdi `src/prototypes/game.py`'de. Entegrasyon icin `core/game_engine.py` bir wrapper olacak:

```python
# core/game_engine.py
# prototypes'dan fonksiyonlari import edip, WS broadcast hook'lari ekler

from src.prototypes.world_gen import generate_world_seed, WorldSeed, _make_rng
from src.prototypes.game_state import Player, GameState, ...
from src.prototypes.game import (
    generate_players,
    run_campfire,
    run_house_visits,
    run_vote,
    run_morning,
    exile_player,
    summarize_campfire,
    init_state,
)

# Bu fonksiyonlar dogrudan kullanilabilir.
# Ama game loop'u ADIM ADIM calistirmak lazim (WS broadcast icin).
# run_full_game() yerine, her fazi tek tek cagirip araya broadcast koyacagiz.
```

### Game Loop — WS Entegrasyonlu

```python
async def run_game_with_ws(game_id: str, state: GameState, manager: ConnectionManager):
    """Her fazda WS broadcast yapan game loop."""
    while True:
        round_n = state["round_number"]

        # SABAH
        state = await run_morning(state)
        await manager.broadcast(game_id, "morning", {
            "round": round_n,
            "content": state["campfire_history"][-1]["content"],
        })

        # TARTISMA — her konusmada broadcast
        # Burada campfire'i step-by-step calistirmak lazim
        # (run_campfire icindeki her speech'te broadcast)

        # EV ZIYARETLERI — sadece ilgili oyunculara
        # visit_speech event'i sadece visitor + host'a gider

        # OYLAMA
        await manager.broadcast(game_id, "vote_phase", {"alive": get_alive_names(state)})
        # Insan oyuncu oyunu WS'den bekle, AI oylarini engine'den al

        # SURGUN
        await manager.broadcast(game_id, "exile", {"name": exiled, ...})

        # KONTROL
        winner = check_win_condition(state)
        if winner:
            await manager.broadcast(game_id, "game_over", {"winner": winner})
            break
```

---

## Insan Oyuncu Akisi

1. Lobby'e katilir → slot atanir (P0)
2. Oyun baslar → world_brief + karakter karti WS ile gelir
3. Campfire'da sira gelince → client'a "your_turn" event gider
4. Oyuncu mesaj yazar/konusur → WS'den "speak" event gelir
5. Engine mesaji alir, moderator check yapar, broadcast eder
6. Oylama'da → "vote_phase" event gelir, oyuncu secim yapar
7. Visit'te → "visit_request" event gelir, oyuncu secer

**Onemli:** Insan oyuncu icin timeout koy (30 sn). Surede cevap gelmezse PASS/random.

---

## Oncelik Sirasi

### Fase 1 (ilk gun — BUGUN):
1. `main.py` + `core/config.py` → FastAPI calisir
2. `apps/game/` → POST /game + GET /game/{id}
3. `apps/ws/` → Temel WS connection + broadcast

### Fase 2 (yarin):
4. `apps/lobby/` → Lobi CRUD + join
5. Game engine WS entegrasyonu (step-by-step game loop)
6. Insan oyuncu input handling (speak, vote, visit)

### Fase 3 (demo gunu):
7. Error handling + reconnection
8. Game log endpoint
9. Polish + test

---

## Test

```bash
# Server baslat
uvicorn src.main:app --reload --port 8000

# Game olustur
curl -X POST http://localhost:8000/game/ -H "Content-Type: application/json" \
  -d '{"player_count": 6, "ai_count": 5}'

# WebSocket test (websocat veya Postman)
websocat ws://localhost:8000/ws/{game_id}/P0
```

---

## Notlar

- Game engine `asyncio` tabanli, FastAPI ile dogal uyumlu
- `fal_services.py` zaten async — direkt kullanilabilir
- WorldSeed Pydantic model — schema.py'da direkt kullanilabilir
- **Tum data `src/core/database.py` uzerinden** — kendi dict/store yazma
- `database.py` thread-safe (Lock), singleton (`db` instance), collection bazli
- Production gecisi: sadece `database.py` icini Redis/PostgreSQL'e cevir, API ayni kalir
- `models.py` dosyalari bos kalabilir veya sadece type hint icin kullanilir
