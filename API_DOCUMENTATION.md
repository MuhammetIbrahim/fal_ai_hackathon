# Character AI API — Dokumantasyon

**Base URL:** `http://localhost:9000`
**Versiyon:** `0.1.0`
**Swagger UI:** `http://localhost:9000/docs`

Oyun studyolari icin game-agnostic karakter AI servisi. LLM ile karakter uretimi ve diyalog, Freya AI ile Turkce ses (TTS/STT), FLUX ile gorsel uretimi.

---

## Kimlik Dogrulama

Tum endpoint'ler `Authorization` header'i gerektirir:

```
Authorization: Bearer <API_KEY>
```

Her API key bir **tenant**'a eslesir. Tenant'lar birbirinin verisini goremez.

| API Key | Tenant ID |
|---------|-----------|
| `demo-key-123` | `tenant_demo` |
| `test-key-456` | `tenant_test` |

**Hatali veya eksik key:**
```json
{
  "error": {
    "code": "INVALID_API_KEY",
    "message": "Invalid or missing API key",
    "details": {}
  }
}
```

---

## Hata Formati

Tum hatalar ayni yapida doner:

```json
{
  "error": {
    "code": "HATA_KODU",
    "message": "Insan tarafindan okunabilir aciklama",
    "details": {}
  }
}
```

| HTTP Kodu | Error Code | Aciklama |
|-----------|------------|----------|
| 401 | `INVALID_API_KEY` | Gecersiz veya eksik API key |
| 404 | `CHAR_NOT_FOUND` | Karakter bulunamadi |
| 404 | `WORLD_NOT_FOUND` | Dunya bulunamadi |
| 404 | `JOB_NOT_FOUND` | Job bulunamadi |
| 404 | `CONV_NOT_FOUND` | Konusma bulunamadi |
| 422 | `CONV_ENDED` | Konusma sona ermis |
| 422 | `MAX_TURNS` | Maksimum tur sayisina ulasildi |
| 422 | `VALIDATION_ERROR` | Gecersiz input |
| 502 | `SERVICE_ERROR` | fal.ai servisi hatasi |
| 500 | `INTERNAL_ERROR` | Beklenmeyen sunucu hatasi |

---

## Sistem

### `GET /health`
Saglik kontrolu.

**Response:**
```json
{
  "status": "ok",
  "app": "Character AI API",
  "version": "0.1.0"
}
```

### `GET /`
API bilgisi.

**Response:**
```json
{
  "name": "Character AI API",
  "version": "0.1.0",
  "docs": "/docs"
}
```

---

## Dunyalar (Worlds)

Karakterlerin yasadigi evreni tanimlayin. Consumer kendi dunya kurallarini, atmosferini, yasakli kelimelerini JSON olarak gonderir.

### `POST /v1/worlds`

Yeni bir dunya olustur.

**Request Body:**
```json
{
  "name": "Karanlik Orman",
  "description": "Yogun sisle kapli, kadim bir ormanin icinde kurulmus kucuk bir yerlesim",
  "tone": "gotik fantazi",
  "setting": {
    "mevsim": "sonbahar",
    "yerler": ["Merkez Meydan", "Eski Degirmen", "Orman Siniri"],
    "atmosfer": "surekli sis, baykus sesleri, uzaktan davul sesleri"
  },
  "rules": {
    "konusma_kurallari": "Karakterler gercek dunyadan bahsedemez",
    "yasak_konular": ["teknoloji", "modern sehirler"]
  },
  "taboo_words": ["telefon", "internet", "araba", "bilgisayar"],
  "metadata": {
    "studyo": "Ornek Oyun Studyosu",
    "proje": "Karanlik Orman RPG"
  }
}
```

Tum alanlar opsiyonel. Bos `{}` gonderilebilir.

**Response `201`:**
```json
{
  "id": "a1b2c3d4e5f67890",
  "name": "Karanlik Orman",
  "description": "Yogun sisle kapli...",
  "tone": "gotik fantazi",
  "setting": {"mevsim": "sonbahar", "yerler": [...]},
  "rules": {"konusma_kurallari": "..."},
  "taboo_words": ["telefon", "internet", "araba", "bilgisayar"],
  "metadata": {"studyo": "..."},
  "created_at": "2026-02-12T18:30:00+00:00"
}
```

### `GET /v1/worlds/{world_id}`

Dunya bilgisini getir.

**Response `200`:** Ayni WorldResponse formati.

**Response `404`:**
```json
{
  "error": {
    "code": "WORLD_NOT_FOUND",
    "message": "World 'abc123' not found"
  }
}
```

---

## Karakterler (Characters)

AI karakterler olusturun, konusturun, tepki aldirin ve hafizalarini yonetin.

### `POST /v1/characters`

Yeni karakter olustur. Tum alanlar opsiyonel — verilmezse varsayilan havuzdan rastgele secilir.

**Request Body:**
```json
{
  "name": "Theron",
  "role": "Demirci",
  "archetype": "Sakin Az Konusan",
  "world_id": "a1b2c3d4e5f67890",
  "lore": "Yillarca daglarda yalniz yasadi, insanlara guvenmiyor",
  "personality": "Az konusur ama soyledigi her sey agirlikli",
  "skill_tier": "uzman"
}
```

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `name` | string | Hayir | Random isim havuzundan | Karakter adi |
| `role` | string | Hayir | Random rol havuzundan | Meslek (Kasap, Sifaci, Avci...) |
| `archetype` | string | Hayir | Random arketip havuzundan | Kisilik arketipi |
| `world_id` | string | Hayir | — | Onceden olusturulan dunya ID'si |
| `world_context` | string | Hayir | — | Serbest metin dunya bilgisi (`world_id` yerine) |
| `lore` | string | Hayir | — | Karakter gecmisi |
| `personality` | string | Hayir | — | Kisilik ozellikleri |
| `system_prompt` | string | Hayir | — | Tam override — verilirse LLM uretimi atlanir |
| `skill_tier` | string | Hayir | — | `caylak` / `orta` / `uzman` |

**Response `201`:**
```json
{
  "id": "chr_a1b2c3d4",
  "name": "Theron",
  "role": "Demirci",
  "archetype": "Sakin Az Konusan",
  "lore": "Yillarca daglarda yalniz yasadi...",
  "personality": "Az konusur ama soyledigi her sey agirlikli",
  "acting_prompt": "Ben Theron. Demirciyim. Daglardan geldim. Konusmam gerekmedikce suserim...",
  "skill_tier": "uzman",
  "world_id": "a1b2c3d4e5f67890",
  "created_at": "2026-02-12T18:35:00+00:00",
  "updated_at": null
}
```

### `GET /v1/characters`

Karakter listesi (paginated).

**Query Params:**
| Param | Tip | Varsayilan | Aciklama |
|-------|-----|------------|----------|
| `limit` | int | 50 | Sayfa basina kayit (1-100) |
| `offset` | int | 0 | Atlanacak kayit sayisi |

**Response `200`:**
```json
{
  "items": [
    {"id": "chr_a1b2c3d4", "name": "Theron", "role": "Demirci", ...},
    {"id": "chr_e5f6g7h8", "name": "Mirra", "role": "Sifaci", ...}
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

### `POST /v1/characters/batch`

Toplu karakter uretimi (paralel).

**Request Body:**
```json
{
  "count": 5,
  "world_id": "a1b2c3d4e5f67890",
  "roles": ["Kasap", "Sifaci", "Avci"],
  "archetypes": ["Saldirgan", "Cekici Manipulator"]
}
```

| Alan | Tip | Zorunlu | Aciklama |
|------|-----|---------|----------|
| `count` | int | Evet | Uretilecek karakter sayisi (1-20) |
| `world_id` | string | Hayir | Dunya ID |
| `world_context` | string | Hayir | Serbest dunya bilgisi |
| `roles` | list[str] | Hayir | Rol havuzu (dongusel atanir) |
| `archetypes` | list[str] | Hayir | Arketip havuzu (dongusel atanir) |

**Response `201`:** `CharacterResponse` listesi.

### `GET /v1/characters/{char_id}`

Karakter detayi getir.

**Response `200`:** CharacterResponse.

### `PATCH /v1/characters/{char_id}`

Karakter guncelle.

**Request Body (sadece degisen alanlar):**
```json
{
  "lore": "Artik koyde yasiyor, insanlara guvenmeye basliyor",
  "personality": "Eskisinden daha konuskan"
}
```

| Alan | Tip | Aciklama |
|------|-----|----------|
| `name` | string | Yeni isim |
| `lore` | string | Yeni gecmis |
| `personality` | string | Yeni kisilik |
| `system_prompt` | string | Yeni acting prompt override |

**Response `200`:** Guncellenmis CharacterResponse.

### `DELETE /v1/characters/{char_id}`

Karakter sil.

**Response `204`:** Icerik yok.

---

### `POST /v1/characters/{char_id}/speak`

Karakteri konustur. LLM ile karakter kisiligine uygun Turkce diyalog uretir.

**Request Body:**
```json
{
  "message": "Gecen gece ormandan garip sesler geldi, duydun mu?",
  "context_messages": [
    {"role": "user", "content": "Merhaba Theron"},
    {"role": "assistant", "content": "Hmm. Merhaba."}
  ],
  "game_context": "Gece vakti, atesin basinda 5 kisi oturuyor",
  "mood": "supheci"
}
```

| Alan | Tip | Zorunlu | Aciklama |
|------|-----|---------|----------|
| `message` | string | Evet | Kullanicinin mesaji veya tetikleyici |
| `context_messages` | list | Hayir | Onceki konusma gecmisi `[{role, content}]` |
| `game_context` | string | Hayir | Ek oyun durum bilgisi |
| `mood` | string | Hayir | Ruh hali override (supheci, kizgin, sakin...) |
| `system_prompt_override` | string | Hayir | Bu konusma icin gecici system prompt |

**Response `200`:**
```json
{
  "character_id": "chr_a1b2c3d4",
  "character_name": "Theron",
  "message": "Duydum. Ama orman her gece ses cikarir. Onemli olan hangi sesin pesinden gittigimiz.",
  "mood": "supheci",
  "moderation": {
    "passed": true,
    "reason": null
  }
}
```

`moderation` alani, dunya kurallarinin (`taboo_words`, `rules`) ihlal edilip edilmedigini gosterir. Dunya tanimlanmamissa `null` doner.

### `POST /v1/characters/{char_id}/speak/stream`

Karakter konusmasi + ses uretimi tek endpoint'te, SSE ile gercek zamanli streaming.
LLM metin uretirken token token text gelir, cumle tamamlaninca ses chunk'lari akmaya baslar.

**Request Body:**

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `message` | string | Evet | — | Kullanicinin mesaji |
| `context_messages` | list[dict] | Hayir | null | Onceki konusma `[{role, content}]` |
| `game_context` | string | Hayir | null | Ek oyun durum bilgisi |
| `mood` | string | Hayir | null | Ruh hali override |
| `system_prompt_override` | string | Hayir | null | Gecici system prompt |
| `voice` | string | Hayir | `alloy` | TTS ses ID: `alloy`, `zeynep`, `ali` |
| `speed` | float | Hayir | `1.0` | TTS konusma hizi (0.5 — 2.0) |

**Response:** `text/event-stream` (SSE)

**SSE Event'leri (sirasiyla):**

| Event | Data | Aciklama |
|-------|------|----------|
| `text_token` | `{"token": "Ben"}` | LLM'den gelen her token |
| `sentence_ready` | `{"sentence": "Ben Dorin."}` | Tamamlanan cumle |
| `audio_chunk` | `{"chunk_index": 0, "audio_base64": "...", "format": "pcm16", "sample_rate": 16000, "channels": 1}` | Cumlenin ses chunk'i |
| `moderation` | `{"passed": true, "reason": null}` | Icerik moderasyonu sonucu |
| `done` | `{"character_id": "...", "character_name": "...", "message": "tam metin", "mood": "...", "total_audio_chunks": 12}` | Stream tamamlandi |
| `error` | `{"code": "STREAM_ERROR", "message": "..."}` | Hata olustu |

**curl Ornegi:**
```bash
curl -N -X POST http://localhost:9000/v1/characters/<char_id>/speak/stream \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{"message": "Dun gece neredeydin?", "voice": "alloy", "speed": 1.0}'
```

> **Not:** Event'ler dogal olarak interleave olur — once text_token'lar gelir, cumle bitince audio_chunk'lar, sonra yeni text_token'lar. Client tarafinda text ve audio ayri ayri handle edilmeli.

### `POST /v1/characters/{char_id}/react`

Karakterden bir mesaja ic tepki al. Konusmak isteyip istemedigini belirler.

**Request Body:**
```json
{
  "message": "Bence aramizda bir hain var",
  "context": "Atesin basinda gece toplantisi"
}
```

**Response `200`:**
```json
{
  "character_id": "chr_a1b2c3d4",
  "character_name": "Theron",
  "reaction": "Hain mi? Herkes birbirini sucluyor ama kimse kanitla gelmiyor.",
  "wants_to_speak": true
}
```

| Alan | Tip | Aciklama |
|------|-----|----------|
| `reaction` | string | Karakterin ic tepki metni |
| `wants_to_speak` | bool | `true` = konusmak istiyor, `false` = pas geciyor |

### `GET /v1/characters/{char_id}/memory`

Karakterin konusma hafizasini getir. `speak` endpoint'i her cagirildiginda hafizaya otomatik eklenir.

**Response `200`:**
```json
{
  "character_id": "chr_a1b2c3d4",
  "exchanges": [
    {"role": "user", "content": "Merhaba Theron", "timestamp": "..."},
    {"role": "character", "content": "Hmm. Merhaba.", "timestamp": "..."},
    {"role": "user", "content": "Gecen gece ormandan garip sesler geldi", "timestamp": "..."},
    {"role": "character", "content": "Duydum. Ama orman her gece ses cikarir.", "timestamp": "..."}
  ],
  "total": 4
}
```

---

## Ses (Voice)

Freya AI ile Turkce ses uretimi ve tanima.

### `POST /v1/voice/tts`

Metin → Ses. **Asenkron** — 202 + job_id doner, sonucu `/v1/jobs/{job_id}` ile sorgula.

**Request Body:**
```json
{
  "text": "Merhaba, ben Theron. Demirciyim.",
  "voice": "alloy",
  "speed": 1.0,
  "response_format": "mp3"
}
```

| Alan | Tip | Varsayilan | Aciklama |
|------|-----|------------|----------|
| `text` | string | — | Sese cevrilecek metin (zorunlu) |
| `voice` | string | `alloy` | Ses ID: `alloy`, `zeynep`, `ali` |
| `speed` | float | `1.0` | Konusma hizi (0.5 — 2.0) |
| `response_format` | string | `mp3` | Cikti formati |

**Response `202`:**
```json
{
  "job_id": "job_a1b2c3d4e5f6",
  "status": "pending"
}
```

**Job tamamlandiginda (`GET /v1/jobs/{job_id}`):**
```json
{
  "job_id": "job_a1b2c3d4e5f6",
  "status": "completed",
  "type": "tts",
  "result": {
    "audio_url": "https://fal.media/files/..../audio.mp3",
    "inference_time_ms": 1234.5,
    "audio_duration_sec": 3.2
  },
  "created_at": "...",
  "completed_at": "..."
}
```

### `POST /v1/voice/tts/stream`

Metin → Ses, SSE (Server-Sent Events) ile gercek zamanli PCM16 audio chunk streaming.
Normal `/tts` endpoint'inden farki: CDN URL beklemek yerine ses chunk'lari aninda akmaya baslar.

**Request Body:**

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `text` | string | Evet | — | Sese cevrilecek metin |
| `voice` | string | Hayir | `alloy` | Ses ID: `alloy`, `zeynep`, `ali` |
| `speed` | float | Hayir | `1.0` | Konusma hizi (0.5 — 2.0) |

**Response:** `text/event-stream` (SSE)

**SSE Event'leri:**

| Event | Data | Aciklama |
|-------|------|----------|
| `audio_chunk` | `{"chunk_index": 0, "audio_base64": "...", "format": "pcm16", "sample_rate": 16000, "channels": 1}` | PCM16 ses parcasi |
| `done` | `{"total_chunks": 5, "format": "pcm16", "sample_rate": 16000}` | Stream tamamlandi |
| `error` | `{"code": "TTS_STREAM_ERROR", "message": "..."}` | Hata olustu |

**curl Ornegi:**
```bash
curl -N -X POST http://localhost:9000/v1/voice/tts/stream \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{"text": "Merhaba, ben Dorin.", "voice": "alloy", "speed": 1.0}'
```

> **Not:** Audio chunk'lar base64 encoded PCM16 formatinda gelir (16kHz, mono). Client tarafinda base64 decode → AudioContext ile oynatilabilir.

### `POST /v1/voice/stt`

Ses → Metin. **Senkron** — direkt sonuc doner.

**Request Body (audio URL ile):**
```json
{
  "audio_url": "https://example.com/ses.wav"
}
```

**Request Body (base64 ile):**
```json
{
  "audio_base64": "UklGRi4AAABXQVZFZm10IBAAAA..."
}
```

Ikisinden biri zorunlu. Ikisi de verilmezse `422 VALIDATION_ERROR`.

**Response `200`:**
```json
{
  "text": "Merhaba ben Theron"
}
```

### `GET /v1/voice/voices`

Kullanilabilir ses listesi.

**Response `200`:**
```json
{
  "voices": [
    {"voice_id": "alloy", "name": "Alloy", "preview_url": null},
    {"voice_id": "zeynep", "name": "Zeynep", "preview_url": null},
    {"voice_id": "ali", "name": "Ali", "preview_url": null}
  ]
}
```

---

## Gorseller (Images)

FLUX ile karakter avatar ve sahne arka plani uretimi. **Asenkron** — 202 + job_id doner.

### `POST /v1/images/avatar`

Karakter avatar gorseli uret.

**Request Body:**
```json
{
  "description": "kizil sacli, yesil gozlu kadin savasci, yuzunde yara izi",
  "style": "pixel_art",
  "world_tone": "karanlik fantazi",
  "width": 512,
  "height": 512
}
```

| Alan | Tip | Varsayilan | Aciklama |
|------|-----|------------|----------|
| `description` | string | — | Karakter fiziksel tanimi (zorunlu) |
| `style` | string | `pixel_art` | `pixel_art` / `realistic` / `anime` / `painterly` |
| `custom_style_prompt` | string | — | Serbest stil prompt (verilirse style override edilir) |
| `world_tone` | string | `fantazi` | Dunya atmosferi |
| `width` | int | `512` | Gorsel genisligi (256-1024) |
| `height` | int | `512` | Gorsel yuksekligi (256-1024) |
| `guidance_scale` | float | `7.5` | Prompt bagliligi (1.0-20.0) |
| `num_inference_steps` | int | `28` | Uretim adimlari (10-50, yuksek = kaliteli ama yavas) |
| `seed` | int | — | Deterministik uretim icin seed |
| `negative_prompt` | string | — | Istenmeyen ogeler (orn: "blurry, low quality") |
| `model` | string | `dev` | FLUX model: `dev` / `schnell` (hizli) / `pro` (kaliteli) |

**Response `202`:**
```json
{
  "job_id": "job_x1y2z3w4a5b6",
  "status": "pending"
}
```

**Job tamamlandiginda:**
```json
{
  "job_id": "job_x1y2z3w4a5b6",
  "status": "completed",
  "type": "avatar",
  "result": {
    "image_url": "https://fal.media/files/..../avatar.png",
    "seed_used": 42,
    "width": 512,
    "height": 512,
    "inference_time_ms": 8500.0
  }
}
```

### `POST /v1/images/background`

Sahne arka plan gorseli uret.

**Request Body:**
```json
{
  "prompt": "gece vakti, sis icinde bir orman acikligi, ortada yanan bir ates",
  "style": "pixel_art",
  "width": 1344,
  "height": 768
}
```

| Alan | Tip | Varsayilan | Aciklama |
|------|-----|------------|----------|
| `prompt` | string | — | Sahne aciklamasi (zorunlu) |
| `style` | string | `pixel_art` | Ayni style secenekleri |
| `width` | int | `1344` | Gorsel genisligi (512-2048) |
| `height` | int | `768` | Gorsel yuksekligi (512-2048) |
| Diger alanlar avatar ile ayni |

**Response `202`:** Ayni job_id + status formati.

---

## LLM (Dil Modeli)

Ham LLM erisimi. Herhangi bir prompt/system_prompt kombinasyonu ile metin uretimi.

### `POST /v1/llm/generate`

Tam LLM yaniti (senkron).

**Request Body:**
```json
{
  "prompt": "Sence bu koyde neler oluyor?",
  "system_prompt": "Sen Theron adinda bir demircisin...",
  "model": "gemini-2.5-flash",
  "temperature": 0.8,
  "max_tokens": null,
  "reasoning": null
}
```

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `prompt` | string | Evet | — | Ana prompt / kullanici mesaji |
| `system_prompt` | string | Hayir | `""` | System instruction |
| `model` | string | Hayir | `gemini-2.5-flash` | Model adi (`google/` prefix'i otomatik strip edilir) |
| `temperature` | float | Hayir | `0.8` | Yaraticilik (0.0 — 2.0) |
| `max_tokens` | int | Hayir | null | Maksimum output token |
| `reasoning` | bool | Hayir | null | Extended thinking aktif mi |

**Response `200`:**
```json
{
  "output": "Bu koyde bir seyler donuyor ama kimse konusmuyor..."
}
```

### `POST /v1/llm/stream`

Token token streaming (SSE).

**Request Body:** `/v1/llm/generate` ile ayni (`reasoning` haric).

**Response:** `text/event-stream` (SSE)

**SSE Event'leri:**

| Event | Data | Aciklama |
|-------|------|----------|
| `text_token` | `{"token": "Bu"}` | LLM'den gelen her token |
| `done` | `{"output": "tam metin"}` | Stream tamamlandi |
| `error` | `{"code": "LLM_ERROR", "message": "..."}` | Hata olustu |

**curl Ornegi:**
```bash
curl -N -X POST http://localhost:9000/v1/llm/generate \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Merhaba de", "system_prompt": "Kisa yanit ver", "temperature": 0.5}'
```

---

## Konusmalar (Conversations)

Birden fazla AI karakter arasinda cok turlu, orkestre edilmis konusma yonetimi. Orkestrator (meta-LLM) her turda hangi karakterin konusacagini otomatik secer.

### `POST /v1/conversations`

Yeni konusma olustur. En az 2 karakter ID'si gereklidir.

**Request Body:**
```json
{
  "character_ids": ["chr_a1b2c3d4", "chr_e5f6g7h8", "chr_i9j0k1l2"],
  "world_id": "a1b2c3d4e5f67890",
  "topic": "Gecen gece ormandan gelen sesler hakkinda tartisma",
  "max_turns": 20
}
```

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `character_ids` | list[str] | Evet | — | Katilimci karakter ID'leri (min 2) |
| `world_id` | string | Hayir | — | Onceden olusturulan dunya ID'si |
| `topic` | string | Hayir | — | Konusma konusu / baslangic tetikleyicisi |
| `max_turns` | int | Hayir | `20` | Maksimum tur sayisi (2-100) |

**Response `201`:**
```json
{
  "id": "conv_a1b2c3d4e5f6",
  "character_ids": ["chr_a1b2c3d4", "chr_e5f6g7h8", "chr_i9j0k1l2"],
  "status": "active",
  "created_at": "2026-02-12T19:00:00+00:00"
}
```

### `GET /v1/conversations`

Konusma listesi (paginated).

**Query Params:**
| Param | Tip | Varsayilan | Aciklama |
|-------|-----|------------|----------|
| `limit` | int | 50 | Sayfa basina kayit (1-100) |
| `offset` | int | 0 | Atlanacak kayit sayisi |

**Response `200`:**
```json
{
  "items": [
    {"id": "conv_a1b2c3d4e5f6", "character_ids": [...], "status": "active", ...},
    {"id": "conv_x7y8z9w0a1b2", "character_ids": [...], "status": "ended", ...}
  ],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

### `GET /v1/conversations/{conv_id}`

Konusma detayi getir — tum turlar dahil.

**Response `200`:**
```json
{
  "id": "conv_a1b2c3d4e5f6",
  "character_ids": ["chr_a1b2c3d4", "chr_e5f6g7h8"],
  "topic": "Gecen gece ormandan gelen sesler",
  "status": "active",
  "turns": [
    {"role": "kullanici", "content": "Gecen gece neler oldu?"},
    {"role": "karakter", "character_id": "chr_a1b2c3d4", "character_name": "Theron", "content": "Duydum. Ama orman her gece ses cikarir."},
    {"role": "karakter", "character_id": "chr_e5f6g7h8", "character_name": "Mirra", "content": "Bu seferki farkli, Theron. Bunu sen de biliyorsun."}
  ],
  "created_at": "2026-02-12T19:00:00+00:00",
  "updated_at": "2026-02-12T19:05:30+00:00"
}
```

**Response `404`:**
```json
{
  "error": {
    "code": "CONV_NOT_FOUND",
    "message": "Konusma 'conv_xyz' bulunamadi"
  }
}
```

### `POST /v1/conversations/{conv_id}/turn`

Konusmada bir tur ilerlet. Sistem su adimlari otomatik yapar:

1. Tum karakterlerden **tepki** toplar (paralel)
2. **Orkestrator** (meta-LLM) tepkilere bakarak siradaki konusmaciyi secer
3. Secilen karakter **konusturulur** (speak)
4. Tur store'a kaydedilir

**Request Body:**
```json
{
  "user_message": "Peki bu seslerin kaynagi ne olabilir?",
  "voice": "alloy",
  "speed": 1.0
}
```

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `user_message` | string | Hayir | — | Opsiyonel kullanici mesaji (tetikleyici) |
| `voice` | string | Hayir | `alloy` | TTS ses ID (stream icin): `alloy`, `zeynep`, `ali` |
| `speed` | float | Hayir | `1.0` | TTS konusma hizi (0.5 — 2.0) |

**Response `200`:**
```json
{
  "conversation_id": "conv_a1b2c3d4e5f6",
  "turn_number": 3,
  "speaker": {
    "role": "karakter",
    "character_id": "chr_a1b2c3d4",
    "character_name": "Theron",
    "content": "Kaynak mi? Orman kendi dilinde konusuyor. Onu dinlemesini bilenler anlar."
  },
  "reactions": [
    {
      "character_id": "chr_e5f6g7h8",
      "character_name": "Mirra",
      "reaction": "Theron yine gizliyor. Ormani bu kadar iyi tanimasi tesaduf olamaz.",
      "wants_to_speak": true
    },
    {
      "character_id": "chr_i9j0k1l2",
      "character_name": "Dorian",
      "reaction": "Ikisi de bir seyler biliyor ama paylasmiyor.",
      "wants_to_speak": false
    }
  ],
  "orchestrator_reason": "Theron konuya en yakin karakter ve tepkisi en guclu"
}
```

| Alan | Tip | Aciklama |
|------|-----|----------|
| `speaker` | object | Konusan karakterin mesaji |
| `reactions` | list | Diger karakterlerin ic tepkileri |
| `reactions[].wants_to_speak` | bool | `true` = sonraki turda konusmak istiyor |
| `orchestrator_reason` | string | Orkestrator'un secim gerekceleri |

### `POST /v1/conversations/{conv_id}/turn/stream`

Konusma turu + ses, SSE ile gercek zamanli streaming. `/turn` endpoint'inin streaming versiyonu.

**Request Body:** `/turn` ile ayni.

**Response:** `text/event-stream` (SSE)

**SSE Event'leri (sirasiyla):**

| Event | Data | Aciklama |
|-------|------|----------|
| `reactions` | `{"reactions": [{...}, ...]}` | Tum karakterlerin tepkileri |
| `speaker` | `{"character_id": "...", "character_name": "...", "reason": "..."}` | Orkestrator'un sectigi konusmaci |
| `text_token` | `{"token": "Ben"}` | LLM'den gelen her token |
| `sentence_ready` | `{"sentence": "Ben Theron.", "index": 0}` | Tamamlanan cumle |
| `audio_chunk` | `{"chunk_index": 0, "audio_base64": "...", "format": "pcm16", "sample_rate": 16000, "channels": 1, "sentence_index": 0}` | Cumlenin ses chunk'i |
| `done` | `{"conversation_id": "...", "turn_number": 3, "speaker": {...}, "reactions": [...], "orchestrator_reason": "...", "total_audio_chunks": 8, "total_sentences": 3}` | Stream tamamlandi |
| `error` | `{"code": "TURN_STREAM_ERROR", "message": "..."}` | Hata olustu |

**curl Ornegi:**
```bash
curl -N -X POST http://localhost:9000/v1/conversations/<conv_id>/turn/stream \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{"user_message": "Devam edin", "voice": "alloy"}'
```

> **Not:** Oncelikle `reactions` ve `speaker` event'leri gelir (orkestrasyon asamasi), sonra `text_token` → `sentence_ready` → `audio_chunk` akisi baslar. Client tarafinda text, audio ve orkestrasyon bilgileri ayri ayri handle edilmeli.

### `POST /v1/conversations/{conv_id}/inject`

Konusmaya dis mesaj enjekte et (anlatici/sistem mesaji). Karakterler bu mesaji baglam olarak gorur ama yanit uretmez.

**Request Body:**
```json
{
  "message": "Uzaktan bir canavar kuksemesi duyuldu. Herkes sessizlesti.",
  "sender_name": "Anlatici"
}
```

| Alan | Tip | Zorunlu | Varsayilan | Aciklama |
|------|-----|---------|------------|----------|
| `message` | string | Evet | — | Enjekte edilecek mesaj |
| `sender_name` | string | Hayir | `Anlatici` | Gonderen adi |

**Response `200`:**
```json
{
  "role": "anlatici",
  "character_name": "Anlatici",
  "content": "Uzaktan bir canavar kuksemesi duyuldu. Herkes sessizlesti."
}
```

### `DELETE /v1/conversations/{conv_id}`

Konusmayi sonlandir. Status `ended` olur.

**Response `204`:** Icerik yok.

---

## Asenkron Isler (Jobs)

TTS ve gorsel uretimi asenkron calisir. Sonuclari job polling ile alin.

### `GET /v1/jobs/{job_id}`

Job durumunu sorgula.

**Response `200`:**
```json
{
  "job_id": "job_a1b2c3d4e5f6",
  "status": "completed",
  "type": "tts",
  "result": { ... },
  "error": null,
  "created_at": "2026-02-12T18:40:00+00:00",
  "completed_at": "2026-02-12T18:40:05+00:00"
}
```

**Job durumlari:**

| Durum | Aciklama |
|-------|----------|
| `pending` | Is kuyruga alindi |
| `processing` | Is isleniyor |
| `completed` | Tamamlandi — `result` alaninda sonuc |
| `failed` | Hata olustu — `error` alaninda detay |

**Basarisiz job ornegi:**
```json
{
  "job_id": "job_a1b2c3d4e5f6",
  "status": "failed",
  "type": "avatar",
  "result": null,
  "error": {
    "code": "JOB_FAILED",
    "message": "[flux] HTTP 429: Rate limit exceeded"
  }
}
```

**Onerilen polling stratejisi:**
```
1. POST /v1/voice/tts → 202 {job_id}
2. 1 saniye bekle
3. GET /v1/jobs/{job_id}
   - pending/processing → 2'ye don
   - completed → result'i al
   - failed → hata isle
```

Job'lar 24 saat sonra otomatik temizlenir.

---

## Varsayilan Degerler

Karakter olusturulurken alan bos birakilirsa su havuzlardan rastgele secilir:

### Roller (20 adet)
Kasap, Sifaci, Avci, Tuccar, Demirci, Nobetci, Simyaci, Ozan, Ciftci, Haritaci, Balikci, Marangoz, Kaptan, Kutuphaneci, Bahcivan, Terzi, Madenci, Muhendis, Surgun Rahip, Ejderha Avcisi

### Arketipler (6 adet)
| Arketip | Konusma Tarzi |
|---------|---------------|
| Supheci Sessiz | Kisa cumleler, belirsiz ifadeler |
| Supheci Konuskan | Soru agirlikli, arastirmaci |
| Saldirgan | Emredici, kisa, agresif ton |
| Sakin Az Konusan | Olculu, soguk, az kelime |
| Cekici Manipulator | Sicak, ikna edici, yumusak |
| Duru Idealist | Ilkeli, ciddi, motive edici |

### Beceri Seviyeleri
| Seviye | Etki |
|--------|------|
| `caylak` | Basit, cekinik yanitlar |
| `orta` | Dogal, olculu yanitlar |
| `uzman` | Otoriter, derinlikli yanitlar |

### Isim Havuzu (20 adet)
Kael, Mirra, Theron, Lyra, Dorian, Selene, Caspian, Freya, Roland, Iris, Magnus, Petra, Aldric, Yara, Lucan, Ember, Soren, Dalia, Orion, Niara

---

## Hizli Baslangic

### 1. Dunya olustur
```bash
curl -X POST http://localhost:9000/v1/worlds \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sis Koyu",
    "tone": "gotik fantazi",
    "taboo_words": ["telefon", "internet"]
  }'
```

### 2. Karakter olustur
```bash
curl -X POST http://localhost:9000/v1/characters \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Theron",
    "role": "Demirci",
    "archetype": "Sakin Az Konusan",
    "world_id": "<world_id_buraya>"
  }'
```

### 3. Karakteri konustur
```bash
curl -X POST http://localhost:9000/v1/characters/<char_id>/speak \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Gecen gece ormandan garip sesler geldi, ne dusunuyorsun?"
  }'
```

### 4. Avatar uret
```bash
curl -X POST http://localhost:9000/v1/images/avatar \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "orta yasli erkek demirci, genis omuzlu, siyah sacli",
    "style": "pixel_art",
    "world_tone": "gotik fantazi"
  }'
```

### 5. Job sonucunu al
```bash
curl http://localhost:9000/v1/jobs/<job_id> \
  -H "Authorization: Bearer demo-key-123"
```

### 6. Konusma olustur (cok karakterli)
```bash
# Konusma olustur
curl -X POST http://localhost:9000/v1/conversations \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "character_ids": ["<char_id_1>", "<char_id_2>"],
    "topic": "Gecen gece ormandan gelen garip sesler"
  }'
```

### 7. Konusma turu ilerlet
```bash
# Orkestrator otomatik konusmaci secer
curl -X POST http://localhost:9000/v1/conversations/<conv_id>/turn \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 8. Konusmaya anlatici mesaji enjekte et
```bash
curl -X POST http://localhost:9000/v1/conversations/<conv_id>/inject \
  -H "Authorization: Bearer demo-key-123" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Uzaktan bir canavar kuksemesi duyuldu.",
    "sender_name": "Anlatici"
  }'
```

---

## Calistirma

```bash
# Bagimliliklari yukle
uv sync

# .env dosyasinda FAL_KEY tanimla
echo "FAL_KEY=your-fal-api-key" > .env

# Sunucuyu baslat
python -m uvicorn api.main:app --port 9000 --reload

# Swagger UI
open http://localhost:9000/docs
```

---

## Endpoint Ozet Tablosu

| Method | Path | Aciklama | Async |
|--------|------|----------|-------|
| `GET` | `/health` | Saglik kontrolu | — |
| `GET` | `/` | API bilgisi | — |
| `POST` | `/v1/worlds` | Dunya olustur | Hayir |
| `GET` | `/v1/worlds/{id}` | Dunya getir | Hayir |
| `POST` | `/v1/characters` | Karakter olustur | Hayir |
| `GET` | `/v1/characters` | Karakter listesi | Hayir |
| `POST` | `/v1/characters/batch` | Toplu karakter uret | Hayir |
| `GET` | `/v1/characters/{id}` | Karakter detayi | Hayir |
| `PATCH` | `/v1/characters/{id}` | Karakter guncelle | Hayir |
| `DELETE` | `/v1/characters/{id}` | Karakter sil | Hayir |
| `POST` | `/v1/characters/{id}/speak` | Karakter konustur | Hayir |
| `POST` | `/v1/characters/{id}/speak/stream` | Karakter konustur + ses (SSE) | **Stream** |
| `POST` | `/v1/characters/{id}/react` | Karakter tepkisi | Hayir |
| `GET` | `/v1/characters/{id}/memory` | Hafiza getir | Hayir |
| `POST` | `/v1/llm/generate` | Ham LLM yaniti | Hayir |
| `POST` | `/v1/llm/stream` | Ham LLM streaming (SSE) | **Stream** |
| `POST` | `/v1/conversations` | Konusma olustur | Hayir |
| `GET` | `/v1/conversations` | Konusma listesi | Hayir |
| `GET` | `/v1/conversations/{id}` | Konusma detayi | Hayir |
| `POST` | `/v1/conversations/{id}/turn` | Konusma turu ilerlet | Hayir |
| `POST` | `/v1/conversations/{id}/turn/stream` | Konusma turu + ses (SSE) | **Stream** |
| `POST` | `/v1/conversations/{id}/inject` | Mesaj enjekte et | Hayir |
| `DELETE` | `/v1/conversations/{id}` | Konusma sonlandir | Hayir |
| `POST` | `/v1/voice/tts` | Metin → Ses | **Evet (202)** |
| `POST` | `/v1/voice/tts/stream` | Metin → Ses (SSE) | **Stream** |
| `POST` | `/v1/voice/stt` | Ses → Metin | Hayir |
| `GET` | `/v1/voice/voices` | Ses listesi | Hayir |
| `POST` | `/v1/images/avatar` | Avatar uret | **Evet (202)** |
| `POST` | `/v1/images/background` | Arka plan uret | **Evet (202)** |
| `GET` | `/v1/jobs/{job_id}` | Job durumu sorgula | — |

---

## Performans

### Streaming vs Polling Karsilastirmasi

| Metrik | Polling (eski) | Streaming (eski — OpenRouter) | Streaming (yeni — Gemini direkt) |
|--------|---------|-----------|--------|
| LLM ilk token | ~2.1s | ~1.1s | **~0.45s** |
| LLM only (speak) | ~2.5s | ~1.5s | **~0.67s** |
| Pipeline ilk ses | ~5.6s | ~2.5s | **~1.30s** |
| Total stream | ~7.0s | ~3.5s | **~3.43s** |
| 3x concurrent TTS | ~5.0s (sirali) | ~1.5s avg (paralel) | ~1.5s avg (paralel) |

**Gemini direkt API gecisi (v2):** OpenRouter middleman kaldirildi, LLM latency %48 dustu.
- **Streaming endpoint'ler** PCM16 (16kHz, mono) formatinda raw audio doner — dusuk latency, aninda oynatilabilir.
- **Polling endpoint'ler** mp3 formatinda CDN URL doner — yuksek kalite, indirip cache'lenebilir.
- Metin uzadikca streaming avantaji artar: ilk clause TTS'e gonderilirken LLM hala uretmeye devam eder.
- LLM: Google Gemini Flash API (direkt, thinking OFF). TTS/STT: fal.ai Freya (aynen).
