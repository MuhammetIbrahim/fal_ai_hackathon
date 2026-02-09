# Freya + fal.ai API Notlari (Doc-by-Doc)

> Her resmi doc geldiginde buraya ekleniyor. Sallamadan, sadece doc'ta ne yaziyorsa o.

---

## DURUM TABLOSU

| Endpoint | Doc Goruldu | Yontem | Notlar |
|----------|------------|--------|--------|
| `freya-tts` (base) | EVET | `fal_client.submit_async()` | Servis bilgisi, asil is yapmaz. TTSRequest type tanimli |
| `freya-tts/audio/speech` | EVET | `fal_client.subscribe()` | OpenAI-uyumlu. Raw audio bytes donduruyor |
| `freya-tts/models` | EVET | `fal_client.submit_async()` | Model listesi dondurur. Output: ModelList |
| `freya-tts/stream` | EVET | `fal_client.stream()` | SSE streaming, base64 PCM16 chunk'lar |
| `freya-tts/generate` | EVET | `fal_client.submit_async()` | CDN URL donduruyor (File object) |
| `freya-stt` (base) | EVET | `fal_client.submit_async()` | Servis bilgisi. Transcription type tanimli |
| `freya-stt/audio/transcriptions` | EVET (base icerisinde) | httpx POST (multipart) | OpenAI-uyumlu. Dosya yukle → metin al |
| `freya-stt/generate` | EVET | `fal_client.submit_async()` | fal.ai native. URL ver → metin al. Default dil: TR! |
| `freya-stt/models` | EVET | `fal_client.submit_async()` | Model listesi. Default model: freya-stt-v1 |
| `openrouter/router` | EVET | `fal_client.stream()` / `submit_async()` | Herhangi LLM. Streaming destekli |

---

## 1. freya-tts (base)

- **URL:** `freya-mypsdi253hbk/freya-tts`
- **Aciklama:** Root endpoint with service info
- **Input:** Yok (bos arguments)
- **Output:** Yok (sadece servis bilgisi)
- **Yontem:** `fal_client.submit_async("freya-mypsdi253hbk/freya-tts", arguments={})`
- **Type tanimlari:**
  - **TTSRequest:** `input` (str), `response_format` (mp3/opus/aac/flac/wav/pcm, default wav), `speed` (float, default 1)
  - **ModelObject:** `id` (str), `object` ("model"), `created` (int), `owned_by` ("freya-ai")
  - **File:** `url`, `content_type`, `file_name`, `file_size`
  - **ModelList:** `object` ("list"), `data` (list of ModelObject)

---

## 2. freya-tts/audio/speech

- **URL:** `freya-mypsdi253hbk/freya-tts/audio/speech`
- **Aciklama:** Generate speech from text (OpenAI-compatible). Returns raw audio bytes directly.
- **Input:**
  - `input` (string) — Text to synthesize
  - `response_format` (enum: mp3/opus/aac/flac/wav/pcm, default "wav")
  - `speed` (float, default 1) — Playback speed
- **Output:** Doc'ta output schema TANIMLANMAMIS. Aciklamada "returns raw audio bytes directly" diyor.
- **Yontem:**
  ```python
  # Sync
  result = fal_client.subscribe(
      "freya-mypsdi253hbk/freya-tts/audio/speech",
      arguments={"input": "Merhaba", "response_format": "wav", "speed": 1},
  )

  # Async
  handler = await fal_client.submit_async(
      "freya-mypsdi253hbk/freya-tts/audio/speech",
      arguments={"input": "Merhaba"},
  )
  result = await handler.get()
  ```
- **NOT:** Gist'te httpx POST ile de cagrilmis (`https://fal.run/.../audio/speech`), ama resmi doc `fal_client` gosteriyor.

---

## 3. freya-tts/models

- **URL:** `freya-mypsdi253hbk/freya-tts/models`
- **Aciklama:** List available models (OpenAI-compatible endpoint)
- **Input:** Yok (bos arguments)
- **Output:**
  ```json
  {
    "object": "list",
    "data": [
      {"id": "", "object": "model", "owned_by": "freya-ai"}
    ]
  }
  ```
- **Yontem:** `fal_client.submit_async("freya-mypsdi253hbk/freya-tts/models", arguments={})`

---

## 4. openrouter/router

- **URL:** `openrouter/router`
- **Aciklama:** Run any LLM with fal, powered by OpenRouter
- **Input:**
  - `prompt` (string) — Chat completion prompt
  - `system_prompt` (string) — Context/instructions
  - `model` (string) — Model adi (ornek: "google/gemini-2.5-flash")
  - `reasoning` (boolean) — Reasoning dahil mi
  - `temperature` (float, default 1)
  - `max_tokens` (integer)
- **Output:**
  - `output` (string) — Generated text
  - `reasoning` (string) — Reasoning (eger aciksa)
  - `partial` (boolean) — Streaming'de parcali mi
  - `error` (string) — Hata varsa
  - `usage` — { prompt_tokens, completion_tokens, total_tokens, cost }
- **Yontemler:**
  - Streaming: `fal_client.stream("openrouter/router", arguments={...})`
  - Async streaming: `fal_client.stream_async("openrouter/router", arguments={...})`
  - Queue: `fal_client.submit_async("openrouter/router", arguments={...})`
  - Sync: `fal_client.subscribe("openrouter/router", arguments={...})`

---

## GIST ORNEKLERI (Topluluk, resmi degil)

### fal_stream_client.py
- `fal_client.stream(TTS_ENDPOINT, arguments={"input": text, "speed": speed}, path="/stream")`
- Event'ler: `{"audio": "base64"}`, `{"error": {...}, "recoverable": bool}`, `{"done": true, "inference_time_ms": ..., "audio_duration_sec": ...}`
- PCM16, 16kHz, mono

### openai_compat_client.py
- httpx POST → `https://fal.run/{TTS_ENDPOINT}/audio/speech`
- Auth: `Authorization: Key {fal_key}`
- Response headers: `X-Inference-Time-Ms`, `X-Audio-Duration-Sec`

### tts_stt_pipeline.py
- TTS: `fal_client.subscribe(TTS_ENDPOINT, path="/generate")` → `result["audio"]["url"]` (CDN URL)
- STT: httpx POST → `STT_ENDPOINT/audio/transcriptions` with multipart file + `data={"language": "tr"}`
- STT Response: `{"text": "transcribed text"}`

### livekit_integration.py
- OpenAI AsyncClient ile custom base_url + `Authorization: Key` header
- Model names: `freya-stt-v1`, `freya-tts-v1`
- LiveKit openai plugin STT/TTS wrapperlari

---

## 5. freya-tts/generate

- **URL:** `freya-mypsdi253hbk/freya-tts/generate`
- **Aciklama:** Generate speech from text (fal.ai playground-friendly). Returns JSON with a CDN file URL.
- **Input:** (TTSRequest ile ayni)
  - `input` (string) — Text to synthesize
  - `response_format` (enum: mp3/opus/aac/flac/wav/pcm, default "wav")
  - `speed` (float, default 1)
- **Output:**
  - `audio` (File) — CDN URL'li ses dosyasi: `{"url": "...", "content_type": "...", "file_name": "...", "file_size": ...}`
  - `inference_time_ms` (float) — Pure inference suresi (dosya yukleme haric)
  - `audio_duration_sec` (float) — Uretilen sesin suresi
- **Yontem:**
  ```python
  handler = await fal_client.submit_async(
      "freya-mypsdi253hbk/freya-tts/generate",
      arguments={"input": "Merhaba", "response_format": "wav", "speed": 1},
  )
  result = await handler.get()
  audio_url = result["audio"]["url"]  # CDN URL
  ```
- **Kullanim alani:** Once uret, sonra indir/oynat. Streaming gerektirmeyen durumlar.

---

## 6. freya-tts/stream (EN KRITIK)

- **URL:** `freya-mypsdi253hbk/freya-tts/stream`
- **Aciklama:** Stream audio generation via Server-Sent Events. Yields base64-encoded PCM16 audio chunks as they are generated, followed by a final event with metadata.
- **Input:** (TTSRequest ile ayni)
  - `input` (string) — Text to synthesize
  - `response_format` (enum: mp3/opus/aac/flac/wav/pcm, default "wav")
  - `speed` (float, default 1)
- **Output:** SSE event'leri (output schema doc'ta bos, ama About ve gist'ten biliyoruz):
  - `{"audio": "base64_pcm16"}` — Her ses chunk'i
  - `{"error": {"message": "..."}, "recoverable": bool}` — Hata event'i
  - `{"done": true, "inference_time_ms": float, "audio_duration_sec": float}` — Bitis event'i
- **Audio format:** PCM16, 16kHz, mono, 2 bytes/sample
- **Resmi kullanim (doc About'tan):**
  ```python
  for event in fal_client.stream("freya-mypsdi253hbk/freya-tts",
      arguments={"input": "Merhaba", "speed": 1.0},
      path="/stream"):

      audio_b64 = event.get("audio")  # base64 PCM16 chunk
      if event.get("done"):
          print(event["inference_time_ms"], event["audio_duration_sec"])
  ```
- **Async versiyon (gist'ten, dogrulanmadi):**
  ```python
  stream = fal_client.stream_async("freya-mypsdi253hbk/freya-tts",
      arguments={"input": "Merhaba", "speed": 1.0},
      path="/stream")
  async for event in stream:
      ...
  ```
- **NOT 1:** Doc sayfasinda `submit_async` ornegi de gosteriliyor ama bu streaming davranisi degil, queue bazli. Gercek streaming icin `fal_client.stream()` kullanilmali.
- **NOT 2:** Bu bizim proje icin EN ONEMLI endpoint. Dusuk latency ses streaming burada.

---

## 7. freya-stt (base)

- **URL:** `freya-mypsdi253hbk/freya-stt`
- **Aciklama:** Root endpoint with server information
- **Input:** Yok
- **Output:** Yok
- **Type tanimlari (ONEMLI — /audio/transcriptions icin schema burada):**
  - **Body_create_transcription_audio_transcriptions_post:**
    - `file` (string) — Ses dosyasi
    - `model` (string, default "freya-stt-v1") — Kullanilacak model
    - `language` (string) — Dil kodu (ornek: "tr")
    - `prompt` (string) — Opsiyonel ipucu prompt'u
    - `response_format` (string, default "json") — Cikti formati
    - `temperature` (float) — Sampling temperature
    - `timestamp_granularities` (list of string) — Zaman damgasi detayi

---

## 8. freya-stt/audio/transcriptions

- **URL:** `freya-mypsdi253hbk/freya-stt/audio/transcriptions`
- **Aciklama:** OpenAI-uyumlu transkripsiyon endpoint'i. Dosya yukleme ile calisiyor.
- **Ayri doc sayfasi yok** — schema bilgisi base endpoint'in "Other types" bolumunde tanimli.
- **Input:** (multipart form-data)
  - `file` — Ses dosyasi (binary upload)
  - `model` — default "freya-stt-v1"
  - `language` — Dil kodu (ornek: "tr")
  - `prompt` — Opsiyonel kontekst/ipucu
  - `response_format` — default "json"
  - `temperature` — Sampling temperature
  - `timestamp_granularities` — Zaman damgasi detayi
- **Output:** `{"text": "transkripsiyon metni"}` (gist'ten)
- **Yontem:** (gist'ten — resmi doc'ta fal_client ornegi yok, httpx POST kullaniliyor)
  ```python
  import httpx

  response = httpx.post(
      "https://fal.run/freya-mypsdi253hbk/freya-stt/audio/transcriptions",
      headers={"Authorization": f"Key {FAL_KEY}"},
      files={"file": ("audio.wav", audio_bytes)},
      data={"language": "tr", "model": "freya-stt-v1"},
  )
  text = response.json()["text"]
  ```
- **NOT:** Bu endpoint OpenAI Whisper API'si ile ayni formatta. `Authorization: Key` farki var.

---

## 9. freya-stt/generate (FAL.AI NATIVE — ONEMLI)

- **URL:** `freya-mypsdi253hbk/freya-stt/generate`
- **Aciklama:** fal.ai native transcription endpoint. Accepts audio via URL and returns transcription.
- **Desteklenen formatlar:** flac, mp3, mp4, mpeg, mpga, m4a, ogg, oga, wav, webm
- **Max dosya boyutu:** 25MB
- **Input:**
  - `audio_url` (string) — Ses dosyasinin URL'si (CDN, public URL, veya fal storage)
  - `language` (string, **default "tr"**) — Dil. DEFAULT TURKCE!
  - `response_format` (enum: json/text/verbose_json/srt/vtt, default "json")
- **Output:** Doc'ta tanimlanmamis ama muhtemelen `{"text": "..."}` veya verbose_json icin segment'li format
- **Yontem:**
  ```python
  handler = await fal_client.submit_async(
      "freya-mypsdi253hbk/freya-stt/generate",
      arguments={
          "audio_url": "https://cdn.fal.ai/some-audio.wav",
          "language": "tr",
          "response_format": "json",
      },
  )
  result = await handler.get()
  ```
- **KRITIK FARK /audio/transcriptions'dan:**
  - `/audio/transcriptions` → dosya yukleme (binary), httpx POST
  - `/generate` → URL verme, fal_client ile. **Bizim icin daha uygun** cunku:
    1. fal storage'a yuklenen ses dosyasinin URL'sini verebiliriz
    2. fal_client ile async calisiyor, FastAPI'ye dogal uyumlu
    3. Default dil zaten Turkce

---

## 10. freya-stt/models

- **URL:** `freya-mypsdi253hbk/freya-stt/models`
- **Aciklama:** List available models (OpenAI-compatible endpoint)
- **Input:** Yok
- **Output:**
  ```json
  {
    "object": "list",
    "data": [
      {"id": "", "object": "model", "owned_by": "freya-ai"}
    ]
  }
  ```
- **Yontem:** `fal_client.submit_async("freya-mypsdi253hbk/freya-stt/models", arguments={})`

---

## TUM DOC'LAR TAMAMLANDI

### TTS Endpoint Ozeti
| Endpoint | Ne Yapar | Bizim Kullanimimiz |
|----------|---------|-------------------|
| `/audio/speech` | Raw audio bytes (OpenAI-uyumlu) | LiveKit entegrasyonu icin |
| `/generate` | CDN URL dondurur | Onceden uretilmis sesler icin |
| `/stream` | **SSE streaming PCM16 chunk** | **ANA KULLANIM — gercek zamanli ses** |
| `/models` | Model listesi | Debug/test icin |

### STT Endpoint Ozeti
| Endpoint | Ne Yapar | Bizim Kullanimimiz |
|----------|---------|-------------------|
| `/audio/transcriptions` | Dosya yukle → metin (OpenAI-uyumlu) | LiveKit entegrasyonu icin |
| `/generate` | **URL ver → metin (fal native, default TR)** | **ANA KULLANIM — fal_client ile async** |
| `/models` | Model listesi | Debug/test icin |

### LLM
| Endpoint | Ne Yapar | Bizim Kullanimimiz |
|----------|---------|-------------------|
| `openrouter/router` | Herhangi LLM, streaming destekli | **Karakter AI dusunmesi** |

### Diger fal.ai Servisleri (doc'lari zaten biliniyor)
| Servis | Kullanim |
|--------|---------|
| `fal-ai/flux/dev` | Avatar uretimi |
| Beatoven Music | Ambiyans muzik |
| Beatoven SFX | Ses efektleri |

### Bizim Pipeline (Kesinlesmis)
```
1. Kullanici ses kaydeder (browser MediaRecorder)
2. fal storage'a yukle → URL al
3. freya-stt/generate (audio_url=URL, language="tr") → metin
4. openrouter/router (system_prompt=karakter, prompt=metin) → streaming yanit
5. freya-tts/stream (input=yanit) → PCM16 chunk'lar
6. WebSocket ile browser'a gonder → AudioContext ile oynat
```
