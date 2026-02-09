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

Bizim yazdigimiz ana kod burasi. 4 temel dosyadan olusur:

| Dosya | Sorumluluk |
|-------|-----------|
| `game_manager.py` | Tur yonetimi, faz gecisleri (gunduz/gece/oylama), olum/kazanan kontrolu |
| `ws_handler.py` | WebSocket baglanti yonetimi, ses verisi yonlendirme |
| `freya_service.py` | Freya abstraction layer — agent olusturma, yonetme, prompt gonderme |
| `fal_service.py` | fal.ai API cagrilari — avatar uretme, muzik/SFX uretme |

Teknoloji: **FastAPI + Python (async)**

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

**Kritik karar:** Ayri bir LLM (GPT, Claude vs.) KULLANMIYORUZ. Freya'nin kendi icindeki LLM'i hem dusunme hem konusma icin yeterli. Bu sayede:
- Ayri LLM API maliyeti yok
- Dusunme → ses gecisi aninda (LLM ciktisindan ayri TTS'e gonderme gerekmiyor)
- Streaming latency ~0.5 saniye

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

### 2.3 Zamanlama

| Adim | Sure |
|------|------|
| Oyuncu konusur | Degisken |
| Freya STT + duygu | ~200ms |
| Game Engine islem | ~50ms |
| Freya LLM + TTS ilk chunk | ~500ms |
| **Toplam ilk ses yaniti** | **~0.5 saniye** |

Streaming sayesinde oyuncu 0.5 saniye icinde AI karakterin konusmaya basladigini duyar. Tum cevap bitmeden ses gelmeye baslar.

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
- Game Engine (FastAPI + Python) — tur yonetimi, state, oylama
- React UI (React + Tailwind) — tum oyun ekranlari
- WebSocket handler — ses ve data yonlendirme
- Freya abstraction layer — agent yonetimi
- fal.ai service layer — avatar/muzik API cagrilari
- **Prompt tasarimi** — her karakter icin kisilik + rol + kontekst prompt'lari

### Freya Yapiyor (3rd Party — Hackathon Sponsoru)
- LLM (dil modeli) — karakter icin dusunme/karar verme
- TTS (metin → ses) — streaming ses uretimi
- STT (ses → metin) — oyuncunun sesini anlama
- Duygu analizi — ses tonundan duygu cikarma
- Streaming — dusuk latency gercek zamanli ses

### fal.ai Yapiyor (3rd Party — Hackathon Sponsoru)
- FLUX — AI ile karakter avatar goruntusu uretimi
- Beatoven Music — faz bazli ambiyans muzik uretimi
- Beatoven SFX — olay bazli ses efektleri uretimi

---

## 5. Tech Stack Ozeti

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React + Tailwind CSS + Vite |
| Backend | FastAPI + Python (async) |
| Realtime | WebSocket (bidirectional) |
| Voice AI | Freya.ai (agent-based) |
| Image Gen | fal.ai FLUX |
| Music/SFX | fal.ai Beatoven |
| Lipsync | YOK (kaldirildi) |
| Ayri LLM | YOK (Freya icinde) |

---

## 6. Neden Bu Mimari?

### Basitlik
Freya'ya karakter bilgisini verip "sen dusun, sen konus" dememiz yeterli. Ayri LLM + ayri TTS pipeline'i kurmak yerine Freya'nin built-in ozelliklerini kullaniyoruz. Bu hackathon'da zamanimiz sinirli — 45 dakikalik demo icin bu cok kritik.

### Dusuk Latency
Eski mimari (LLM → TTS → Lipsync) ile ~2.5 saniye bekleme vardi. Yeni mimaride Freya streaming ile ilk ses ~0.5 saniye. Bu oyun deneyimi icin devasa bir fark.

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
