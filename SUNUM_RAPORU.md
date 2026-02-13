# AI vs İnsan: Ocak Yemini — B2B Odaklı Sunum Raporu

---

## SLAYT 1: Kapak ve İlk Etki (30 sn)

**Görsel:** Ocak ateşi etrafında toplanan karakterlerin concept art'ı — karanlık fantezi atmosferi, yüzlerde belirsizlik.

**Başlık:**
> **AI vs İnsan: Ocak Yemini**
> *"Among Us ile Dungeon Master'ın sesli buluştuğu nokta"*

**Alt Başlık:**
> Voice-First Character AI Platform — Oyun Stüdyoları İçin Hazır API

**Giriş Konuşması:**
> "Biz ATTN ekibi, bugün size sadece bir oyun değil, **her oyun stüdyosunun kendi dünyasına entegre edebileceği bir Sesli Karakter Zekası platformu** sunmaya geldik. Gördüğünüz oyun, bu platformun ilk ve en agresif showcase'i."

---

## SLAYT 2: Oyun Felsefesi / Platform Felsefesi (40 sn)

**Görsel:** Minimalist bir sahne — bir tarafta "metin kutusu" (eski dünya), diğer tarafta "ses dalgası" (yeni dünya). Arada keskin bir çizgi.

**Mesaj:**
> "Neden bu platformu yapıyoruz?"

**Anlatım:**
> "Bizim felsefemiz: **Yapay zeka karakterleri artık metin kutularına hapsolmamalı.** Bugün oyun stüdyoları NPC diyalog sistemi için hâlâ statik script ağaçları kullanıyor. Biz bunu kökünden değiştiriyoruz."
>
> "Oyuncunun bir NPC ile **gerçek bir insanla konuşuyormuş gibi** etkileşime girmesini hedefliyoruz. Ama asıl müşterimiz oyuncu değil — **bu deneyimi kendi oyununa entegre etmek isteyen stüdyo.**"

**B2B DNA'sı — 3 Temel Söz:**

| # | Söz | Açıklama |
|---|-----|----------|
| 1 | **Tutarlı Karakter Hafızası** | Karakterler önceki konuşmaları hatırlar, çelişkiye düşmez |
| 2 | **Ses-Öncelikli Mimari** | TTS/STT entegrasyonu API seviyesinde, stüdyo sadece endpoint çağırır |
| 3 | **Çok-Kiracılı (Multi-Tenant)** | Her stüdyo kendi dünyasını, kurallarını, karakterlerini tanımlar |

---

## SLAYT 3: Mekanik ve Core Loop / Platform Mimarisi (35 sn)

**Görsel:** İki katmanlı mimari şeması:

```
┌─────────────────────────────────────────────────────┐
│  B2B API KATMANI (Stüdyoların Kullandığı)           │
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
│  Aksiyon: Sesle sorgula                               │
│  Ödül: Bilgi topla                                    │
│  Gelişim: AI'ı tespit et ve sürgün et                 │
└─────────────────────────────────────────────────────┘
```

**Mesaj:**
> "Felsefemiz gereği her API çağrısında stüdyo şu döngüyü tetikler: **Dünya Kur → Karakter Üret → Konuştur → Hafızaya Yaz.** Stüdyonun yapması gereken sadece endpoint'leri çağırmak — prompt mühendisliği, ses sentezi, hafıza yönetimi tamamen bizde."

**Teknik Derinlik (Jüri İçin):**

| Metrik | Sonuç | Detay |
|--------|-------|-------|
| fal.ai entegrasyonu | 7+ servis | Freya TTS/STT, OpenRouter LLM, FLUX, Beatoven |
| İlk ses çıkışı | ~1.2 saniye | Polling'e göre 2.9x hızlı (streaming) |
| Paralel TTS | 3.3x hızlanma | 3 eşzamanlı karakter konuşması |
| Moderasyon | Otomatik | Karakter kırılması, taboo kelime, sahne dışı konuşma algılama |
| Dünya üretimi | Deterministik | Aynı seed = aynı oyun (test edilebilir, denetlenebilir) |

---

## SLAYT 4: Pazar ve Hedef Kitle (35 sn)

**Görsel:** 3 sütunlu hedef kitle grafiği.

### Hedef Segmentler

| Segment | Pazar | Acı Noktası |
|---------|-------|-------------|
| **Oyun Stüdyoları** (Indie & AA) | 50K+ aktif stüdyo | NPC diyalog sistemi geliştirmek 6+ ay sürüyor |
| **Kurumsal Eğitim** | $380B global pazar | Senaryo bazlı eğitim simülasyonları statik ve sıkıcı |
| **İnteraktif Hikaye Platformları** | Büyüyen segment | Ses entegrasyonu teknik olarak çok zor |

### Rakiplerin Hata Yaptığı 3 Nokta

| Rakip | Hata | Bizim Avantajımız |
|-------|------|-------------------|
| **Inworld AI, Convai** | Yalnızca İngilizce odaklı | Türkçe ve çok dilli destek |
| **ChatGPT wrapper'lar** | Karakter tutarlılığı yok, hafıza yok, ses yok | Uçtan uca entegre pipeline |
| **Statik diyalog ağaçları** | Ölçeklenemez, her branch elle yazılıyor | Prosedürel ve dinamik karakter üretimi |

**Boşluk:**
> "Kimse henüz **ses-öncelikli, çok kiracılı, hafıza destekli karakter AI API'si** sunmuyor. Biz bu boşluğu dolduruyoruz."

---

## SLAYT 5: Yol Haritası ve İş Modeli (30 sn)

**Görsel:** Sade zaman çizelgesi.

### Yol Haritası

```
2026 Q1 (Şimdi)          2026 Q2-Q3              2026 Q4              2027
──────────────────────────────────────────────────────────────────────────────
Hackathon MVP             Beta API                GA Launch            Ölçekleme
├─ Ocak Yemini Demo       ├─ PostgreSQL           ├─ API dokümantasyon ├─ Özel ses eğitimi
├─ 7+ fal.ai entegrasyon  ├─ Rate limiting        ├─ SLA & uptime      ├─ Fine-tuned modeller
├─ Streaming TTS/STT      ├─ Usage tracking       ├─ Fiyatlandırma v1  ├─ Kurumsal paket
├─ Multi-tenant API       ├─ 3 pilot stüdyo       ├─ Dashboard         ├─ 10+ stüdyo
└─ Core loop tamamlandı   └─ WebSocket streaming  └─ Public beta       └─ Uluslararası açılım
```

### İş Modeli

| Tier | Fiyat | İçerik |
|------|-------|--------|
| **Starter** | $99/ay | 10K karakter konuşması, 5 dünya, 3 ses |
| **Pro** | $499/ay | 100K konuşma, sınırsız dünya, tüm sesler, öncelikli destek |
| **Enterprise** | Özel | Sınırsız, SLA, dedicated instance, white-label, özel ses eğitimi |

**Entegrasyon Kolaylığı:**
> SDK'ya gerek yok — standart HTTP ve SSE çağrıları. Unity, Unreal, Godot, web, mobil... Herhangi bir platformdan `POST /v1/characters/{id}/speak/stream` çağır, ses akışını al. **5 dakikada entegrasyon.**

---

## SLAYT 6: Ekip ve Demoya Davet (40 sn)

**Görsel:** Ekip üyelerinin profesyonel fotoğrafları.

### Ekip: ATTN

| Üye | Rol | Katkı |
|-----|-----|-------|
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |
| ___________________ | ___________________ | ___________________ |

### Teknik Kanıtlar

- **Backend:** Python + FastAPI + fal.ai (7+ servis entegrasyonu)
- **Frontend:** React + TypeScript + Zustand (dark fantasy UI)
- **AI:** Gemini 2.5 Pro/Flash, Freya TTS/STT, FLUX avatar üretimi
- **Performans:** <2s uçtan uca ses yanıtı, paralel TTS ile 3.3x hızlanma
- **Kod:** 2000+ satır oyun motoru, tam B2B API katmanı, WebSocket desteği

### Kapanış

> "Bu felsefeyi, bu platformu ve bu oyunu bu seviyeye getirdik. Doğru yatırım ve ekip genişlemesiyle, 2026 sonunda **endüstri standardı bir B2B Character AI API** olacağız."

> "Şimdi anlattıklarımızın havada kalmaması için, sizi **Ocak Yemini'nin dünyasına** davet ediyorum. Ateş yanıyor, karakterler konuşuyor — **hangisi insan, hangisi AI, sesinden anlayabilecek misiniz?**"

*(Demoyu başlat!)*

---

## Sunum Stratejisi Özeti

Her slayttaki B2B pivot vurgusu:

| Slayt | Oyun Anlatısı | B2B Dönüşümü |
|-------|---------------|---------------|
| 1 - Kapak | "Bir oyun sunuyoruz" | "Bir **platform** sunuyoruz, oyun onun showcase'i" |
| 2 - Felsefe | "Oyuncu şunu hissetsin" | "Stüdyo bunu **kendi oyununa** entegre etsin" |
| 3 - Mekanik | "Oyun döngüsü böyle" | "API döngüsü böyle, **tek HTTP çağrısı** yeterli" |
| 4 - Pazar | "Oyuncular bunu sever" | "50K+ stüdyo bu API'ye **ihtiyaç duyuyor**" |
| 5 - Yol Haritası | "Oyunu çıkaracağız" | "Pilot stüdyolar, **enterprise tier**, SDK gereksiz" |
| 6 - Demo | "Oyunu oynayın" | "API'nin ürettiği deneyimi **yaşayın**" |
