# Hackathon Juri Soru & Cevaplari

---

## 1. GENEL PROJE

### S: Bu proje ne yapiyor, tek cumlede ozetler misiniz?
**C:** Oyun studyolari icin game-agnostic bir Character AI servisi sunduk — LLM ile karakter uretimi ve diyalog, Freya AI ile Turkce ses (TTS/STT), FLUX ile gorsel uretimi, hepsi tek bir API uzerinden.

### S: Neden boyle bir seye ihtiyac var? Mevcut cozumlerden farki ne?
**C:** Oyun studyolari genellikle NPC diyaloglarini elle yazmak zorunda kaliyor, bu hem pahali hem yavas. Biz karakter kisiligini, dunya kurallarini ve konusma stilini tanimlayip, gerisini AI'a birakiyoruz. Farkimiz:
- **Game-agnostic**: Herhangi bir oyun motoruna entegre olabilir (Unity, Unreal, custom)
- **Multi-tenant**: Her studyo kendi izole verisinde calisir
- **Orkestrasyon**: Birden fazla AI karakter arasinda otomatik konusma yonetimi (kim konusacak, kim tepki verecek)
- **Turkce odakli**: TTS/STT Turkce destekli (Freya AI)

### S: Hedef kitleniz kim?
**C:** Birincil: Indie ve orta olcekli oyun studyolari. Ikincil: Interaktif hikaye uygulamalari, egitim simasyonlari, sanal asistan uretmek isteyen her gelistirici.

---

## 2. TEKNIK MIMARI

### S: Hangi teknolojileri/servisleri kullaniyorsunuz?
**C:**
| Katman | Teknoloji |
|--------|-----------|
| Backend API | Python, FastAPI, Uvicorn |
| LLM | Google Gemini Flash (direkt API, OpenRouter kaldirildi) |
| TTS/STT | fal.ai uzerinden Freya AI |
| Gorsel | fal.ai uzerinden FLUX (dev/schnell/pro) |
| Frontend | React + TypeScript + Vite |
| Deployment | Docker |

### S: Neden Gemini Flash sectiniz, neden GPT-4 veya Claude degil?
**C:** Latency ve maliyet optimizasyonu. Gemini Flash direkt API ile:
- Ilk token **~0.45s** (OpenRouter uzerinden ~1.1s'di, %48 dusus)
- Karakter diyalogu icin yeterli kalite, cok daha dusuk maliyet
- Thinking OFF ile minimum overhead

Gerekirse model degistirmek kolay — `/v1/llm/generate` endpoint'inde `model` parametresi var.

### S: fal.ai'yi neden tercih ettiniz?
**C:** Turkce TTS/STT icin Freya AI fal.ai uzerinde calisiyor, FLUX gorsel uretimi de ayni platform. Tek bir altyapi uzerinden hem ses hem gorsel hem LLM hizmetlerini birlesik olarak kullanabiliyoruz. Ayrica fal.ai'nin serverless yapisi auto-scaling sagliyor.

### S: Streaming nasil calisiyor?
**C:** SSE (Server-Sent Events) kullaniyoruz. Pipeline su sekilde:
1. LLM token token metin uretiyor → `text_token` event'leri client'a akiyor
2. Cumle tamamlaninca TTS'e gonderiliyor → `sentence_ready` event'i
3. TTS PCM16 audio chunk'lar donduruyor → `audio_chunk` event'leri
4. Client tarafinda metin ve ses paralel handle ediliyor

Bu sayede kullanici ilk sesi **~1.3 saniyede** duymaya basliyor (polling'de ~5.6s'di).

### S: Neden WebSocket degil de SSE?
**C:** SSE tek yonlu (server → client) ve bizim use case'imiz icin yeterli. Client'tan server'a sadece HTTP POST'lar gidiyor (mesaj gonderme). SSE'nin avantajlari:
- Daha basit implementasyon
- HTTP/2 ile multiplexing
- Auto-reconnect destegi
- Load balancer uyumlulugu daha iyi

### S: Veritabaniniz ne? Olceklenebilirlik?
**C:** Su an in-memory store kullaniyoruz (hackathon scope). Production'da Redis/PostgreSQL'e gecis planlanmis. Multi-tenant izolasyon API key bazli — her tenant sadece kendi verisini goruyor.

---

## 3. KARAKTER AI ve ORKESTRASYON

### S: Karakter kisiliginizi nasil modelliyorsunuz?
**C:** 3 katmanli bir yaklasim:
1. **Arketip**: 6 onanimli kisilik sablonu (Supheci Sessiz, Saldirgan, Cekici Manipulator vb.)
2. **Lore + Personality**: Serbest metin olarak karakter gecmisi ve kisilik ozellikleri
3. **Acting Prompt**: LLM tarafindan otomatik uretilen, karakterin "nasil konusacagini" tanimlayan prompt

Bunlar birlesitirilip system prompt olarak LLM'e gonderiliyor. Studyo isterse `system_prompt` ile tamamen override edebilir.

### S: Orkestrator nasil calisiyor? Kim konusacagina nasil karar veriyor?
**C:** Bir conversation turn'unda:
1. Tum karakterlerden **paralel olarak tepki** (`react`) toplanir
2. Her karakter `wants_to_speak: true/false` doner
3. **Meta-LLM** (orkestrator) tum tepkilere bakarak en uygun konusmaciyi secer
4. Secim gerekcelesi `orchestrator_reason` olarak doner

Bu, dogal bir grup konusma dinamigi yaratir — en alakali/duygusal tepki veren konusur.

### S: Karakterlerin hafizasi var mi?
**C:** Evet. Her `speak` cagrisi otomatik olarak karakterin hafizasina eklenir. `GET /v1/characters/{id}/memory` ile tum gecmis konusma exchange'leri alinabilir. Bu sayede karakter onceki konusmalardan haberdar.

### S: Moderation/icerik filtreleme var mi?
**C:** Evet. Dunya tanininda `taboo_words` ve `rules` tanimlanir. Karakter konusturuldugunda otomatik moderation uygulanir:
```json
"moderation": { "passed": true, "reason": null }
```
Kurallar ihmal edilirse `passed: false` + neden doner. Ornegin bir fantazi oyununda "telefon", "internet" gibi kelimeleri yasaklayabilirsiniz.

---

## 4. SES SERVISI — TEKNIK DETAY (VOICE)

### S: Ses pipeline'iniz tam olarak nasil calisiyor? Uçtan uca anlatir misiniz?
**C:** Iki yonlu ses pipeline'imiz var:

**Konusma uretimi (TTS Pipeline):**
```
Kullanici mesaji → LLM (Gemini Flash) → Turkce metin → Freya AI TTS → Ses
```
Detayli akis:
1. Kullanici mesaj gonderir (text veya STT ile)
2. Karakter system prompt'u + mesaj LLM'e gider
3. LLM token token metin uretir (streaming)
4. Cumle tamamlaninca **hemen** Freya AI TTS'e gonderilir (LLM hala sonraki cumleyi uretirken)
5. TTS, PCM16 formatinda audio chunk'lar dondurur
6. Client tarafinda AudioContext API ile aninda oynatilir

**Ses tanima (STT Pipeline):**
```
Mikrofon → WebRTC (noise filter) → WebM kayit → base64 → Backend → Freya AI STT → Turkce metin
```

Bu iki pipeline birlesiince tam bir **sesli diyalog dongusu** olusur: Kullanici konusur → metin cevirilir → karakter yanitlar → ses olarak geri doner.

### S: Neden iki farkli TTS endpoint'iniz var? (polling vs streaming)
**C:** Farkli use-case'ler icin optimize ettik:

| | `POST /v1/voice/tts` (Polling) | `POST /v1/voice/tts/stream` (SSE) |
|---|---|---|
| **Donus** | `202` + job_id, sonra polling | SSE event stream |
| **Format** | MP3 — CDN URL | PCM16 raw audio chunks |
| **Ilk ses** | ~5-6 saniye (job tamamlanmali) | **~1.3 saniye** |
| **Kalite** | Yuksek (MP3, post-processing) | Ham ama aninda |
| **Use case** | Cache'lenecek sesler, cutscene | Canli diyalog, real-time |
| **Avantaj** | Kaliteli, tekrar oynatilabilir CDN URL | Ultra dusuk latency |

Oyun studyosu ikisini birlikte kullanir: Cutscene diyaloglari icin polling (onceden uretilip cache'lenir), canli NPC konusmasi icin streaming.

### S: Streaming TTS teknik olarak nasil calisiyor? SSE event'leri ne?
**C:** `/v1/voice/tts/stream` endpoint'i Server-Sent Events donduruyor:

```
event: audio_chunk
data: {"chunk_index": 0, "audio_base64": "UklGR...", "format": "pcm16", "sample_rate": 16000, "channels": 1}

event: audio_chunk
data: {"chunk_index": 1, "audio_base64": "aBcDeF...", "format": "pcm16", "sample_rate": 16000, "channels": 1}

event: done
data: {"total_chunks": 5, "format": "pcm16", "sample_rate": 16000}
```

Client tarafinda:
1. Her `audio_chunk` event'inde base64 decode yapilir
2. PCM16 data AudioContext buffer'ina yazilir
3. Chunk'lar sirayla kuyruge eklenir ve kesintisiz oynatilir
4. `done` event'i gelince stream kapanir

### S: speak/stream endpoint'i neden farkli? Sadece TTS degil mi?
**C:** Hayir, `POST /v1/characters/{id}/speak/stream` **LLM + TTS pipeline'inin tamamini** tek endpoint'te birlestiriyor. Event akisi:

```
1. text_token  → {"token": "Ben"}           ← LLM metin uretiyor
2. text_token  → {"token": " Theron"}
3. text_token  → {"token": "."}
4. sentence_ready → {"sentence": "Ben Theron."}  ← Cumle tamamlandi
5. audio_chunk → {"chunk_index": 0, "audio_base64": "..."}  ← TTS basliyor
6. audio_chunk → {"chunk_index": 1, ...}
7. text_token  → {"token": "Demirciyim"}     ← LLM hala devam ediyor!
8. ...
9. moderation  → {"passed": true}            ← Icerik kontrolu
10. done       → {"character_id": "...", "total_audio_chunks": 12}
```

**Kritik nokta:** Event'ler **interleave** olur — LLM 2. cumleyi uretirken, 1. cumlenin sesi zaten caliyor. Bu sayede kullanici beklemez.

### S: Conversation turn/stream bundan nasil farkli?
**C:** `POST /v1/conversations/{id}/turn/stream` ayni pipeline'a **orkestrasyon katmani** ekler:

```
1. reactions    → tum karakterlerin ic tepkileri (paralel toplanir)
2. speaker      → orkestrator'un sectigi konusmaci + gerekcesi
3. text_token   → secilen karakterin konusmasi baslar
4. sentence_ready + audio_chunk → ses akisi
5. done         → tur ozeti
```

Yani: tepki toplama → konusmaci secimi → konusma + ses, hepsi tek SSE stream'inde.

### S: Ses uretimi ne kadar hizli? Benchmark'lariniz var mi?
**C:** Evet, olctuk:

| Metrik | Polling (eski) | Streaming (OpenRouter) | Streaming (Gemini direkt) |
|--------|---------|-----------|--------|
| LLM ilk token | ~2.1s | ~1.1s | **~0.45s** |
| LLM toplam (speak) | ~2.5s | ~1.5s | **~0.67s** |
| Pipeline ilk ses | ~5.6s | ~2.5s | **~1.30s** |
| Toplam stream suresi | ~7.0s | ~3.5s | **~3.43s** |
| 3x paralel TTS | ~5.0s (sirali) | ~1.5s avg | ~1.5s avg |

**Optimizasyon gecmisi:**
1. OpenRouter → Gemini direkt API: LLM latency **%48 dusus**
2. Polling → Streaming: Ilk ses **%77 daha erken** (5.6s → 1.3s)
3. Sentence-level chunking: LLM uretirken TTS paralel calisir

### S: PCM16 formatini neden sectiniz? MP3 olmaz mi?
**C:** Streaming icin PCM16 secmemizin 3 nedeni var:
1. **Sifir decode latency**: PCM16 raw audio — decode gerektirmez, direkt AudioContext'e yazilir. MP3 decode ek latency ekler
2. **Chunk-friendly**: PCM16 herhangi bir byte boundary'de kesilebilir. MP3 frame boundary gerektirir, bu chunking'i zorlastirir
3. **Basitlik**: 16kHz mono PCM16 = her sample 2 byte, hesaplamasi kolay

Polling endpoint'te MP3 kullaniyoruz cunku orada latency degil kalite ve dosya boyutu oncelikli.

### S: Audio format detaylari nedir?
**C:**
| Ozellik | Streaming (PCM16) | Polling (MP3) |
|---------|-------------------|---------------|
| Format | Raw PCM16 signed LE | MP3 |
| Sample rate | 16,000 Hz | Degisken |
| Channels | 1 (mono) | 1 (mono) |
| Bit depth | 16-bit | Degisken |
| Encoding | base64 (SSE icinde) | CDN URL |
| Byte/saniye | 32,000 bytes | ~16,000 bytes (128kbps) |

### S: STT (Speech-to-Text) nasil calisiyor? Teknik detay?
**C:** `POST /v1/voice/stt` — senkron endpoint, iki input yontemi destekler:

**1. Audio URL ile:**
```json
{ "audio_url": "https://example.com/ses.wav" }
```

**2. Base64 ile (client-side kayit icin):**
```json
{ "audio_base64": "UklGRi4AAABXQVZFZm10IBAAAA..." }
```

Backend'de Freya AI STT modeline gonderilir, Turkce metin doner:
```json
{ "text": "Merhaba ben Theron" }
```

Client tarafindaki akis:
1. Mikrofon `getUserMedia` ile acilir (WebRTC noise filter aktif)
2. `MediaRecorder` ile WebM formatinda kaydedilir
3. Kayit bitince blob → base64 cevirisi yapilir
4. Backend'e POST edilir → Freya AI STT → metin doner

### S: Kac farkli ses (voice) var? Yeni ses eklenebilir mi?
**C:** Su an 3 ses:

| Voice ID | Isim | Karakter |
|----------|------|----------|
| `alloy` | Alloy | Notr, genel amacli |
| `zeynep` | Zeynep | Kadin, Turkce dogal |
| `ali` | Ali | Erkek, Turkce dogal |

`GET /v1/voice/voices` ile guncel liste alinir. Freya AI tarafinda yeni ses eklendikce API'de otomatik kullanilabilir.

TTS cagrilarinda voice ve speed parametreleri ile kontrol edilir:
```json
{ "text": "Merhaba", "voice": "zeynep", "speed": 1.2 }
```
Speed 0.5 (yavas) — 2.0 (hizli) arasi. Varsayilan 1.0.

### S: Gurultulu ortamda ses tanima kalitesi ne olur? Noise cancellation var mi?
**C:** Evet, **3 katmanli ses filtreleme** uyguluyoruz:

**Katman 1 — WebRTC (tarayici, client-side):**
```typescript
getUserMedia({
  audio: {
    noiseSuppression: true,   // Arka plan gurultusu bastirma
    echoCancellation: true,   // Hoparlor → mikrofon echo engelleme
    autoGainControl: true,    // Ses seviyesi otomatik dengeleme
  }
})
```
Bu, ses kaydedilmeden **once** tarayici seviyesinde filtreleme yapar. Ortam gurultusu, fan sesi, uzak konusmalar bastiirilir.

**Katman 2 — Freya AI STT (model seviyesi):**
Freya AI'nin STT modeli ML tabanli oldugu icin belirli olcude noise-tolerant calisir. Hafif gurultulu seslerde bile dogru transkripsiyon yapar.

**Katman 3 — Minimum kayit suresi (application seviyesi):**
800ms'den kisa kayitlar reddedilir — yanlislikla tiklama, ufleme gibi seslerin STT'ye gitmesi onlenir.

### S: Client tarafinda audio playback nasil yonetiliyor?
**C:** Ozel bir `AudioQueue` sinifimiz var:
- **Kuyruk sistemi**: Gelen audio chunk'lar sirayla kuyruge eklenir
- **Tekli oynatma**: Ayni anda sadece 1 ses calar — yeni ses geldiginde onceki kesilir
- **Fade-in/Fade-out**: Volume gecisleri yumusak yapilir (pop/click onleme)
- **AudioContext API**: Tarayici autoplay policy'sine uyumlu — kullanici ilk etkilesimden sonra context unlock edilir
- **Stop kontrolu**: Kullanici konusmaya basladiginda calan ses aninda durdurulur

### S: Ses ve metin senkronizasyonu nasil saglaniyor?
**C:** Streaming'de event siralama ile:
1. `text_token` event'leri → UI'da metin gorunur (typing effect)
2. `sentence_ready` → cumle tamamlandi, TTS basladi sinyali
3. `audio_chunk` → cumlenin sesi geldi, oynatmaya basla

Client tarafinda `sentence_index` ile hangi chunk'in hangi cumleye ait oldugu bilinir. Boylece metin ve ses senkron ilerler. Ornegin karakter 3 cumle soyluyorsa, kullanici 1. cumlenin sesini dinlerken 2. ve 3. cumlelerin metni ekranda beliriyor olabilir.

### S: Bir studyo kendi voice clone'unu ekleyebilir mi?
**C:** Su an API uzerinden custom voice ekleme endpoint'i yok — Freya AI'nin sunduğu 3 ses kullaniliyor. Ancak:
- Mimari buna hazir: TTS cagrilarinda `voice` parametresi string — yeni voice ID eklenmesi backend'de tek satirlik degisiklik
- **Roadmap'te var**: Studyonun kendi ses ornegini yukleyip custom voice olusturmasi planlaniyor
- fal.ai tarafinda voice cloning destegi geldiginde API'ye hemen entegre edilecek

---

## 5. GORSEL URETIM

### S: Gorsel uretiminde hangi modeli kullaniyorsunuz?
**C:** FLUX modelleri (fal.ai uzerinden):
- `dev`: Varsayilan, dengeli kalite/hiz
- `schnell`: Hizli, prototipleme icin
- `pro`: En yuksek kalite, yavas

### S: Deterministic uretim yapabilir misiniz?
**C:** Evet. `seed` parametresi ile ayni prompt + ayni seed = ayni gorsel. Bu, karakter tutarliligi icin onemli.

### S: Ne tur gorseller uretebiliyorsunuz?
**C:** Iki tip:
1. **Avatar**: Karakter portresi (512x512 varsayilan, 256-1024 arasi)
2. **Background**: Sahne arka plani (1344x768 varsayilan, 512-2048 arasi)

Stil secenekleri: `pixel_art`, `realistic`, `anime`, `painterly` veya tamamen custom prompt.

---

## 6. API TASARIMI

### S: API'niz RESTful mi?
**C:** Evet, standart REST prensipleri. Tum endpoint'ler JSON request/response, proper HTTP status kodlari (201 create, 202 async, 204 delete, 4xx/5xx hatalar), ve tutarli hata formati.

### S: Rate limiting var mi?
**C:** API seviyesinde henuz yok (hackathon scope). fal.ai tarafinda rate limit uygulanir (429 hatasi job'da geri doner). Production'da tenant bazli rate limiting planli.

### S: Asenkron islemleri nasil yonetiyorsunuz?
**C:** TTS ve gorsel uretimi icin **job-based async pattern**:
1. `POST` → `202 { job_id, status: "pending" }`
2. Polling: `GET /v1/jobs/{job_id}` → `pending` / `processing` / `completed` / `failed`
3. Job'lar 24 saat sonra otomatik temizlenir

Ayrica streaming alternatifi var (SSE) — dusuk latency gerektiginde tercih edilir.

### S: Multi-tenancy nasil calisiyor?
**C:** API key bazli tenant izolasyonu:
- Her API key bir `tenant_id`'ye eslenir
- Tum veri islemleri tenant bazli filtrelenir
- Tenant A, Tenant B'nin verilerini goremez
- Gecersiz/eksik key icin `401 INVALID_API_KEY`

---

## 7. DEMO ve KULLANIM SENARYOLARI

### S: Canli demo gosterebilir misiniz?
**C:** Evet, su adimlari gosterebiliriz:
1. Dunya olustur ("Sis Koyu" — gotik fantazi, yasakli kelimeler tanimli)
2. 2-3 karakter olustur (farkli arketipler)
3. Konusma baslat — karakterlerin birbirleriyle tartismalarini dinle
4. Sesli diyalog — karakter Turkce konusur
5. Avatar uret — karakterin gorselini olustur
6. Voice chat — mikrofona konusarak karakterle etkilesim

### S: Bir oyun studyosu bunu nasil entegre eder?
**C:** Sadece HTTP istekleri:
1. Oyun baslarken: `POST /v1/worlds` + `POST /v1/characters/batch` (5 NPC bir seferde)
2. Oyuncu NPC'ye yaklasinca: `POST /v1/characters/{id}/speak/stream` (SSE ile canli ses)
3. Grup sahnesi: `POST /v1/conversations` → `/turn/stream` (orkestrator otomatik yonetir)
4. Oyuncu mikrofona konusursa: `POST /v1/voice/stt` → mesaji al → `/speak`

Unity/Unreal icin sadece HTTP client + SSE parser yeterli.

---

## 8. GELECEK PLANLARI

### S: Production'a cikarma planiniz var mi?
**C:** Hackathon sonrasi roadmap:
- [ ] Persistent storage (PostgreSQL + Redis cache)
- [ ] Tenant bazli rate limiting
- [ ] Karakter ses klonlama (custom voice)
- [ ] Emotion detection (STT + sentiment analysis)
- [ ] WebSocket desteği (bidirectional real-time)
- [ ] Unity/Unreal SDK paketleri
- [ ] **Noise cancellation** (WebRTC constraints + Web Audio API filtreleri)

### S: Monetizasyon modeliniz ne?
**C:** API-as-a-service: Tenant bazli kullanim olcumlu fiyatlandirma (karakter sayisi, konusma turu, ses dakikasi, gorsel uretimi).

---

## 9. ZORLUKLAR ve COZUMLER

### S: En buyuk teknik zorluk ne oldu?
**C:**
1. **Latency**: OpenRouter uzerinden LLM cagrilari cok yavasti (~2.1s ilk token). Gemini direkt API'ye gecerek %48 dusurduk.
2. **Streaming pipeline**: LLM metin uretirken paralel TTS baslatmak icin sentence-level chunking implementasyonu.
3. **Orkestrasyon**: Birden fazla karakterin dogal siralamasini saglamak — her karakterden paralel tepki toplayip meta-LLM ile sira belirleme.

### S: Hata yonetimi nasil?
**C:** Tutarli hata formati tum API'de:
```json
{ "error": { "code": "HATA_KODU", "message": "aciklama", "details": {} } }
```
fal.ai servisi duserse `502 SERVICE_ERROR`, input hatasi `422 VALIDATION_ERROR`. Streaming'de `error` event'i gelir — client gracefully handle eder.

---

## 10. REKABET ve FARKLILIK

### S: Character.AI, Inworld AI gibi cozumlerden farkiniz ne?
**C:**
| Ozellik | Rakipler | Biz |
|---------|----------|-----|
| Hedef | Tuketici (chat) | Oyun studyolari (API) |
| Kontrol | Kisitli | Tam kontrol (system prompt, rules, taboo words) |
| Multi-karakter | Genellikle 1:1 | Orkestrasyon ile N karakter |
| Gorsel | Yok | FLUX ile avatar + sahne |
| Ses | Sinirli | Turkce TTS/STT entegre |
| Dunya kurallari | Yok | World system (tone, rules, taboo) |
| Deployment | SaaS only | Self-host veya SaaS |

### S: Acik kaynak mi?
**C:** Hackathon surecinde acik gelistirme yapiyoruz. Lisanslama karari sonra netlesecek.
