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

## 4. SES (VOICE)

### S: Ses uretimi ne kadar hizli?
**C:** Streaming modda:
- **Ilk ses chunk**: ~1.3 saniye (LLM + TTS pipeline)
- **Paralel TTS**: 3 concurrent istek ortalama ~1.5s
- PCM16 formatinda 16kHz mono — dusuk latency, aninda oynatilabilir

Polling modda MP3 formatinda CDN URL doner — kaliteli ama ~5-6 saniye bekleme.

### S: Kac farkli ses var?
**C:** Su an 3 ses: `alloy`, `zeynep`, `ali`. Hepsi Turkce destekli. Freya AI uzerinden eklenen yeni sesler otomatik kullanilabilir hale gelir.

### S: STT (Speech-to-Text) nasil calisiyor?
**C:** Senkron endpoint — audio URL veya base64 gonderilir, direkt metin doner. Hackathon demosunda kullanici mikrofona konusuyor, ses WebM formatinda kaydediliyor, backend'e gonderiliyor, Freya AI ile Turkce metin cevriliyor.

### S: Gurultulu ortamda ses tanima kalitesi ne olur? Noise cancellation var mi?
**C:** **Suanki durumda explicit noise cancellation implementasyonumuz yok.** Mikrofon `getUserMedia({ audio: true })` ile temel ayarlarla aciliyor. Ancak:
- Cogu modern tarayici (Chrome, Edge) **varsayilan olarak** WebRTC noise suppression ve echo cancellation'i aktif ediyor (spec'e gore default `true`)
- Yani tarayici seviyesinde bir miktar filtreleme oluyor, ama biz bunu explicit olarak zorlamiyoruz
- **Planlanan iyilestirme**: `getUserMedia` constraint'lerine explicit olarak `noiseSuppression: true`, `echoCancellation: true`, `autoGainControl: true` eklemek ve gerekirse Web Audio API filtreleri kullanmak

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
