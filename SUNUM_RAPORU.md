# AI vs İnsan: Ocak Yemini — Sunum Raporu

---

## SLAYT 1: Kapak ve İlk Etki (30 sn)

**Görsel:** Ocak ateşi etrafında toplanan karakterlerin concept art'ı — karanlık fantezi atmosferi, yüzlerde belirsizlik.

**Başlık:**
> **AI vs İnsan: Ocak Yemini**
> *"Among Us ile Dungeon Master'ın sesli buluştuğu nokta"*

**Alt Başlık:**
> Voice-First Character AI Platform — Sesli Karakter Deneyimi İçin Hazır API

**Giriş Konuşması:**
> "Biz ATTN ekibi. Bugün size sadece bir oyun değil, **sesli karakter deneyimi isteyen her ürüne entegre edilebilecek bir Voice AI platformu** sunmaya geldik. Ve bu platformun gücünü kanıtlamak için en agresif showcase'ini kendimiz yaptık: **Ocak Yemini.**"

---

## SLAYT 2: Felsefe ve Oyun (40 sn)

**Görsel:** Ocak Yemini oyunundan bir sahne — karakter konuşurken ses dalgası animasyonu, karanlık fantezi atmosferi.

**Mesaj:**
> "Ses ile etkileşimin geleceğini inşa ediyoruz."

**Anlatım:**
> "Felsefemiz basit: **Yapay zeka karakterleriyle etkileşim artık klavyeden değil, sesinizden geçmeli.** Bir karaktere soru sorduğunuzda, 1.3 saniye içinde size kendi sesiyle, kendi kişiliğiyle yanıt vermeli. Metin yok, bekleme yok — sadece doğal bir sesli diyalog."
>
> "Bunu kanıtlamak için en zor showcase'i seçtik: **Ocak Yemini** — 1 gerçek oyuncunun 4-8 AI karakterle **tamamen sesli** oynayabileceği bir sosyal çıkarsama oyunu. Among Us'ın gerilimi, Dungeon Master'ın atmosferi, ama her şey **ses üzerinden.** Oyuncu mikrofona konuşuyor, AI karakterler kendi sesleriyle anında yanıt veriyor. Ve bu oyunun arkasındaki tüm altyapı, tek bir API çağrısıyla erişilebilir durumda."

**3 Temel Söz:**

| # | Söz | Açıklama |
|---|-----|----------|
| 1 | **Ses-Öncelikli Mimari** | TTS/STT pipeline API seviyesinde hazır, tek endpoint çağrısıyla sesli karakter konuşması |
| 2 | **Tutarlı Karakter Hafızası** | Karakterler önceki konuşmaları hatırlar, çelişkiye düşmez |
| 3 | **Stüdyoya Özel İzolasyon** | Her stüdyo kendi dünyasını, kurallarını, karakterlerini bağımsız olarak tanımlar |

---

## SLAYT 3: Mimari ve Teknik Derinlik (35 sn)

**Görsel:** İki katmanlı mimari şeması:

```
┌─────────────────────────────────────────────────────┐
│  VOICE AI API (Stüdyoların Kullandığı)               │
│                                                       │
│  Worlds API ────→ Characters API ────→ Voice API      │
│  (Dünya yarat)    (Karakter üret)      (Konuştur)     │
│       │                │                    │          │
│       ▼                ▼                    ▼          │
│  POST /worlds     POST /characters    POST /voice/tts  │
│  Ton, mevsim,     İsim, arketip,      Streaming SSE    │
│  mitoloji         hafıza, acting      PCM16 ses        │
│                   prompt                               │
│                                                       │
│  Entegrasyon: Tek bir HTTP/SSE çağrısı yeterli.       │
│  SDK gerekmez — herhangi bir dil, herhangi bir engine. │
└─────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│  SHOWCASE: Ocak Yemini Oyunu                         │
│                                                       │
│  Sabah ───→ Tartışma ───→ Serbest Dolaşım ───→ Oy    │
│  (Kehanet)   (Ateş başı)   (1v1 sorgu)        (Sürgün)│
│                                                       │
│  Sesle sorgula → Bilgi topla → AI'ı tespit et         │
└─────────────────────────────────────────────────────┘
```

**Mesaj:**
> "API döngüsü: **Dünya Kur → Karakter Üret → Konuştur → Hafızaya Yaz.** Prompt mühendisliği, ses sentezi, hafıza yönetimi tamamen bizde — stüdyo sadece endpoint çağırır. 5 aşamalı optimizasyonla pipeline'ı **5.6 saniyeden 1.30 saniyeye** düşürdük."

**Benchmark Sonuçları:**

| Metrik | Sonuç | Detay |
|--------|-------|-------|
| Servis entegrasyonu | Gemini API + fal.ai (7+ servis) | Gemini Flash LLM (direkt), Freya TTS/STT, FLUX, Beatoven |
| LLM ilk token (TTFT) | **~0.61 saniye** | Gemini Flash direkt API, thinking_budget=0 |
| Pipeline ilk ses (TTFA) | **~1.95 saniye** | LLM streaming + TTS, asyncio.Queue ile paralel |
| 3x Paralel TTS TTFA | **~1.30 saniye** | 3 eşzamanlı karakter konuşması — en hızlı pipeline |
| Eski → Yeni pipeline | 5.6s → 1.30s | **4.3x hızlanma** (5 aşamalı optimizasyon) |
| Moderasyon | Otomatik | Karakter kırılması, taboo kelime, sahne dışı konuşma algılama |
| Dünya üretimi | Deterministik | Aynı seed = aynı oyun (test edilebilir, denetlenebilir) |

**5 Optimizasyon Adımı:**

| # | Optimizasyon | Etki |
|---|-------------|------|
| 1 | Streaming endpoint'leri (SSE) | İlk chunk beklemeden gönderim |
| 2 | Clause-based split (`,;:.!?`) | Daha erken TTS tetikleme |
| 3 | asyncio.Queue (LLM∥TTS paralel) | LLM beklemeden TTS başlar |
| 4 | 40 char limit split | Uzun cümlelerde erken ses |
| 5 | OpenRouter → Gemini direkt + Thinking OFF | LLM ilk token 612ms |

---

## SLAYT 4: Pazar ve Hedef Kitle (35 sn)

**Görsel:** 3 sütunlu hedef kitle grafiği.

### Hedef Segmentler

| Segment | Neden Bize İhtiyacı Var |
|---------|------------------------|
| **Sesli NPC isteyen oyun stüdyoları** (RPG, sosyal, hikaye odaklı) | Kendi sesli AI karakter pipeline'larını kurmak aylar sürüyor — biz bunu tek API'de sunuyoruz |
| **İnteraktif hikaye platformları** | Ses entegrasyonu teknik olarak çok zor, biz bunu çözdük |
| **Senaryo bazlı eğitim/simülasyon** | Statik simülasyonlar yerine dinamik, sesli AI karakterlerle gerçekçi eğitim |

### Rakip Karşılaştırma

| Rakip | Eksik | Bizim Farkımız |
|-------|-------|----------------|
| **Inworld AI, Convai** | Yalnızca İngilizce odaklı, yüksek latency | Türkçe dahil çok dilli, 1.30s TTFA |
| **ChatGPT wrapper'lar** | Karakter tutarlılığı yok, hafıza yok, ses yok | Uçtan uca entegre pipeline: LLM + TTS + hafıza |
| **Manuel diyalog sistemleri** | Ölçeklenemez, her branch elle yazılıyor | Prosedürel ve dinamik karakter üretimi |

**Boşluk:**
> "Kimse henüz **ses-öncelikli, stüdyoya özel izole edilebilen, hafıza destekli bir karakter AI API'si** sunmuyor. Biz tam olarak bunu yapıyoruz."

---

## SLAYT 5: Yol Haritası ve İş Modeli (30 sn)

**Görsel:** Sade zaman çizelgesi.

### Yol Haritası

```
2026 Q1 (Şimdi)          2026 Q2                 2026 Q3-Q4
──────────────────────────────────────────────────────────────────
Hackathon MVP             Altyapı Sağlamlaştırma   Açık Beta
├─ Ocak Yemini Demo       ├─ PostgreSQL geçişi     ├─ Public API dokümantasyon
├─ 7+ fal.ai entegrasyon  ├─ Rate limiting         ├─ Dashboard & usage tracking
├─ Streaming TTS/STT      ├─ WebSocket streaming   ├─ İlk pilot stüdyo entegrasyonu
├─ Multi-tenant API       ├─ Monitoring & logging  ├─ Fiyatlandırma modeli
└─ Core loop tamamlandı   └─ Test suite            └─ Çok dilli ses desteği
```

### İş Modeli

| Tier | Fiyat | İçerik |
|------|-------|--------|
| **Starter** | $99/ay | 10K karakter konuşması, 5 dünya, 3 ses |
| **Pro** | $499/ay | 100K konuşma, sınırsız dünya, tüm sesler, öncelikli destek |
| **Enterprise** | Özel | Sınırsız, SLA, dedicated instance, white-label, özel ses eğitimi |

**Entegrasyon Kolaylığı:**
> SDK'ya gerek yok — standart HTTP ve SSE çağrıları. Unity, Unreal, Godot, web, mobil... `POST /v1/characters/{id}/speak/stream` çağır, ses akışını al. **5 dakikada entegrasyon.**

---

## SLAYT 6: Ekip ve Demo (40 sn)

**Görsel:** Ekip üyelerinin fotoğrafları + Ocak Yemini ekran görüntüsü.

### Ekip: ATTN

| Üye | Rol | Katkı |
|-----|-----|-------|
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |

### Bu Hafta Ne Yaptık

- **Backend:** Python + FastAPI + fal.ai (7+ servis entegrasyonu)
- **Frontend:** React + TypeScript + Zustand (dark fantasy UI)
- **AI:** Gemini 2.5 Pro/Flash, Freya TTS/STT, FLUX avatar üretimi
- **Performans:** 5.6s → 1.30s ses yanıtı (4.3x hızlanma), 3x paralel TTS
- **Oyun:** Tam çalışan Ocak Yemini demo — sesli AI karakterler, oylama, gece/gündüz döngüsü

### Kapanış

> "Bir haftalık hackathon'da sesli karakter AI platformunu sıfırdan inşa ettik, 5.6 saniyelik gecikmeyi 1.3 saniyeye düşürdük ve üzerine tam bir oyun koyduk. Teknoloji hazır, API çalışıyor, oyun oynayabiliyor — **gerisi sadece ölçekleme meselesi.**"

> "Şimdi sizi **Ocak Yemini'nin dünyasına** davet ediyoruz. Ateş yanıyor, karakterler konuşuyor — **hangisi insan, hangisi AI, sesinden anlayabilecek misiniz?**"

*(Demoyu başlat!)*

---

## Sunum Stratejisi Özeti

| Slayt | Oyun | Platform |
|-------|------|----------|
| 1 - Kapak | Ocak Yemini'yi göster | "En agresif showcase'imiz" |
| 2 - Felsefe | "Sesle oynanan sosyal çıkarsama" | "Ses ile etkileşimin geleceği" |
| 3 - Mimari | Oyun döngüsü: sorgula → oy ver | API döngüsü: tek HTTP çağrısı, 1.30s yanıt |
| 4 - Pazar | "Bu oyun türü büyüyor" | "Sesli karakter isteyen stüdyolar için boşluk var" |
| 5 - Yol Haritası | "Demo hazır" | "Q2 altyapı, Q3-Q4 açık beta" |
| 6 - Demo | "Oynayın, deneyin" | "Bir haftada sıfırdan buraya geldik" |
