# B2B Character AI API - Implementation Plan

## Context

Game-agnostic Character AI API. Herhangi bir oyun studyosu kendi oyununun evrenini, kurallarini, karakterlerini tanimlayip bizim AI servisimiz uzerinden:
- LLM ile karakter uretimi ve diyalog
- TTS/STT ile ses
- FLUX ile avatar/background gorselleri

uretebilir. Consumer kendi dunyasini, tone'unu, taboo kelimelerini gonderir — API tamamen game-agnostic calisir.

**Platform dili: TURKCE ONLY.** Tum prompt'lar, tum default veriler, tum karakter konusmalari Turkce. `language` field'i yok — platform tamamen Turkce calisir. Freya AI (TTS/STT) zaten full Turkish.

### Mimari Karar: Bagimsizlik

```
api/     → B2B API (BAGIMSIZ PAKET — src/ ASLA import edilmez)
  ↓ kullanir
fal_services.py  → fal.ai wrapper (ortak — hem api/ hem src/ kullanabilir)
  ↓ kullanir
fal.ai   → LLM, TTS, STT, FLUX
```

**KURAL: `api/` icinden `src/` veya `src/prototypes/` ASLA import edilmez.**
Prototip dosyalari (generate_characters.py, campfire.py, world_gen.py) sadece **pattern referansi** olarak kullanilir — kod kopyalanmaz, import edilmez. API kendi bagimsiz implementasyonunu yapar.

---

## Implementation Status

| Faz | Durum | Aciklama |
|-----|-------|----------|
| Faz 1 — Altyapi | ✅ TAMAM | main.py, config.py, deps.py, errors.py, jobs.py, store.py, shared/schemas.py |
| Faz 1 — Worlds | ✅ TAMAM (refactor gerekli) | router + schema + service calisiyor, ama src/ bagimliligi var |
| Faz 2 — Characters | 🔴 YAPILACAK | schema, service, memory, router, prompts, defaults |
| Faz 3 — Voice | 🔴 YAPILACAK | TTS (async job) + STT (sync) + voice list |
| Faz 4 — Images | 🔴 YAPILACAK | Avatar + Background (async job, genisletilmis FLUX params) |
| Faz 5 — Worlds refactor | 🔴 YAPILACAK | src/ bagimliligi kir, LLM ile runtime world gen veya sadece custom mode |

---

## Yapi

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
│   ├── router.py              # CRUD + speak + react + memory endpoints
│   ├── schema.py              # Request/Response modelleri
│   ├── service.py             # Karakter uretimi + diyalog + moderasyon
│   └── memory.py              # Karakter hafiza yonetimi
│
├── worlds/                    # Dunya domain
│   ├── router.py              # World CRUD endpoints
│   ├── schema.py              # Game-agnostic world schema
│   └── service.py             # Custom world + opsiyonel LLM-based gen
│
├── voice/                     # Ses domain
│   ├── router.py              # TTS (async job) + STT (sync) + voice list
│   ├── schema.py
│   └── service.py             # fal_services.py wrapper
│
├── images/                    # Gorsel domain
│   ├── router.py              # Avatar + Background (async job)
│   ├── schema.py              # Genisletilmis FLUX params
│   └── service.py             # fal_services.py wrapper + style presets
│
├── prompts/                   # System prompt'lari (TURKCE)
│   ├── character_gen.py       # ACTING_PROMPT_SYSTEM, VALIDATOR_SYSTEM
│   ├── dialogue.py            # CHARACTER_WRAPPER, REACTION_SYSTEM
│   └── moderation.py          # MODERATOR_SYSTEM
│
└── data/
    └── defaults.json          # Varsayilan roller, arketipler, isimler (Turkce, fantazi)
```

---

## API Endpoints

### Characters
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/characters` | Create character (preset OR fully custom) |
| `GET` | `/v1/characters` | List characters (paginated: `?limit=50&offset=0`) |
| `POST` | `/v1/characters/batch` | Batch character creation |
| `GET` | `/v1/characters/{id}` | Get character details |
| `PATCH` | `/v1/characters/{id}` | Update character (lore, personality, system_prompt) |
| `DELETE` | `/v1/characters/{id}` | Delete character |
| `POST` | `/v1/characters/{id}/speak` | Character dialogue (custom system_prompt supported) |
| `POST` | `/v1/characters/{id}/react` | Character reaction to a message |
| `GET` | `/v1/characters/{id}/memory` | Character conversation memory |

### Worlds
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/worlds` | Create world (custom JSON — consumer defines their universe) |
| `GET` | `/v1/worlds/{id}` | Get world details |

### Voice
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/voice/tts` | Text → Speech → **202 + job_id** (async) |
| `POST` | `/v1/voice/stt` | Speech → Text (sync) |
| `GET` | `/v1/voice/voices` | Available voice list |

### Images (FLUX)
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/images/avatar` | Generate character avatar → **202 + job_id** (async) |
| `POST` | `/v1/images/background` | Generate scene background → **202 + job_id** (async) |

### Jobs (Async Pattern)
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/jobs/{job_id}` | Poll job status (pending/processing/completed/failed) |

### System
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/` | API info |

---

## P0 Features (Implemented)

### 1. Async Job Pattern ✅
Image ve TTS uretimi 5-30 saniye surebilir. Senkron bekletmek B2B'de kabul edilemez.

```
POST /v1/images/avatar → 202 { "job_id": "job_xxx", "status": "pending" }
GET  /v1/jobs/job_xxx  → { "status": "processing" }
GET  /v1/jobs/job_xxx  → { "status": "completed", "result": { "image_url": "..." } }
```

`api/jobs.py` — JobManager: `asyncio.create_task()` ile background execution, tenant-scoped, 24h TTL.

### 2. Standard Error Schema ✅
Tum error'lar ayni formatta:
```json
{
  "error": {
    "code": "CHAR_NOT_FOUND",
    "message": "Character 'abc123' not found",
    "details": {}
  }
}
```

Exception hierarchy: `APIError` → `NotFoundError(404)`, `ValidationError(422)`, `ServiceError(502)`, `TenantError(401)`

### 3. Multi-Tenancy ✅
Her API key = bir tenant. Tenant datasi izole.

```
Authorization: Bearer demo-key-123  →  tenant_id: "tenant_demo"
```

Tum store operasyonlari `tenant_id` ile namespace'lenir. Tenant A, Tenant B'nin karakterlerini goremez.

---

## Characters Domain — Detail (FAZ 2)

### `api/characters/schema.py`

```python
class CreateCharacterRequest(BaseModel):
    # Core — hepsi opsiyonel, verilmezse defaults.json'dan random secilir
    name: str | None           # Karakter adi
    role: str | None           # Rol/meslek (orn: "Kasap", "Sifaci", "Simyaci")
    archetype: str | None      # Kisilik arketipi (orn: "Supheci Sessiz", "Saldirgan")

    # Dunya baglami — karakter hangi evrende yasayacak
    world_id: str | None       # Onceden olusturulan world'e bagla
    world_context: str | None  # VEYA serbest metin olarak dunya bilgisi ver

    # Custom kisilik
    lore: str | None           # Karakter gecmisi
    personality: str | None    # Kisilik ozellikleri
    system_prompt: str | None  # Tam override — verilirse LLM uretimi atlanir

    # Config
    skill_tier: str | None     # "caylak" | "orta" | "uzman"

class BatchCreateRequest(BaseModel):
    count: int = Field(..., ge=1, le=20)
    world_id: str | None = None
    world_context: str | None = None
    roles: list[str] | None = None
    archetypes: list[str] | None = None

class SpeakRequest(BaseModel):
    message: str                          # Kullanicinin mesaji veya baglam tetikleyicisi
    context_messages: list[dict] | None   # Onceki konusma [{role, content}]
    game_context: str | None              # Ek oyun durum bilgisi
    mood: str | None                      # Karakter ruh hali override
    system_prompt_override: str | None    # Gecici system prompt override

class ReactRequest(BaseModel):
    message: str                          # Tepki verilecek mesaj
    context: str | None                   # Ek baglam

class UpdateCharacterRequest(BaseModel):
    name: str | None = None
    lore: str | None = None
    personality: str | None = None
    system_prompt: str | None = None

class CharacterResponse(BaseModel):
    id: str
    name: str
    role: str
    archetype: str
    lore: str | None
    personality: str | None
    acting_prompt: str
    skill_tier: str | None
    world_id: str | None
    created_at: str
    updated_at: str | None

class SpeechResponse(BaseModel):
    character_id: str
    character_name: str
    message: str
    mood: str | None
    moderation: dict | None    # {passed: bool, reason: str | None}

class ReactionResponse(BaseModel):
    character_id: str
    character_name: str
    reaction: str
    wants_to_speak: bool

class MemoryResponse(BaseModel):
    character_id: str
    exchanges: list[dict]
    total: int
```

### `api/characters/service.py`

**Import rules:**
- `from fal_services import llm_generate` — LLM cagirilari
- `from api.prompts import ...` — system prompt'lari
- `from api import store` — data persistence
- `from api.config import get_api_settings` — model/temperature config
- **ASLA** `from src...` import yok

**Functions:**
```python
async def create_character(tenant_id, req) -> dict
    # 1. Name/role/archetype yoksa → defaults.json'dan random sec
    # 2. system_prompt verilmisse → direkt kullan, LLM cagirma
    # 3. Yoksa → LLM ile acting_prompt uret (ACTING_PROMPT_SYSTEM)
    # 4. Opsiyonel validate (VALIDATOR_SYSTEM)
    # 5. store.save_character()
    # 6. Return character dict

async def create_batch(tenant_id, req) -> list[dict]
    # asyncio.gather ile paralel create_character

async def generate_speech(tenant_id, char_id, req) -> dict
    # 1. store'dan karakter al
    # 2. World context olustur (world_id varsa store'dan, yoksa req'ten)
    # 3. CHARACTER_WRAPPER prompt'unu doldur
    # 4. llm_generate() cagir (DIALOGUE_MODEL, DIALOGUE_TEMPERATURE)
    # 5. moderate() cagir
    # 6. Memory'ye exchange ekle
    # 7. Return SpeechResponse

async def generate_reaction(tenant_id, char_id, req) -> dict
    # 1. store'dan karakter al
    # 2. REACTION_SYSTEM prompt'unu doldur
    # 3. llm_generate() cagir
    # 4. Parse: wants_to_speak (bool) + reaction text
    # 5. Return ReactionResponse

async def moderate(text, taboo_words, rules) -> dict
    # MODERATOR_SYSTEM ile kontrol
    # Return {passed: bool, reason: str | None}
```

### `api/characters/memory.py`
```python
async def get_memory(tenant_id, char_id) -> dict
async def add_to_memory(tenant_id, char_id, exchange) -> None
async def summarize_memory(tenant_id, char_id) -> str  # LLM ile ozet
```

### `api/characters/router.py`
- Tum endpoints `tenant_id: str = Depends(get_tenant)` alir
- `/batch` endpoint'i `/{id}` endpoint'inden ONCE tanimlanir (FastAPI path matching)
- Karakter bulunamazsa `NotFoundError` firlatir

---

## Prompts — Game-Agnostic, TURKCE ONLY

Tum system prompt'lari Turkce yazilir. Dil secenegi yok — platform full Turkce.

### `api/prompts/character_gen.py`
```
ACTING_PROMPT_SYSTEM:
  "Sen bir karakter yazarisin. Verilen rol, arketip, gecmis hikayesi ve dunya baglamina gore
   birinci sahis bir acting prompt uret. Bu prompt, karakterin nasil konustugunu, dusundugunu
   ve davrandigini tanimlamali. Prompt, dunyanin atmosferi ile tutarli ve surukleyici olmali.
   Turkce yaz. Dunya: {world_context}. Karakterden ASLA cikma."

VALIDATOR_SYSTEM:
  "Bu acting prompt'u tutarlilik acisindan degerlendir. Kontrol et: role uygunluk, kisilik
   tutarliligi, celiskiler. Ciktinin tam formati: PASS veya FAIL: <sebep>"
```

### `api/prompts/dialogue.py`
```
CHARACTER_WRAPPER:
  "Sen {name} adinda bir {role_title}'sin. {acting_prompt}
   Dunya: {world_context}
   Su anki ruh halin: {mood}
   Onceki konusma: {conversation_history}
   Karakter olarak Turkce yanitla."

REACTION_SYSTEM:
  "Sen {name}'sin. Su anda bunu duydun: '{message}'.
   Kisiligin ({archetype}) ve mevcut baglam dogrultusunda ic tepkini ifade et.
   Format: Ilk satirda WANT veya PASS, sonra Turkce tepki metni."
```

### `api/prompts/moderation.py`
```
MODERATOR_SYSTEM:
  "Bu karakter konusmasini ihlaller acisindan kontrol et:
   - Yasakli kelimeler: {taboo_words}
   - Kurallar: {rules}
   - Karakter-disi davranis
   - Gercek dunya referanslari (dunya kurgusal ise)
   Ciktinin tam formati: PASS veya VIOLATION: <sebep>"
```

**Tum prompt'lar:**
- Full Turkce — dil secenegi yok
- `{world_context}`, `{taboo_words}`, `{rules}` consumer'dan gelir

---

## Data Defaults — `api/data/defaults.json`

Consumer hicbir sey gondermezse kullanilacak fallback verisi. `src/prototypes/data.json`'dan alinir, Turkce:

```json
{
  "archetypes": [
    {"label": "Supheci Sessiz", "description": "Az konusur, gozlemler, guven vermez", "speech_style": "Kisa cumleler, belirsiz ifadeler"},
    {"label": "Supheci Konuskan", "description": "Cok soru sorar, detay arar, herkesi sorguya ceker", "speech_style": "Soru agirlikli, araştirmaci"},
    {"label": "Saldirgan", "description": "Sert, dogrudan, korkutmaya calisan", "speech_style": "Emredici, kisa, agresif ton"},
    {"label": "Sakin Az Konusan", "description": "Duygusuz gorunur, sadece gerektiginde konusur", "speech_style": "Olculu, soguk, az kelime"},
    {"label": "Cekici Manipulator", "description": "Iltifat eder, guven kazanir, arka planda oynar", "speech_style": "Sicak, ikna edici, yumusak"},
    {"label": "Duru Idealist", "description": "Ilkelere bagli, adalet arar, fedakar gorunur", "speech_style": "Ilkeli, ciddi, motive edici"}
  ],
  "role_titles": [
    {"title": "Kasap", "lore": "Koydeki hayvan kesimlerini yapar, guclu ve sessiz biridir"},
    {"title": "Sifaci", "lore": "Bitki ve merhemlerle hastalari iyilestirmeye calisir"},
    {"title": "Avci", "lore": "Ormanda iz surer, yaban hayati tanir, yalniz gezmeyi sever"},
    {"title": "Tuccar", "lore": "Kervanlarla mal tasir, pazarlik ustasi, her yeri bilir"},
    {"title": "Demirci", "lore": "Kor ateste metal dover, sabahtan aksama ocagin basinda"},
    {"title": "Nobetci", "lore": "Surlarda gece nobet tutar, disaridan geleni ilk o gorur"},
    {"title": "Simyaci", "lore": "Iksirler ve karisimlar hazirlar, gizemli deneyler yapar"},
    {"title": "Ozan", "lore": "Sarkilar soyler, hikayeleri aktarir, herkesin sirrini bilir"},
    {"title": "Ciftci", "lore": "Tarlada calisir, topragi tanir, sade ve durust biridir"},
    {"title": "Haritaci", "lore": "Bolgenin haritalarini cizer, kayip yollari bilir"},
    {"title": "Balikci", "lore": "Gol basinda yasayan, sabahci ve sabirli biri"},
    {"title": "Marangoz", "lore": "Ahsap isler yapar, koydeki evlerin cogu onun eseri"},
    {"title": "Kaptan", "lore": "Nehir gemilerini yonetir, deniz hikayeleri anlatir"},
    {"title": "Kutuphaneci", "lore": "Eski yazmalari korur, tarihi bilir, iccedir"},
    {"title": "Bahcivan", "lore": "Sifali otlar yetistirir, dogayla ic icedir"},
    {"title": "Terzi", "lore": "Kumastan her sey diker, koyde herkesin olcusunu bilir"},
    {"title": "Madenci", "lore": "Yeralti tünellerinde calisir, karanliga aliskin"},
    {"title": "Muhendis", "lore": "Su degirmeni ve kopru tasarimcisi, mekanik zeka"},
    {"title": "Surgun Rahip", "lore": "Eski tapinagin son rahibi, toplumdan dislanmis"},
    {"title": "Ejderha Avcisi", "lore": "Efsanevi yaratiklari avladigini iddia eder"}
  ],
  "skill_tiers": [
    {"tier": "caylak", "modifier": "Basit ve cekinik yanitlar ver, kisa cumle kur, belirsizlik goster"},
    {"tier": "orta", "modifier": "Dogal ve olculu yanitla, orta detay seviyesi, tutarli kal"},
    {"tier": "uzman", "modifier": "Otoriter konus, zengin kelime haznesi kullan, derinlikli yanitla"}
  ],
  "names_pool": ["Kael", "Mirra", "Theron", "Lyra", "Dorian", "Selene", "Caspian",
                  "Freya", "Roland", "Iris", "Magnus", "Petra", "Aldric", "Yara",
                  "Lucan", "Ember", "Soren", "Dalia", "Orion", "Niara"]
}
```

---

## Worlds Domain — Refactor Plan (FAZ 5)

Mevcut `api/worlds/service.py` sorun: `from src.prototypes.world_gen import ...` — bu B2B bagimsizligini bozuyor.

### Cozum:
1. **Custom-only mode (oncelik):** Consumer kendi dunyasini JSON olarak gonderir. Auto-generate kaldirilir.
2. **LLM-based auto-gen (opsiyonel):** `game_id` verilirse, `fal_services.llm_generate()` ile runtime'da dunya uretilir — `src/` import etmeden.

### Guncel WorldResponse (game-agnostic):
```python
class WorldResponse(BaseModel):
    id: str
    name: str | None
    description: str | None
    tone: str | None
    setting: dict | None        # Free-form: locations, season, atmosphere
    rules: dict | None          # Speech rules, restrictions
    taboo_words: list[str] | None
    metadata: dict | None       # Studio-specific extra data
    world_brief: str | None     # LLM-generated narrative summary (optional)
    created_at: str
```

Oyun-spesifik alanlar (`ocak_rengi`, `mask_source`, `council_style`, `myth_variant`, `rituals`, `mechanic_skin`, `daily_omens`, `place_variants`, `scene_cards`) **KALDIRILDI**. Consumer bunlari `setting` veya `metadata` dict'inin icine koyabilir.

---

## Voice Domain — Detail (FAZ 3)

### `api/voice/schema.py`
```python
class TTSRequest(BaseModel):
    text: str
    voice: str = "alloy"       # Voice ID
    speed: float = 1.0
    response_format: str = "mp3"

class STTRequest(BaseModel):
    audio_url: str | None = None       # Public audio URL
    audio_base64: str | None = None    # VEYA base64-encoded audio

class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    preview_url: str | None = None

class VoiceListResponse(BaseModel):
    voices: list[VoiceInfo]
```

### `api/voice/service.py`
- `from fal_services import tts_generate, transcribe_audio, transcribe_audio_url`
- TTS → async job (job_manager.submit)
- STT → sync response

---

## Images Domain — Detail (FAZ 4)

### `api/images/schema.py`
```python
class AvatarRequest(BaseModel):
    description: str                   # Karakter fiziksel tanimi
    style: str = "pixel_art"          # pixel_art | realistic | anime | painterly
    custom_style_prompt: str | None    # Serbest stil prompt override
    world_tone: str = "fantazi"       # Dunya atmosferi
    width: int = 512                   # 256-1024
    height: int = 512                  # 256-1024
    guidance_scale: float = 7.5        # 1.0-20.0
    num_inference_steps: int = 28      # 10-50
    seed: int | None = None            # Deterministic generation
    negative_prompt: str | None = None
    model: str = "dev"                 # dev | schnell | pro

class BackgroundRequest(BaseModel):
    prompt: str                        # Scene description
    style: str = "pixel_art"
    custom_style_prompt: str | None = None
    width: int = 1344                  # 512-2048
    height: int = 768                  # 512-2048
    guidance_scale: float = 7.5
    num_inference_steps: int = 28
    seed: int | None = None
    negative_prompt: str | None = None
    model: str = "dev"

class ImageJobResult(BaseModel):
    image_url: str
    seed_used: int
    width: int
    height: int
    inference_time_ms: float | None
```

### `api/images/service.py`
- `from fal_services import generate_avatar, generate_background` pattern'ini genislet
- Style preset → FLUX prompt prefix mapping:
  - `pixel_art` → "2D pixel art game character portrait, ..."
  - `realistic` → "Photorealistic character portrait, ..."
  - `anime` → "Anime style character portrait, ..."
  - `painterly` → "Oil painting style character portrait, ..."
- Consumer `custom_style_prompt` gondererek override edebilir

---

## Implementation Order

| Sira | Faz | Icerik | Bagimliliklari |
|------|-----|--------|----------------|
| ~~1~~ | ~~Faz 1~~ | ~~Altyapi + Worlds~~ | ~~Yok~~ — ✅ TAMAM |
| 2 | Faz 2 | Characters domain (schema, prompts, defaults, service, memory, router) | Faz 1 ✅ |
| 3 | Faz 3 | Voice domain (schema, service, router) | Faz 1 ✅ |
| 4 | Faz 4 | Images domain (schema, service, router) | Faz 1 ✅ |
| 5 | Faz 5 | Worlds refactor (src/ bagimliligi kir) | Faz 2 (test edilebilirlik icin) |

Faz 3 ve Faz 4 birbirinden bagimsiz, **paralel** uygulanabilir.

---

## Dependency Map (Import Rules)

```
api/characters/service.py
  ├── from fal_services import llm_generate       ✅ OK
  ├── from api.prompts.character_gen import ...    ✅ OK
  ├── from api.prompts.dialogue import ...         ✅ OK
  ├── from api.prompts.moderation import ...       ✅ OK
  ├── from api import store                        ✅ OK
  ├── from api.config import get_api_settings      ✅ OK
  └── from src.prototypes.* import ...             ❌ YASAK

api/voice/service.py
  ├── from fal_services import tts_generate, transcribe_audio  ✅ OK
  └── from src.* import ...                                     ❌ YASAK

api/images/service.py
  ├── from fal_services import generate_avatar, generate_background  ✅ OK (genisletilmis)
  └── from src.* import ...                                           ❌ YASAK

api/worlds/service.py (REFACTOR SONRASI)
  ├── from fal_services import llm_generate        ✅ OK (auto-gen icin)
  ├── from api import store                        ✅ OK
  └── from src.prototypes.world_gen import ...     ❌ KALDIRILACAK
```

---

## Verification Checklist

1. `uvicorn api.main:app --reload --port 9000` — app crash'siz ayaga kalkmali
2. `http://localhost:9000/docs` — Swagger UI, tum endpoint'ler gorulmeli
3. `POST /v1/characters` with `Authorization: Bearer demo-key-123` → 201
4. `GET /v1/characters` → paginated list
5. `POST /v1/characters/{id}/speak` → character dialogue response
6. `POST /v1/characters/{id}/react` → reaction with wants_to_speak
7. `GET /v1/characters/{id}/memory` → conversation history
8. `POST /v1/voice/tts` → 202 + job_id → `GET /v1/jobs/{id}` → completed
9. `POST /v1/images/avatar` → 202 + job_id → `GET /v1/jobs/{id}` → completed
10. Farkli API key → farkli tenant datasi (izolasyon testi)
11. Yanlis API key → 401 + standart error format
12. Var olmayan karakter → 404 + standart error format

---

## Roadmap (Post-Hackathon)

Demo'da slide olarak gosterilecek:

### P1 — Short Term
- **Rate limiting** — Tier-based (free: 100 req/h, pro: 10K req/h) via middleware
- **Usage tracking** — Request count, token usage, image count per tenant
- **Multi-character conversation** — `POST /v1/conversations` N-character group dialogue
- **Streaming TTS** — WebSocket/SSE ile PCM16 chunk streaming
- **Webhook callbacks** — Job completion notification to consumer URL
- **LLM-based world generation** — Auto-generate worlds from a seed/prompt (replaces src/ dependency)

### P2 — Medium Term
- **Image-to-image variation** — Generate avatar variations from existing
- **Caching** — Same character+context = cache hit (Redis)
- **Persistent storage** — PostgreSQL/Redis (replace in-memory)
- **SDKs** — Python, JavaScript, Unity SDK
- **Analytics dashboard** — Tenant usage portal

### P3 — Long Term
- **Fine-tuned models** — Custom character models per tenant
- **Voice cloning** — Custom character voices
- **Multiplayer orchestration** — Full game loop management as a service
- **Marketplace** — Character/world template marketplace
