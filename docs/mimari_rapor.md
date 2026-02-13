# Town of Salem AI — Mimari Rapor

> Voice AI Hackathon (9-15 Subat 2026) | Freya.ai + fal.ai

---

## Proje Ozeti

Town of Salem AI, 1 gercek oyuncunun 4-8 yapay zeka karakteriyle sesli olarak oynayabilecegi bir sosyal cikarsama (social deduction) oyunudur. Oyuncu mikrofonu ile konusur, AI karakterler gercek zamanli streaming ses ile yanit verir. Her AI karakter benzersiz bir kisilige ve role sahiptir.

---

## 1. Sistem Mimarisi (Buyuk Resim)

> Dosya: `town_of_salem_ai_architecture.excalidraw`

### 1.1 Katmanlar

Sistem 4 ana katmandan olusur, yukaridan asagiya:

```
FRONTEND (Browser)
    |
  WebSocket (Ses + Data)
    |
BACKEND (FastAPI)
   / \
  /   \
FREYA.AI    FAL.AI
```

### 1.2 Frontend — React + Tailwind

| Bilesen | Aciklama |
|---------|----------|
| **Oyuncu** | Tarayicidaki kullanici. `MediaRecorder API` ile ses kaydeder, `AudioContext` ile AI seslerini dinler |
| **React UI** | Tum oyun ekranlarini icerir: Lobby, Rol Dagitimi, Gunduz Tartisma, Oylama, Gece, Game Over |
| **Baglanti** | Oyuncu kutusu ve React UI arasinda cift yonlu ok — kullanici inputu UI'a, UI ciktisi kullaniciya |

Teknoloji: **React + Tailwind CSS + Vite**

### 1.3 WebSocket Katmani

Frontend ile backend arasindaki koprü. Cift yonlu (bidirectional) calisiyor:

- **Yukari (Browser → Server):** Oyuncunun ses stream'i + metin mesajlari
- **Asagi (Server → Browser):** AI karakterlerin ses stream'i + oyun state guncellemeleri + avatar/muzik URL'leri

Neden WebSocket? HTTP request/response modeli gercek zamanli ses streaming icin yeterli degil. WebSocket surekli acik kanal sagliyor.

### 1.4 Backend — FastAPI (Game Engine)

Bizim yazdigimiz ana kod burasi. B2B API olarak modular monolith mimarisinde:

| Modul | Dosyalar | Sorumluluk |
|-------|----------|-----------|
| `api/characters/` | router, schema, service, memory | Karakter CRUD, kisilik uretimi, diyalog, sesli konusma |
| `api/conversations/` | router, schema, service | Coklu karakter konusma orkestratoru (meta-LLM ile sira secimi) |
| `api/worlds/` | router, schema, service | Dunya/senaryo olusturma ve yonetimi |
| `api/voice/` | router, schema, service | TTS/STT endpoint'leri (streaming + generate) |
| `api/images/` | router, schema, service | FLUX ile avatar/arka plan uretimi |
| `fal_services.py` | tek dosya | Freya TTS/STT + Gemini LLM + FLUX — tum dis servis cagrilari |
| `api/main.py` | tek dosya | FastAPI app factory, CORS, lifespan, router kayit |
| `api/config.py` | tek dosya | Pydantic Settings — tum API key ve model config |
| `api/store.py` | tek dosya | In-memory veri deposu (characters, worlds, conversations) |

Teknoloji: **FastAPI + Python (async) + Pydantic v2**

### 1.5 Freya.ai Katmani

Freya iki farkli gorevde kullanilir:

#### A) Dinleyici Agent (1 adet)
Oyuncunun sesini isler:
- **STT** — Sesi metne cevirir
- **Duygu Analizi** — Oyuncunun tonundan duygu cikarir (sinirli mi, suphe mi duyuyor)
- **Kesinti Yonetimi** — Oyuncu sozunu kestiyse yakalayip handle eder

#### B) Karakter Agent'lari (4-8 adet)
Her AI karakter icin ayri bir Freya agent instance'i calisir:

| Karakter | Kisilik | Rol | Ne Yapiyor |
|----------|---------|-----|------------|
| Ayse | Agresif | Koylu | Freya LLM dusunur + TTS ile streaming konusur |
| Mehmet | Sakin | Mafya | Freya LLM dusunur + TTS ile streaming konusur |
| Zeynep | Supheci | Dedektif | Freya LLM dusunur + TTS ile streaming konusur |
| ... | ... | ... | 4-8 karakter arasi |

**Kritik karar:** LLM icin Google Gemini Flash API'yi dogrudan kullaniyoruz (fal.ai OpenRouter middleman kaldirildi). TTS/STT icin fal.ai Freya. Bu sayede:
- LLM ilk token **~612ms** (middleman yok, Gemini direkt API)
- Pipeline ilk ses (LLM+TTS) **~1.95s** — 2 saniyenin altinda!
- Gemini `thinking_budget=0` — dusunme suresi sifir, aninda token uretimi
- Clause bazli bolme (`,;:.!?`) + 40 char limit ile TTS'e daha kisa parcalar gidiyor
- asyncio.Queue ile LLM ve TTS paralel calisiyor — text gelirken ses de uretiliyor
- 3 paralel TTS streaming ortalama **~1.3s** TTFA

### 1.6 fal.ai Katmani

fal.ai serverless GPU inference icin kullaniliyor. 3 model:

| Model | Ne Uretiyor | Ne Zaman |
|-------|-------------|----------|
| **FLUX** (Image Generation) | Her AI karakter icin benzersiz avatar goruntuleri | Oyun baslangicinda 1 kez |
| **Beatoven** (Music) | Faz bazli ambiyans muzigi (gunduz huzurlu, gece gerilimli) | Her faz gecisinde |
| **Beatoven** (SFX) | Ses efektleri (olum sesi, oylama gongu, gece baykusu) | Olay bazli |

Tum fal.ai cagrilari **async** calisiyor (`fal_client.submit_async`). Oyun akmaya devam ederken arka planda GPU islem yapiyor.

### 1.7 Kaldirildi / Kullanilmiyor

| Eski Bilesen | Neden Kaldirildi |
|-------------|-----------------|
| LangGraph + ayri LLM | Freya'nin kendi LLM'i yeterli, ayri pipeline gereksiz karmasiklik |
| Aurora Lipsync | Ekstra gecikme yaratiyor (~1s), demo icin gorsel avatar yeterli |
| MiniMax TTS | Freya'nin kendi TTS'i streaming destekliyor, ayri TTS gereksiz |
| fal.ai OpenRouter LLM | Gemini direkt API'ye gecildi — middleman kaldirildi, %48 latency dususu |

---

## 2. Sohbet Akisi (Tek Tur Detayi)

> Dosya: `town_of_salem_chat_flow.excalidraw`

Bu diagram tek bir konusma turunun nasil isleydigini gosteriyor.

### 2.1 Akis Adim Adim

```
1. OYUNCU konusur (mikrofon)
       |
       | ses stream (WebSocket)
       v
2. FREYA DINLEYICI AGENT
   - Sesi metne cevirir (STT)
   - Duygu analizi yapar
   - Kesinti kontrolu yapar
       |
       | metin + duygu verisi
       v
3. GAME ENGINE (FastAPI)
   - "Kimin sirasi?" kontrol eder
   - Oyun state'i gunceller
   - Ilgili karakter agent'ina komutu gonderir:
     "Ayse, senin siran, konus"
       |
       | prompt + kontekst
       v
4. FREYA KARAKTER AGENT (ornegin Ayse)
   - LLM ile dusunur (rol + kisilik + kontekst'e gore)
   - TTS ile aninda sese cevirir
   - Streaming olarak geri gonderir
       |
       | streaming ses ciktisi
       v
5. OYUNCU duyar (hoparlor)
```

### 2.2 Karakter Agent'a Gonderilen Prompt Ornegi

Her turda Game Engine, ilgili Freya karakter agent'ina su tarz bir prompt gonderir:

```
"Sen Ayse'sin. Agresif ve iddiali bir kisiligin var.
Koylu rolundesin. Mafyayi bulmaya calis.
Hayatta kalanlar: Mehmet, Zeynep, Ali, Sen (oyuncu).
Gecen gece Can olduruldu. Mehmet'ten supheleniyorsun.
Turkce konus. Kisa ve sert cumleler kur."
```

Bu prompt **her tur guncellenir** — kim oldu, kim hayatta, gecen turda ne konusuldu gibi bilgiler eklenir.

### 2.3 Zamanlama (Gercek Benchmark Sonuclari)

| Adim | Sure |
|------|------|
| Oyuncu konusur | Degisken |
| Freya STT | ~300-500ms |
| Game Engine islem | ~50ms |
| Gemini Flash LLM ilk token | **~612ms** |
| Freya TTS ilk chunk (pipeline) | **~1.95s** |
| TTS-only ilk ses | **~1.1-1.7s** |
| 3x Concurrent TTS TTFA | **~1.3s avg** |

Streaming sayesinde oyuncu **2 saniyenin altinda** AI karakterin konusmaya basladigini duyar. LLM (Gemini direkt API, thinking OFF) + TTS (fal.ai Freya) pipeline'i asyncio.Queue ile paralel calisir, tum cevap bitmeden ses gelmeye baslar.

---

## 3. Oyun Dongusu

```
Lobby → Rol Dagit + Avatar Uret (fal.ai) → Gunduz (Freya) → Oylama → Gece
                                                ^                        |
                                                |    kazanan yoksa       |
                                                +------------------------+
                                                         |
                                                    kazanan var
                                                         |
                                                         v
                                                     Game Over
```

| Faz | Ne Oluyor | Hangi Servis |
|-----|-----------|-------------|
| **Lobby** | Oyuncu isim girer, oyuncu sayisi secer | Sadece React UI |
| **Rol Dagit + Avatar** | Roller rastgele dagilir, FLUX ile avatarlar uretilir | fal.ai (FLUX) |
| **Gunduz** | Oyuncu ve AI karakterler tartisir (sesli), supheli araniyor | Freya (tum agent'lar aktif) |
| **Oylama** | Herkes oy kullanir, en cok oy alan elenir | Game Engine + Freya |
| **Gece** | Mafya birini oldurur, Dedektif birini sorusturur | Game Engine + Freya |
| **Game Over** | Mafya kalmazsa Kasaba kazanir, Mafya >= Kasaba ise Mafya kazanir | React UI |

Her faz gecisinde **Beatoven** ile yeni ambiyans muzigi ve SFX uretilir.

---

## 4. Sorumluluk Dagitimi

### Biz Yaziyoruz (Bizim Kodumuz)
- B2B Character AI API (FastAPI + Python) — modular monolith, domain-based
- Conversation Orchestrator — meta-LLM ile coklu karakter konusma yonetimi
- Gemini LLM entegrasyonu — google-genai ile direkt API, thinking OFF
- Streaming pipeline — asyncio.Queue ile LLM→TTS paralel, clause-based split, 40 char limit
- React UI (React + Tailwind) — tum oyun ekranlari
- WebSocket handler — ses ve data yonlendirme
- fal_services.py — TTS/STT/LLM/FLUX tek modülde
- **Prompt tasarimi** — her karakter icin kisilik + rol + kontekst prompt'lari

### Google Gemini (Direkt API)
- LLM (dil modeli) — karakter AI dusunmesi ve yanit uretimi
- Gemini 2.5 Flash — thinking_budget=0 ile minimum latency (~0.45s first token)
- Streaming — token token uretim, TTS ile paralel calisiyor

### Freya / fal.ai (3rd Party — Hackathon Sponsoru)
- TTS (metin → ses) — streaming PCM16 ses uretimi (Freya)
- STT (ses → metin) — oyuncunun sesini anlama (Freya)
- FLUX — AI ile karakter avatar goruntusu uretimi (fal.ai)
- Beatoven Music — faz bazli ambiyans muzik uretimi (fal.ai)
- Beatoven SFX — olay bazli ses efektleri uretimi (fal.ai)

---

## 5. Tech Stack Ozeti

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React + Tailwind CSS + Vite |
| Backend | FastAPI + Python (async) + Pydantic v2 |
| LLM | Google Gemini 2.5 Flash (direkt API, google-genai) |
| TTS | Freya TTS (fal.ai, streaming PCM16) |
| STT | Freya STT (fal.ai) |
| Image Gen | fal.ai FLUX |
| Music/SFX | fal.ai Beatoven |
| Realtime | SSE (Server-Sent Events) + WebSocket |
| Orchestration | Meta-LLM ile konusma sira yonetimi |

---

## 6. Neden Bu Mimari?

### Basitlik
Freya'ya karakter bilgisini verip "sen dusun, sen konus" dememiz yeterli. Ayri LLM + ayri TTS pipeline'i kurmak yerine Freya'nin built-in ozelliklerini kullaniyoruz. Bu hackathon'da zamanimiz sinirli — 45 dakikalik demo icin bu cok kritik.

### Dusuk Latency
Eski mimari (fal.ai → OpenRouter → Gemini → TTS) ile ~5.6 saniye ilk ses bekleme vardi. 5 optimizasyon adimi ile **~1.95 saniyeye** dustu (**2.9x iyilesme**):

| Optimizasyon | Etki |
|-------------|------|
| Streaming endpoint'leri (SSE) | Ilk chunk beklemeden gonderim |
| Clause-based split (`,;:.!?`) | Daha erken TTS tetikleme |
| asyncio.Queue (LLM∥TTS paralel) | LLM beklemeden TTS baslar |
| 40 char limit split | Uzun cumlelerde erken ses |
| OpenRouter → Gemini direkt + Thinking OFF | LLM ilk token 612ms |

**Benchmark sonucu:** Pipeline TTFA = 1949ms, LLM TTFT = 612ms, TTS-only = 1.1-1.7s

### Platform Kullanimi
- **Freya:** Projenin kalbinde. Her AI karakter = 1 Freya agent. Dinleme de Freya. Juri icin Freya kullanim skoru yuksek.
- **fal.ai:** Avatar + muzik + SFX icin 3 farkli model kullaniliyor. Async API ile performansli. Juri icin fal.ai kullanim skoru yuksek.

### Olceklenebilirlik
Her karakter bagimsiz bir Freya agent oldugu icin, 4 oyuncudan 8'e cikarmak sadece daha fazla agent olusturmak demek. Mimari degisiklik gerekmiyor.

---

## 7. Acik Noktalar / Bekleyenler

| Konu | Durum |
|------|-------|
| Freya dokumantasyonu | Henuz paylasılmadi. `freya_service.py` abstraction layer hazir, dokumanlar gelince doldurulacak |
| Backend iskeleti | Mimari tasarlandi, kod henuz yazilmadi. React UI demo hazir |
| Freya web streaming | Freya'nin browser tabanli streaming destegi dogrulanacak (tel degil web) |
| Coklu oyuncu (multiplayer) | v1'de tek oyuncu + AI'lar. Ilerleyen surumde arkadas ekleme |

---

## Diyagramlar

Gorsellere Excalidraw ile bakabilirsiniz:

1. **Sistem Mimarisi:** `town_of_salem_ai_architecture.excalidraw`
2. **Sohbet Akisi:** `town_of_salem_chat_flow.excalidraw`

Her iki dosyayi da [excalidraw.com](https://excalidraw.com) uzerinde acabilirsiniz (File → Open).
