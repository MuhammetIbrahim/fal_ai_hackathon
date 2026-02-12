# B2B Character AI API - Implementation Plan

## Context

Mentör önerisi: Oyundaki karakter AI sistemini B2B API olarak paketleyip, diğer oyun stüdyolarının kullanabileceği bir servis haline getirmek. Mevcut `src/prototypes/` altındaki generate_characters, campfire (dialogue), world_gen, game_state (memory) ve `fal_services.py` (TTS/STT/LLM/Avatar) bileşenleri zaten var. Bunları **oyun-bağımsız** (game-agnostic) bir API olarak expose edeceğiz.

---

## Yapı

```
api/
├── main.py                    # FastAPI app factory + lifespan
├── config.py                  # Pydantic Settings (API_KEY auth, FAL_KEY, model config)
├── deps.py                    # Dependency injection (API key → tenant_id)
├── errors.py                  # Standart error schema + exception handlers
├── jobs.py                    # Async job manager + GET /v1/jobs/{id} router
├── store.py                   # Tenant-scoped in-memory store
│
├── shared/
│   └── schemas.py             # ErrorResponse, PaginatedResponse, JobStatusResponse
│
├── characters/                # Karakter domain
│   ├── router.py              # CRUD + speak + react endpoints
│   ├── schema.py              # Request/Response modelleri
│   ├── service.py             # Karakter üretimi + diyalog + moderasyon
│   └── memory.py              # Karakter hafıza yönetimi
│
├── worlds/                    # Dünya domain
│   ├── router.py              # World seed endpoints
│   ├── schema.py
│   └── service.py             # Dünya seed üretimi (world_gen.py wrap)
│
├── voice/                     # Ses domain
│   ├── router.py              # TTS (async job) + STT (sync) + voice list
│   ├── schema.py
│   └── service.py             # TTS/STT wrapper (fal_services wrap)
│
├── images/                    # Görsel domain
│   ├── router.py              # Avatar + Background (async job)
│   ├── schema.py              # Genişletilmiş FLUX params
│   └── service.py             # Avatar/Background üretimi (FLUX wrapper)
│
├── prompts/                   # Shared — tüm domain'ler kullanıyor
│   ├── character_gen.py       # Acting prompt üretim system prompt'ları
│   ├── dialogue.py            # Konuşma system prompt'ları
│   └── moderation.py          # Moderasyon system prompt'ları
│
└── data/
    └── defaults.json          # Varsayılan roller, arketipler, isimler (data.json'dan)
```

---

## API Endpoints

### Characters
| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/v1/characters` | Karakter oluştur (rol, arketip, dünya konteksti ile) |
| `GET` | `/v1/characters` | Karakter listesi (paginated: `?limit=50&offset=0`) |
| `GET` | `/v1/characters/{id}` | Karakter bilgisi getir |
| `POST` | `/v1/characters/{id}/speak` | Karakter konuşturma (bağlam + geçmiş ile) |
| `POST` | `/v1/characters/{id}/react` | Bir mesaja tepki ver (WANT/PASS + sebep) |
| `GET` | `/v1/characters/{id}/memory` | Karakter hafızası |
| `PATCH` | `/v1/characters/{id}` | Karakter güncelle (lore, personality, mood) |
| `DELETE` | `/v1/characters/{id}` | Karakter sil |
| `POST` | `/v1/characters/batch` | Toplu karakter üretimi (oyun başlangıcı için) |

### Worlds
| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/v1/worlds` | Dünya seed üret (deterministik) |
| `GET` | `/v1/worlds/{id}` | Dünya bilgisi getir |

### Voice
| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/v1/voice/tts` | Metin → Ses → **202 + job_id** (async) |
| `POST` | `/v1/voice/stt` | Ses → Metin (sync, hızlı) |
| `GET` | `/v1/voice/voices` | Kullanılabilir ses listesi |

### Images (FLUX)
| Method | Path | Açıklama |
|--------|------|----------|
| `POST` | `/v1/images/avatar` | Karakter avatar üret → **202 + job_id** (async) |
| `POST` | `/v1/images/background` | Sahne arka plan üret → **202 + job_id** (async) |

### Jobs (Async Pattern)
| Method | Path | Açıklama |
|--------|------|----------|
| `GET` | `/v1/jobs/{job_id}` | Job durumu sorgula (pending/processing/completed/failed) |

### System
| Method | Path | Açıklama |
|--------|------|----------|
| `GET` | `/health` | Sağlık kontrolü |
| `GET` | `/` | API bilgisi |

---

## P0 Özellikler (Hackathon'da Implement Edilecek)

### 1. Async Job Pattern

Image ve TTS üretimi 5-30 saniye sürebilir. Senkron bekletmek B2B'de kabul edilemez.

**Akış:**
```
POST /v1/images/avatar → 202 { "job_id": "job_xxx", "status": "pending" }
GET  /v1/jobs/job_xxx  → { "status": "processing" }
GET  /v1/jobs/job_xxx  → { "status": "completed", "result": { "image_url": "..." } }
```

**`api/jobs.py` — Job Manager:**
```python
@dataclass
class Job:
    job_id: str
    tenant_id: str
    type: str          # "avatar" | "background" | "tts"
    status: str        # "pending" | "processing" | "completed" | "failed"
    result: dict | None
    error: dict | None
    created_at: datetime
    completed_at: datetime | None

class JobManager:
    _jobs: dict[str, Job] = {}

    def submit(self, tenant_id, type, coro) -> Job  # asyncio.create_task
    def get(self, job_id, tenant_id) -> Job | None
    def cleanup_old(self, max_age_hours=24)          # TTL
```

- `asyncio.create_task()` ile arka planda çalıştır
- Job store'da tenant-scoped tut
- 24 saat sonra otomatik cleanup (TTL)

### 2. Standart Error Schema

Tüm error'lar aynı formatta:

```python
# api/shared/schemas.py
class ErrorDetail(BaseModel):
    code: str          # "CHAR_NOT_FOUND", "INVALID_ROLE", "FAL_SERVICE_ERROR"
    message: str       # Human-readable açıklama
    details: dict = {} # Opsiyonel ek bilgi

class ErrorResponse(BaseModel):
    error: ErrorDetail
```

**`api/errors.py` — Exception sınıfları:**
```python
class APIError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, details: dict = {}): ...

class NotFoundError(APIError):     # 404
class ValidationError(APIError):   # 422
class ServiceError(APIError):      # 502 (fal.ai down)
class TenantError(APIError):       # 403
```

`main.py`'de global exception handler ile yakalanır, ErrorResponse formatında döner.

### 3. Multi-Tenancy (Tenant-Scoped Store)

Her API key = bir tenant. Tenant'ın datası izole.

**`api/deps.py`:**
```python
async def get_tenant(authorization: str = Header(...)) -> str:
    key = authorization.replace("Bearer ", "")
    tenant = settings.API_KEYS.get(key)
    if not tenant:
        raise APIError("INVALID_API_KEY", "Geçersiz API key", 401)
    return tenant  # tenant_id döner
```

**`api/store.py` — Tenant-Scoped:**
```python
# Tüm veriler tenant_id ile namespace'lenir
_characters: dict[str, dict[str, Character]] = {}   # {tenant_id: {char_id: Character}}
_worlds: dict[str, dict[str, WorldSeed]] = {}
_memories: dict[str, dict[str, list]] = {}
_jobs: dict[str, dict[str, Job]] = {}

def get_character(tenant_id: str, char_id: str) -> Character | None
def list_characters(tenant_id: str, limit: int, offset: int) -> tuple[list, int]
```

**`api/config.py`:**
```python
API_KEYS: dict[str, str] = {
    "demo-key-123": "tenant_demo",
    "test-key-456": "tenant_test",
}
```

### 4. Genişletilmiş Image Schema

```python
class AvatarRequest(BaseModel):
    description: str = Field(..., description="Karakter fiziksel tanımı")
    style: str = Field("pixel_art", description="pixel_art | realistic | anime | painterly")
    custom_style_prompt: str | None = Field(None, description="Serbest stil prompt override")
    world_tone: str = Field("dark fantasy medieval", description="Dünya atmosferi")
    width: int = Field(512, ge=256, le=1024)
    height: int = Field(512, ge=256, le=1024)
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0)
    num_inference_steps: int = Field(28, ge=10, le=50)
    seed: int | None = Field(None, description="Deterministik üretim için seed")
    negative_prompt: str | None = Field(None, description="İstenmeyen öğeler")
    model: str = Field("dev", description="dev | schnell | pro — schnell hızlı/düşük kalite, pro yavaş/yüksek kalite")

class BackgroundRequest(BaseModel):
    prompt: str = Field(..., description="Sahne açıklaması")
    style: str = Field("pixel_art", description="pixel_art | realistic | anime | painterly")
    custom_style_prompt: str | None = Field(None, description="Serbest stil prompt override")
    width: int = Field(1344, ge=512, le=2048, description="Background default 1344")
    height: int = Field(768, ge=512, le=2048, description="Background default 768")
    guidance_scale: float = Field(7.5, ge=1.0, le=20.0)
    num_inference_steps: int = Field(28, ge=10, le=50)
    seed: int | None = Field(None, description="Deterministik üretim için seed")
    negative_prompt: str | None = Field(None, description="İstenmeyen öğeler")
    model: str = Field("dev", description="dev | schnell | pro")

class JobSubmitResponse(BaseModel):
    job_id: str
    status: str  # "pending"

class ImageJobResult(BaseModel):
    image_url: str
    seed_used: int
    width: int
    height: int
    inference_time_ms: float | None
```

---

## Dosya Detayları

### Root Dosyalar (`api/`)

#### `api/main.py`
- `create_app()` factory pattern (mevcut `src/main.py` ile aynı pattern)
- CORS middleware, TimingMiddleware
- Lifespan: FAL init + store init + job cleanup scheduler
- Domain router'ları include: `characters.router`, `worlds.router`, `voice.router`, `images.router`, `jobs.jobs_router`
- Global exception handler → ErrorResponse formatında döner

#### `api/config.py`
- `APISettings(BaseSettings)`: FAL_KEY, API_KEYS (dict), HOST, PORT, DEBUG
- Model config: GENERATION_MODEL, DIALOGUE_MODEL, VALIDATION_MODEL, temperatures
- Job config: JOB_TTL_HOURS (default 24)
- `get_api_settings()` singleton

#### `api/deps.py`
- `get_tenant(authorization: str = Header(...)) -> str` — Bearer token → tenant_id
- Router'larda `dependencies=[Depends(get_tenant)]`
- Tenant ID tüm service çağrılarına geçirilir

#### `api/errors.py`
- `APIError`, `NotFoundError`, `ValidationError`, `ServiceError` exception sınıfları
- `register_error_handlers(app)` → global exception handler kaydı

#### `api/jobs.py`
- `JobManager` class — submit, get, cleanup (`asyncio.create_task()` ile background execution)
- `jobs_router = APIRouter()` — `GET /v1/jobs/{job_id}` (tek endpoint, ayrı dosya gereksiz)
- Tenant-scoped job store
- Auto-cleanup (lifespan'da schedule)

#### `api/store.py`
Tenant-scoped in-memory store:
- Her CRUD fonksiyonu `tenant_id` alır
- `list_*` fonksiyonları `limit` + `offset` destekler (pagination)
- TTL: `cleanup_expired(max_age_hours)` — lifespan'da periyodik çağrılır

#### `api/shared/schemas.py`
- `ErrorResponse` — standart error formatı
- `PaginatedResponse` — `items`, `total`, `limit`, `offset`
- `JobStatusResponse` — `job_id`, `status`, `result`, `error`, `created_at`

### Characters Domain (`api/characters/`)

#### `api/characters/router.py`
- `POST /v1/characters` → `service.create_character(tenant_id, ...)`
- `GET /v1/characters` → `store.list_characters(tenant_id, limit, offset)`
- `POST /v1/characters/batch` → `service.create_batch(tenant_id, ...)`
- `GET /v1/characters/{id}` → `store.get_character(tenant_id, id)`
- `PATCH /v1/characters/{id}` → `store.update_character(tenant_id, id, ...)`
- `POST /v1/characters/{id}/speak` → `service.generate_speech(tenant_id, ...)`
- `POST /v1/characters/{id}/react` → `service.generate_reaction(tenant_id, ...)`
- `GET /v1/characters/{id}/memory` → `memory.get_memory(tenant_id, id)`
- `DELETE /v1/characters/{id}` → `store.delete_character(tenant_id, id)`

#### `api/characters/schema.py`
- `CreateCharacterRequest`, `BatchCreateRequest`, `SpeakRequest`, `ReactRequest`
- `CharacterResponse`, `SpeechResponse`, `ReactionResponse`, `MemoryResponse`

#### `api/characters/service.py`
Reuse:
- `src/prototypes/generate_characters.py` → character generation + validation
- `src/prototypes/campfire.py` → dialogue + moderation
- `fal_services.py` → `llm_generate()`, `llm_stream()`

Fonksiyonlar:
- `create_character(tenant_id, role, archetype, world_context, skill_tier, custom_lore)` → Character
- `create_batch(tenant_id, count, world_id, roles, archetypes)` → List[Character]
- `generate_speech(tenant_id, character_id, context_messages, game_context, mood)` → SpeechResult
- `generate_reaction(tenant_id, character_id, last_message, context)` → ReactionResult
- `moderate(text, taboo_words)` → ModerationResult

#### `api/characters/memory.py`
Reuse: `src/prototypes/campfire.py` → `summarize_campfire()` pattern
- Tenant-scoped memory store

### Worlds Domain (`api/worlds/`)

#### `api/worlds/router.py`
- `POST /v1/worlds` → `service.generate_world(tenant_id, ...)`
- `GET /v1/worlds/{id}` → `store.get_world(tenant_id, id)`

#### `api/worlds/schema.py`
- `CreateWorldRequest`, `WorldResponse`

#### `api/worlds/service.py`
Reuse: `src/prototypes/world_gen.py` → `generate_world_seed()`, `render_world_brief()`, `render_scene_cards()`

### Voice Domain (`api/voice/`)

#### `api/voice/router.py`
- `POST /v1/voice/tts` → **202** `job_manager.submit(tenant_id, "tts", service.tts(...))`
- `POST /v1/voice/stt` → **200** `service.speech_to_text(...)` (sync, hızlı)
- `GET /v1/voice/voices` → kullanılabilir ses listesi (statik)

#### `api/voice/schema.py`
- `TTSRequest`, `STTRequest`, `VoiceListResponse`

#### `api/voice/service.py`
Reuse: `fal_services.py` → `tts_generate()`, `transcribe_audio()`

### Images Domain (`api/images/`)

#### `api/images/router.py`
- `POST /v1/images/avatar` → **202** `job_manager.submit(tenant_id, "avatar", service.avatar(...))`
- `POST /v1/images/background` → **202** `job_manager.submit(tenant_id, "background", service.bg(...))`

#### `api/images/schema.py`
- `AvatarRequest`, `BackgroundRequest`, `ImageJobResult` (yukarıdaki P0 şemalarından)

#### `api/images/service.py`
Reuse: `fal_services.py` → `generate_avatar()`, `generate_background()`
- Genişletilmiş parametreler: width, height, seed, negative_prompt, guidance_scale, num_inference_steps
- Style preset'leri → prompt prefix mapping

### Shared (`api/prompts/`, `api/data/`)

#### `api/prompts/`
- `character_gen.py`: ACTING_PROMPT_SYSTEM, VALIDATOR_SYSTEM
- `dialogue.py`: CHARACTER_WRAPPER, REACTION_SYSTEM
- `moderation.py`: MODERATOR_SYSTEM

#### `api/data/defaults.json`
`src/prototypes/data.json`'dan kopyala: roles, archetypes, skill_tiers, names_pool

---

## Implementation Order

1. **Temel iskelet**: `api/main.py`, `api/config.py`, `api/deps.py`, `api/errors.py`, `api/store.py` — app ayağa kalksın
2. **Shared schemas**: `api/shared/schemas.py` — ErrorResponse, PaginatedResponse, JobStatusResponse
3. **Job manager**: `api/jobs.py` — JobManager class + `GET /v1/jobs/{id}` router (aynı dosyada)
4. **Worlds domain**: `api/worlds/router.py` + `schema.py` + `service.py` — en basit, world_gen.py'yi wrap et
5. **Characters domain (CRUD)**: `api/characters/router.py` + `schema.py` + `service.py` — create + list + get + PATCH + delete
6. **Characters speak**: `api/characters/router.py`'ye `/speak` endpoint — dialogue generation
7. **Characters react + memory**: `api/characters/router.py`'ye `/react` + `/memory` + `api/characters/memory.py`
8. **Voice domain**: `api/voice/router.py` + `schema.py` + `service.py` — TTS (async job) + STT (sync) + voices
9. **Images domain**: `api/images/router.py` + `schema.py` + `service.py` — Avatar + Background (async job, genişletilmiş params)
10. **Prompts extraction**: `api/prompts/` — system prompt'ları ayrı dosyalara taşı
11. **Batch endpoint**: `api/characters/router.py`'ye `/batch` — toplu karakter üretimi

---

## Verification

1. `uvicorn api.main:app --reload --port 9000`
2. `http://localhost:9000/docs` → Swagger UI açılsın
3. Test: Error format → invalid request → `{ "error": { "code": "...", "message": "..." } }`
4. Test: `POST /v1/worlds` → dünya üret
5. Test: `POST /v1/characters` → karakter üret (tenant-scoped)
6. Test: `POST /v1/characters/{id}/speak` → konuştur
7. Test: `GET /v1/characters/{id}/memory` → hafıza kontrol
8. Test: `POST /v1/voice/tts` → 202 + job_id → `GET /v1/jobs/{id}` → completed
9. Test: `POST /v1/images/avatar` → 202 + job_id → `GET /v1/jobs/{id}` → completed
10. Test: Farklı API key ile → farklı tenant datası (izolasyon)

---

## Key Reuse Map

| Yeni Dosya | Kaynak | Ne alınıyor |
|------------|--------|-------------|
| `api/characters/service.py` | `src/prototypes/generate_characters.py` | `create_character_slots()`, `generate_acting_prompt()`, validation |
| `api/characters/service.py` | `src/prototypes/campfire.py` | `character_speak()` prompt yapısı, `get_reaction()`, `moderator_check()` |
| `api/characters/memory.py` | `src/prototypes/campfire.py` | `summarize_campfire()` pattern |
| `api/worlds/service.py` | `src/prototypes/world_gen.py` | `generate_world_seed()`, `WorldSeed`, `render_world_brief()` |
| `api/voice/service.py` | `fal_services.py` | `tts_generate()`, `transcribe_audio()` |
| `api/images/service.py` | `fal_services.py` | `generate_avatar()`, `generate_background()` |
| `api/prompts/*` | `src/prototypes/campfire.py`, `generate_characters.py` | Tüm system prompt sabitleri |
| `api/data/defaults.json` | `src/prototypes/data.json` | Roller, arketipler, isimler, tier'lar |
| `api/store.py` | `src/core/database.py` | In-memory dict pattern (tenant-scoped) |
| `api/main.py` | `src/main.py` | App factory, lifespan, middleware pattern |
| `api/config.py` | `src/core/config.py` | Pydantic BaseSettings pattern |

---

## Roadmap (Post-Hackathon)

Demo'da slide olarak gösterilecek, hackathon'da implement edilmeyecek:

### P1 — Kısa Vadeli
- **Rate limiting** — Tier-based (free: 100 req/h, pro: 10K req/h) via middleware
- **Usage tracking** — Request count, token usage, image count per tenant (billing için)
- **Pagination** — `?limit=50&offset=0` tüm list endpoint'lerinde
- **Multi-character conversation** — `POST /v1/conversations` ile N karakter arası diyalog
- **Streaming TTS** — WebSocket veya SSE ile PCM16 chunk streaming
- **Webhook callbacks** — Job tamamlandığında müşteri URL'ine POST

### P2 — Orta Vadeli
- **Image-to-image variation** — Mevcut avatar'dan varyasyon üret
- **Caching** — Aynı karakter+context = cache hit (Redis)
- **Persistent storage** — PostgreSQL/Redis (in-memory yerine)
- **SDK'lar** — Python, JavaScript, Unity SDK
- **Analytics dashboard** — Müşteri portalı ile kullanım görüntüleme

### P3 — Uzun Vadeli
- **Fine-tuned modeller** — Müşteriye özel karakter modelleri
- **Voice cloning** — Özel karakter sesleri
- **Multiplayer orchestration** — Tam oyun loop yönetimi (bizim oyundan extract)
- **Marketplace** — Karakter/dünya template'leri satışı
