# 🎭 Mafia Game API — FAL AI Hackathon

Sesli kurt adam/mafia oyunu için FastAPI backend.

## 🚀 Hızlı Başlangıč

### Gereksinimler
- Python 3.11+
- FAL AI API Key ([fal.ai](https://fal.ai))

### Kurulum

```bash
# 1. Virtual environment oluştur
python3 -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows

# 2. Dependencies yükle
pip install -r requirements.txt

# 3. Environment variables ayarla
cp .env.example .env
# .env dosyasını düzenle: FAL_KEY ekle

# 4. Sunucuyu başlat
uvicorn src.main:app --reload --port 8000
```

### Environment Variables

```bash
# .env dosyasına ekle:
FAL_KEY=your_fal_api_key_here
ENV=development
DEBUG=true
```

## 📡 API Endpoints

### 🎮 **Game Management**
- `POST /api/game/` — Yeni oyun oluştur
- `GET /api/game/{id}` — Oyun durumunu getir
- `POST /api/game/{id}/start` — Oyunu başlat (karakterleri LLM ile üretir)
- `GET /api/game/{id}/log` — Oyun geçmişi (replay)

### 🚪 **Lobby System**
- `POST /api/lobby/` — Yeni lobby oluştur (6 haneli kod: ABC123)
- `GET /api/lobby/{code}` — Lobby bilgisi
- `POST /api/lobby/{code}/join` — Lobby'ye katıl
- `POST /api/lobby/{code}/start` — Oyunu başlat (AI ile doldur)

### 🔌 **WebSocket (Real-time)**
- `WS /ws/{game_id}/{player_id}` — Oyun eventi dinle/gönder

#### Client → Server Events:
```json
{
  "event": "speak",
  "data": {
    "content": "Bence kurt Ayşe",
    "phase": "campfire"
  }
}
```

```json
{
  "event": "vote",
  "data": {
    "target_slot": 3,
    "phase": "vote"
  }
}
```

#### Server → Client Events:
```json
{
  "event": "phase_update",
  "data": {
    "phase": "campfire",
    "round_number": 2,
    "alive_count": 5
  }
}
```

```json
{
  "event": "exile",
  "data": {
    "exiled_name": "Ayşe",
    "exiled_role": "Köylü",
    "votes": {"1": 3, "2": 2, "3": 4}
  }
}
```

### 🔧 **System**
- `GET /` — API bilgisi
- `GET /health` — Sunucu sağlık kontrolü

## 🏗️ Proje Yapısı

```
src/
├── core/
│   ├── config.py          # Settings (Pydantic)
│   ├── database.py        # In-memory storage (thread-safe)
│   ├── dependencies.py    # DI utilities (FAL AI init)
│   ├── game_engine.py     # Oyun mantığı (LLM wrapper)
│   └── game_loop.py       # Async game loop (WS entegrasyonu)
├── apps/
│   ├── game/              # Oyun REST API
│   │   ├── router.py      # Endpoints
│   │   ├── schema.py      # Pydantic models
│   │   ├── models.py      # Data models
│   │   └── service.py     # Business logic (minimal)
│   ├── lobby/             # Lobby sistemi
│   │   ├── router.py      # 6 haneli kod, join, start
│   │   ├── schema.py      # Request/response models
│   │   └── service.py     # Lobby management
│   └── ws/                # WebSocket
│       ├── router.py      # WS endpoint + event handlers
│       ├── schema.py      # Event schemas
│       └── service.py     # ConnectionManager
└── prototypes/            # Game engine (zaten mevcut)
    ├── game.py            # Oyun döngüsü
    ├── game_state.py      # State management
    └── world_gen.py       # Dünya üretimi

main.py                    # FastAPI app factory
```

## 🧪 Test

```bash
# Sunucu çalışıyor mu?
curl http://localhost:8000/health

# Yeni oyun oluştur
curl -X POST http://localhost:8000/api/game/ \
  -H "Content-Type: application/json" \
  -d '{"player_count": 6, "ai_count": 4, "day_limit": 5}'

# Lobby oluştur
curl -X POST http://localhost:8000/api/lobby/ \
  -H "Content-Type: application/json" \
  -d '{"host_name": "Efe", "player_count": 6}'
```

### WebSocket Test (wscat):
```bash
npm install -g wscat
wscat -c ws://localhost:8000/ws/{game_id}/{player_id}

# Mesaj gönder:
{"event": "speak", "data": {"content": "Test", "phase": "campfire"}}
```

## 🎮 Oyun Akışı

1. **Lobby Oluştur** → 6 haneli kod al (ABC123)
2. **Oyuncular Katılsın** → JOIN endpoint
3. **Oyunu Başlat** → Karakterler LLM ile üretilir
4. **WebSocket Bağlan** → Gerçek zamanlı eventi dinle
5. **Game Loop** → Sabah → Ateş başı → Evler → Oylama → Sürgün
6. **Kazanan Belirlenir** → VILLAGE veya WEREWOLF

## 🛠️ Teknolojiler

- **FastAPI** 0.115+ — API framework
- **Pydantic** v2 — Schema validation
- **FAL AI** — LLM servisleri (karakter üretimi, konuşmalar)
- **WebSocket** — Real-time iletişim
- **asyncio** — Async game loop

## 📝 Notlar

- **In-memory database** kullanılıyor (hackathon için yeterli)
- **FAL_KEY** gerekli (yoksa mock karakterler oluşturulur)
- **Background game loop** WebSocket ile senkronize
- **Thread-safe** database operations

## 🐛 Debugging

**Problem:** İmport hataları
```bash
# sys.path kontrolü
python -c "import sys; print('\n'.join(sys.path))"
```

**Problem:** FAL AI çalışmıyor
```bash
# FAL_KEY kontrolü
echo $FAL_KEY
grep FAL_KEY .env
```

**Problem:** WebSocket bağlantı hatası
- Önce POST /api/game/{id}/start çağır
- Game loop başlamalı
- Sonra WS /ws/{game_id}/{player_id} bağlan

## 📜 Lisans

MIT License — FAL AI Hackathon Projesi

---

**Geliştirici:** Efe Baydemir  
**Tarih:** 2024  
**Hackathon:** FAL AI Türkiye
