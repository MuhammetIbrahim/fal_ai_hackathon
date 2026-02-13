# Freya + fal.ai — Kesinlesmis Teknik Rapor

> Tum bilgiler resmi fal.ai doc sayfalari ve hackathon gist orneklerinden alinmistir.
> Tarih: 9 Subat 2026

---

## 1. Buyuk Resim

Freya (TTS + STT) modelleri fal.ai uzerinde calisiyor. Ayri bir Freya servisi yok.
LLM erisimi de fal.ai uzerinden OpenRouter ile saglaniyor.

**Tek ihtiyac:**
```
pip install fal-client httpx
export FAL_KEY="your-key"
```

**Tek key ile erisilebilen tum servisler:**

| # | Servis | Endpoint ID | Ne Yapar |
|---|--------|------------|----------|
| 1 | Freya TTS Streaming | `freya-mypsdi253hbk/freya-tts` + path `/stream` | Metin → streaming PCM16 ses |
| 2 | Freya TTS Generate | `freya-mypsdi253hbk/freya-tts/generate` | Metin → CDN URL (wav/mp3) |
| 3 | Freya TTS Speech | `freya-mypsdi253hbk/freya-tts/audio/speech` | Metin → raw audio bytes (OpenAI-uyumlu) |
| 4 | Freya STT Generate | `freya-mypsdi253hbk/freya-stt/generate` | Ses URL → metin (default Turkce) |
| 5 | Freya STT Transcriptions | `freya-mypsdi253hbk/freya-stt/audio/transcriptions` | Ses dosyasi yukle → metin (OpenAI-uyumlu) |
| 6 | OpenRouter LLM | `openrouter/router` | Herhangi LLM (Gemini, Claude, Llama...) |
| 7 | FLUX | `fal-ai/flux/dev` | Gorsel uretimi |
| 8 | Beatoven Music | `beatoven/music` | Muzik uretimi |
| 9 | Beatoven SFX | `beatoven/sfx` | Ses efekti uretimi |

---

## 2. Freya TTS (Text-to-Speech)

3 farkli endpoint, 3 farkli kullanim senaryosu:

### 2.1 /stream — Gercek Zamanli Streaming (ANA KULLANIM)

Ses uretilirken chunk chunk geliyor. En dusuk latency.

```python
# Sync
for event in fal_client.stream(
    "freya-mypsdi253hbk/freya-tts",
    arguments={"input": "Merhaba, nasilsin?", "speed": 1.0},
    path="/stream"
):
    if "audio" in event:
        pcm_bytes = base64.b64decode(event["audio"])
        # PCM16, 16kHz, mono — aninda oynatilabilir

    if "error" in event:
        if not event.get("recoverable"):
            raise RuntimeError(event["error"]["message"])

    if event.get("done"):
        print(event["inference_time_ms"], event["audio_duration_sec"])
```

**Input:**
- `input` (string) — Seslendirilecek metin
- `response_format` (enum: mp3/opus/aac/flac/wav/pcm, default "wav")
- `speed` (float, default 1, aralik: 0.25 - 4.0)

**Output (SSE event'leri):**
- `{"audio": "base64_string"}` — PCM16 ses chunk'i
- `{"error": {"message": "..."}, "recoverable": true/false}` — Hata
- `{"done": true, "inference_time_ms": 340, "audio_duration_sec": 2.1}` — Bitis

**Audio format:** PCM16, 16kHz, mono, 2 byte/sample

### 2.2 /generate — CDN URL Dondurme

Tum sesi uretir, CDN'e yukler, URL dondurur.

```python
handler = await fal_client.submit_async(
    "freya-mypsdi253hbk/freya-tts/generate",
    arguments={"input": "Merhaba", "response_format": "wav", "speed": 1},
)
result = await handler.get()

audio_url = result["audio"]["url"]       # CDN URL
inference_ms = result["inference_time_ms"]  # float
duration_sec = result["audio_duration_sec"] # float
```

**Output:**
- `audio` (File) — `{url, content_type, file_name, file_size}`
- `inference_time_ms` (float)
- `audio_duration_sec` (float)

### 2.3 /audio/speech — OpenAI Uyumlu

OpenAI TTS API formatiyla ayni. Raw audio bytes dondurur. LiveKit entegrasyonu icin kullanilir.

```python
result = fal_client.subscribe(
    "freya-mypsdi253hbk/freya-tts/audio/speech",
    arguments={"input": "Merhaba", "response_format": "wav", "speed": 1},
)
```

**Output:** Raw audio bytes (doc'ta output schema tanimlanmamis, aciklamada "returns raw audio bytes directly" diyor)

### 2.4 /models — Model Listesi

```python
handler = await fal_client.submit_async(
    "freya-mypsdi253hbk/freya-tts/models",
    arguments={},
)
result = await handler.get()
# {"object": "list", "data": [{"id": "...", "object": "model", "owned_by": "freya-ai"}]}
```

---

## 3. Freya STT (Speech-to-Text)

2 farkli endpoint, 2 farkli yaklasim:

### 3.1 /generate — fal.ai Native (ANA KULLANIM)

Ses dosyasinin URL'sini ver, metin al. `fal_client` ile async calisiyor.

```python
# Once sesi fal storage'a yukle
audio_url = await fal_client.upload_file_async("kayit.wav")

# Sonra transkribe et
handler = await fal_client.submit_async(
    "freya-mypsdi253hbk/freya-stt/generate",
    arguments={
        "audio_url": audio_url,
        "language": "tr",             # DEFAULT ZATEN TURKCE
        "response_format": "json",    # json / text / verbose_json / srt / vtt
    },
)
result = await handler.get()
```

**Input:**
- `audio_url` (string) — Ses dosyasinin URL'si
- `language` (string, **default "tr"**) — Dil kodu. Turkce varsayilan!
- `response_format` (enum: json/text/verbose_json/srt/vtt, default "json")

**Desteklenen formatlar:** flac, mp3, mp4, mpeg, mpga, m4a, ogg, oga, wav, webm
**Max boyut:** 25MB

**Neden /generate tercih ediyoruz:**
- `fal_client` ile async — FastAPI'ye dogal uyumlu
- Default dil Turkce
- URL bazli — fal storage veya herhangi public URL kabul ediyor
- verbose_json ile timestamp/segment bilgisi alinabilir

### 3.2 /audio/transcriptions — OpenAI Uyumlu

Dosya yukleme (multipart) ile transkripsiyon. Gist'te httpx POST kullanilmis.

```python
import httpx

async with httpx.AsyncClient(timeout=60.0) as client:
    response = await client.post(
        "https://fal.run/freya-mypsdi253hbk/freya-stt/audio/transcriptions",
        headers={"Authorization": f"Key {FAL_KEY}"},
        files={"file": ("audio.wav", audio_bytes, "audio/wav")},
        data={
            "model": "freya-stt-v1",
            "language": "tr",
            "response_format": "json",
        },
    )
    text = response.json()["text"]
```

**Input (multipart form-data):**
- `file` — Ses dosyasi (binary)
- `model` (default "freya-stt-v1")
- `language` — Dil kodu
- `prompt` — Opsiyonel kontekst ipucu
- `response_format` (default "json")
- `temperature` — Sampling temperature
- `timestamp_granularities` — Zaman damgasi detayi

**Auth:** `Authorization: Key FAL_KEY` (Bearer degil!)

### 3.3 /models — Model Listesi

```python
handler = await fal_client.submit_async(
    "freya-mypsdi253hbk/freya-stt/models",
    arguments={},
)
result = await handler.get()
# {"object": "list", "data": [{"id": "...", "object": "model", "owned_by": "freya-ai"}]}
```

**Bilinen model:** `freya-stt-v1`

---

## 4. OpenRouter LLM (Herhangi Dil Modeli)

fal.ai uzerinden OpenRouter altyapisi ile herhangi bir LLM kullanilabiliyor.

### 4.1 Streaming (ANA KULLANIM)

```python
# Sync
for event in fal_client.stream(
    "openrouter/router",
    arguments={
        "prompt": "Mehmet'ten supheleniyorum, sen ne dusunuyorsun?",
        "system_prompt": "Sen Ayse'sin. Agresif bir kisiligin var. Koylu rolundesin.",
        "model": "google/gemini-2.5-flash",
        "temperature": 0.8,
        "max_tokens": 200,
    },
):
    if "output" in event:
        print(event["output"])  # token token geliyor

# Async
async for event in fal_client.stream_async("openrouter/router", arguments={...}):
    ...
```

### 4.2 Queue (Async)

```python
handler = await fal_client.submit_async(
    "openrouter/router",
    arguments={
        "prompt": "...",
        "system_prompt": "...",
        "model": "google/gemini-2.5-flash",
        "temperature": 0.8,
        "max_tokens": 200,
    },
)
result = await handler.get()
text = result["output"]
cost = result["usage"]["cost"]
```

### 4.3 Schema

**Input:**
| Alan | Tip | Aciklama |
|------|-----|----------|
| `prompt` | string | Kullanici mesaji |
| `system_prompt` | string | Karakter kisiligi / talimatlar |
| `model` | string | Model adi (ornek: "google/gemini-2.5-flash") |
| `temperature` | float (default 1) | Yaraticilik. 0 = deterministik, 1 = cesitli |
| `max_tokens` | integer | Max yanit uzunlugu |
| `reasoning` | boolean | Dusunme sureci dahil mi |

**Output:**
| Alan | Tip | Aciklama |
|------|-----|----------|
| `output` | string | AI yaniti |
| `reasoning` | string | Dusunme sureci (reasoning=true ise) |
| `partial` | boolean | Streaming'de parcali mi |
| `error` | string | Hata mesaji |
| `usage.prompt_tokens` | int | Giris token sayisi |
| `usage.completion_tokens` | int | Cikis token sayisi |
| `usage.total_tokens` | int | Toplam token |
| `usage.cost` | float | Maliyet ($) |

**Ornek modeller:**
- `google/gemini-2.5-flash` — Hizli, ucuz. Bizim icin ideal.
- `google/gemini-2.5-pro` — Daha akilli, daha yavas
- `meta-llama/llama-4-maverick` — Acik kaynak
- `anthropic/claude-sonnet-4` — En iyi kalite, pahali

---

## 5. LiveKit Entegrasyonu

LiveKit'in OpenAI plugin'i uzerinden Freya modelleri kullailabilir. Gercek zamanli WebRTC ses icin.

```python
import openai as oai
from livekit import openai

headers = {"Authorization": "Key FAL_KEY"}

# STT
oai_stt_client = oai.AsyncClient(
    api_key="stub",
    base_url="https://fal.run/freya-mypsdi253hbk/freya-stt",
    default_headers=headers,
)
STT = openai.STT(client=oai_stt_client, model="freya-stt-v1")

# TTS
oai_tts_client = oai.AsyncClient(
    api_key="stub",
    base_url="https://fal.run/freya-mypsdi253hbk/freya-tts",
    default_headers=headers,
)
TTS = openai.TTS(client=oai_tts_client, model="freya-tts-v1")
```

**Not:** LiveKit kurulumu ekstra zaman alir. Hackathon icin WebSocket + fal_client ile baslamak daha guvenli.

---

## 6. Kesinlesmis Pipeline

### 6.1 Tek Konusma Turu (Adim Adim)

```
KULLANICI                    BACKEND (FastAPI)                    FAL.AI
─────────                    ────────────────                    ──────

1. Mikrofona konusur
   MediaRecorder API
   audio blob olusur
        │
        ├── WebSocket ──────> 2. Audio bytes alir
        │                        │
        │                        ├── fal storage'a yukler
        │                        │   url = fal_client.upload_file_async(bytes)
        │                        │
        │                        ├── STT ──────────────> 3. freya-stt/generate
        │                        │   audio_url=url          audio_url → metin
        │                        │   language="tr"          (default Turkce)
        │                        │ <─── metin ─────────
        │                        │
        │                        ├── LLM ──────────────> 4. openrouter/router
        │                        │   system_prompt=            prompt → yanit
        │                        │     karakter kisiligi       (streaming)
        │                        │   prompt=metin
        │                        │ <─── streaming text ──
        │                        │
        │                        ├── TTS ──────────────> 5. freya-tts/stream
        │                        │   input=yanit               metin → PCM16
        │                        │ <─── PCM16 chunks ───       (streaming)
        │                        │
        ├── WebSocket <──────  6. PCM16 chunk'lari
        │                        gonderir
        │
7. AudioContext ile
   aninda oynatir
```

### 6.2 Kullanilan Endpoint'ler ve Yontemler

| Adim | Endpoint | Yontem | Neden Bu |
|------|----------|--------|----------|
| Audio upload | `fal_client.upload_file_async()` | Async | URL almak icin |
| STT | `freya-stt/generate` | `fal_client.submit_async()` | Default TR, fal native |
| LLM | Google Gemini Flash (direkt API) | `google-genai` async | Streaming token |
| TTS | `freya-tts` + `/stream` | `fal_client.stream()` | Streaming PCM16 |
| Avatar | `fal-ai/flux/dev` | `fal_client.submit_async()` | Oyun basinda 1 kez |

### 6.3 Gercek Benchmark Sonuclari

| Adim | Sure |
|------|------|
| Audio upload (fal storage) | ~100ms |
| STT (freya-stt/generate) | ~300-500ms |
| LLM ilk token (Gemini Flash direkt API, thinking OFF) | ~450ms |
| TTS ilk chunk (freya-tts/stream) | ~850ms |
| **Pipeline ilk ses yaniti (LLM+TTS)** | **~1.30s** |
| **LLM only (speak)** | **~0.67s** |
| **Total stream (LLM+TTS tamamlanma)** | **~3.43s** |

OpenRouter middleman kaldirildi → LLM latency %48 dustu (2.5s → 1.30s first audio).
LLM streaming + TTS streaming paralel calisiyor: her clause bitince hemen TTS'e gonderiliyor.

---

## 7. Auth Ozeti

| Durum | Yontem |
|-------|--------|
| `fal_client` kullanirken | Otomatik — `FAL_KEY` env'den okur |
| httpx/requests ile direkt HTTP | Header: `Authorization: Key FAL_KEY` |
| OpenAI SDK ile (LiveKit) | `api_key="stub"` + header: `Authorization: Key FAL_KEY` |

**DIKKAT:** OpenAI SDK default `Bearer` gonderiyor. Freya `Key` bekliyor. `default_headers` ile override etmek gerekiyor.

---

## 8. Juri Icin fal.ai Kullanim Skoru

| # | fal.ai Servisi | Nerede Kullaniliyor |
|---|---------------|---------------------|
| 1 | Freya TTS Streaming | AI karakter sesleri (gercek zamanli) |
| 2 | Freya STT | Kullanici sesini metne cevirme |
| 3 | OpenRouter LLM | Karakter AI dusunmesi / yanit uretimi |
| 4 | FLUX | Karakter avatar goruntusu uretimi |
| 5 | Beatoven Music | Faz bazli ambiyans muzigi |
| 6 | Beatoven SFX | Olay bazli ses efektleri |
| 7 | fal Storage | Ses dosyasi yukleme (upload_file_async) |

**7 farkli fal.ai servisi tek projede.** Hackathon'daki en yuksek fal.ai kullanim skoru olmasi muhtemel.

---

## 9. Onemli Detaylar / Dikkat Edilecekler

| Konu | Detay |
|------|-------|
| Auth format | `Key` (Bearer degil!) |
| TTS streaming format | PCM16, 16kHz, mono, base64 encoded |
| STT default dil | Turkce ("tr") |
| STT max dosya | 25MB |
| STT desteklenen formatlar | flac, mp3, mp4, mpeg, mpga, m4a, ogg, oga, wav, webm |
| TTS desteklenen formatlar | mp3, opus, aac, flac, wav, pcm |
| TTS default format | wav |
| TTS hiz araligi | 0.25 - 4.0 (default 1.0) |
| Model isimleri | freya-tts-v1, freya-stt-v1 |
| LLM onerilen model | google/gemini-2.5-flash (hizli + ucuz) |
| STT response formatlari | json, text, verbose_json (segmentli), srt, vtt |
