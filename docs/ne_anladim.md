# AI vs İnsan: Ocak Yemini — Ne Anladım

## 1. Büyük Resim

Bu bir **Turing Testi oyunu**. Fantastik bir evrende geçiyor. Oyuncular bir ateşin etrafında toplanmış köylüler. Bazıları gerçek insan, bazıları "Yankı-Doğmuş" (AI). Kimse kimsenin ne olduğunu bilmiyor. Amaç: davranışlardan, tutarsızlıklardan, sosyal dinamiklerden AI olanları bulmak.

**Kritik fark**: Kimse "ben insanım" veya "ben AI'yım" diyemez. Kimlik kanıtı yok. Sadece **davranışsal dedüksiyon** var. Çelişki yakaladın mı, alibi tutarsızlığı gördün mü, duygusal tepki sahte mi geldi — bunlarla karar veriyorsun.

**Evren içi terminoloji**:
- AI = "Yankı-Doğmuş" (Echo-Born)
- İnsan = "Et-Can"
- Moderatör = "Ocak Bekçisi"
- Ses filtresi = "Ses Maskesi" (kadim büyü)
- Oyun alanı = "Ocak" (sonsuz ateşin etrafındaki izole yerleşim)
- Asla "AI", "LLM", "model", "prompt", "sistem" gibi kelimeler kullanılmaz

---

## 2. Oyun Akışı (Faz Döngüsü)

Her gün şu sırayla ilerler:

### MORNING (Sabah)
- Orchestrator duyuru yapar: kim hayatta, gece ne oldu, bugünün limitleri
- Evren içi anlatımla ("Gece rüzgâr sert esti, fısıltılar duyuldu...")

### DAY (Gündüz)
- Oyuncular ev ziyareti talep edebilir
- Orchestrator eşleştirme yapar

### HOUSES (Ev Ziyaretleri) — 1v1
- İki kişi yüz yüze konuşur
- **Alternating turn**: biri konuşur, diğeri dinler, sonra sıra değişir
- Tam 6-10 tur (sabit, kaosu engellemek için)
- Text-only MVP'de: metin tabanlı dönüşümlü konuşma
- Voice versiyonda: insan → STT → filtre/rewrite → Freya TTS (ses maskesi), AI → LLM → Freya TTS
- Ziyaret bitince orchestrator kamuya **yumuşak ipucu özeti** yazar (kesin kanıt yok, sadece "gergin bir görüşme oldu" gibi)

### CAMPFIRE (Ateş Başı) — Ana Sahne
- **Sequential konuşma**: aynı anda 2 kişi konuşamaz
- El kaldırma sistemi: orchestrator sıra ilan eder
- Her konuşmacı sırasında **1 mesaj** (1-3 cümle)
- **Tur sayısı sabit DEĞİL** — orchestrator agent inisiyatif alır. Gerçek bir tartışma gibi: biri bir şey söyler, karşı taraf cevap hakkı doğar, orchestrator duruma göre söz hakkı verir veya tartışmayı keser. Organik akış.
- Bekçi (moderator) kural ihlali olursa araya girer
- Burası oyunun kalbi — şüphe, suçlama, savunma, ittifak hep burada

### VOTE (Oylama)
- Orchestrator oy ister
- Herkes bir kişiyi sürgün etmek için oy verir
- Sürgün edilen kişinin türü:
  - `REVEAL_ON_EXILE=true` ise: "Yankı-Doğmuş" mı "Et-Can" mı açıklanır (evren içi dille)
  - `REVEAL_ON_EXILE=false` ise: açıklanmaz (zor mod)

### NIGHT (Gece)
- Opsiyonel gizli aksiyonlar (basit MVP'de belki yok)
- Orchestrator gece sonucunu yazar

### BİTİŞ KOŞULLARI
- Tüm Yankı-Doğmuş sürgün edildi → İnsanlar kazanır
- Gün limiti bitti ve en az 1 Yankı-Doğmuş hayatta → Yankı-Doğmuş kazanır
- Masum kayıp limiti aşıldı (çok fazla yanlış sürgün) → Yankı-Doğmuş kazanır

---

## 3. Karakter Sistemi

### Her Karakter Şunlara Sahip:
- **İsim**: Fantastik isim (Kael, Mirra, Theron vb.)
- **Rol Ünvanı**: Kasap, Mühendis, Ejderha Avcısı, Sürgün Rahip vb. (lore arka planı)
- **Arketip** (davranış şablonu):
  - `ŞüpheliSessiz` — az konuşur, gözlemci, cevapları kısa
  - `ŞüpheliKonuşkan` — çok soru sorar, herkesten şüphelenir
  - `SaldırganAgresif` — direkt suçlar, sert konuşur, sabırsız
  - `SakınAzKonuşan` — sakin, düşünceli, nadiren konuşur ama etkili
  - `ÇekiciManipülatör` — ikna edici, ittifak kurar, güven kazanır
  - `DuruİDealist` — idealist, adalet odaklı, duygusal
- **Kamuya Açık Tik**: görünen alışkanlık — *(öncelik değil, MVP sonrası)*
- **Gizli Yara**: içsel zayıflık — *(öncelik değil, MVP sonrası)*
- **Alibi Çapası**: test edilebilir iddia — *(öncelik değil, MVP sonrası)*
- **Lore Mikro-Büküm**: maçı benzersiz kılan twist — *(öncelik değil, MVP sonrası)*
- **Varyasyon Tohumu**: farklı prompt üretimi — *(öncelik değil, MVP sonrası)*

> **NOT**: Yukarıdaki 5 detay güzel ama MVP'de öncelik değil. İlk hedef: isim + ünvan + arketip + seviye çalışsın. Detaylar sonra eklenir.

### AI Seviye Sistemi (Yankı-Doğmuş ise):
- **Çaylak**: daha belirgin tutarsızlık, fazla açıklama, reaktif, kolay yakalanır
- **Orta**: tutarlı hikâye, ittifak manipülasyonu, dengeli
- **Uzman**: zaman çizelgesi takibi, inandırıcı belirsizlik, kontrollü yanlış bilgi, aşırı konuşmaz — zor yakalanır

### Yankı-Doğmuş Kazanma Motivasyonu:
Yankı-Doğmuş karakterler **aktif olarak kazanmaya çalışır**. Prompt'larında şu bilinç var:
- "Sen Yankı-Doğmuşsun. Amacın gün limitine kadar hayatta kalmak."
- "Şüpheyi başkalarına yönlendir. Kendini inandırıcı bir şekilde savun."
- "Yakalanmamak için tutarlı ol, ama çok mükemmel de olma — şüphe çeker."
- Seviye arttıkça bu stratejiler daha ince ve zor fark edilir hale gelir.

### İttifak Mekaniği:
- İttifak kurulabilir ama **risklidir**. Kimse ittifak kurduğu kişinin insan mı Yankı-Doğmuş mu olduğunu bilmez.
- Yankı-Doğmuş da bilmez karşısındakinin ne olduğunu — o da risk alır.
- Bu "kör ittifak" sistemi oyuna ekstra gerilim katar: güvendiğin kişi seni arkadan vurabilir, ya da birlikte kazanabilirsiniz. Ama ikisi de karanlıkta yürüyor.

---

## 4. Moderatör / Ocak Bekçisi

Moderatör **bağımsız bir agent**. Tüm konuşma text'ini gerçek zamanlı izler.

### Ne İzler:
- Dış-dünya ifşası ("ben gerçek insanım", "bu bir oyun", "AI yapıyor bunu")
- Sistem konuşması ("prompt", "model", "token", "API")
- Role uyumsuzluk (arketipinden sapma)
- Ateş Başı konuşma sırası ihlali (sırasız konuşma)
- Kişisel veri, gerçek hayat detayı
- "Ben Yankı-Doğmuşum" veya "Ben Et-Canım" gibi kimlik iddiaları

### Müdahale:
- Tek aksiyon: **REMOVE** — kural ihlali tespit edilirse oyuncu direkt oyundan atılır. Uyarı merdiveni yok, basit ve net.
- Evren içi dille: "Ocak Yemini bozuldu. Bu yolcunun ateş hakkı sona erdi."

### Moderatör ASLA:
- Tartışmaz, açıklama yapmaz
- Kimin Yankı-Doğmuş olduğunu söylemez
- Teknik sebep vermez ("prompt dışı konuştun" demez)
- İmmersiyonu bozmaz

---

## 5. Çıktı Formatları (LLM Sözleşmesi)

Tüm LLM çıktıları 4 formattan biri olmak zorunda:

### (A) Orkestratör Mesajı
```
[ORCH][PHASE=MORNING]
• Hayattakiler: Kael, Mirra, Theron, Lyra, Dorin
• Gece sessiz geçti, ama çeşme yanında ayak izleri görüldü.
• Bugün 2 ev ziyareti hakkınız var.
```

### (B) Moderatör/Bekçi Mesajı
```
[WARDEN][ACTION=WARN]
Yolcu, Ocak Yemini'ni hatırla. Dış diyarların dili burada geçmez.
```

### (C) Karakter Mesajı
```
[CHAR][Name="Kael"][Title="Kasap"][Archetype="SaldirganAgresif"]
Mirra'yı gördüm gece. Çeşmede ne işi vardı? Kimse cevap vermiyor, ben soruyorum.
```

### (D) Pipeline/Sistem Mesajı (sadece entegrasyon için)
```
[PIPELINE][TYPE=CHAR_INIT]
{ "game_id": "...", "characters": [...] }
```

---

## 6. Oyun Başlangıç Pipeline'ı

Oyun başladığında sırayla şunlar olur:

### Adım 1: Karakter Üretimi (Concurrent LLM Calls)
- Oyuncu sayısına göre slotlar belirlenir (örn: 6 slot = 1 insan + 5 AI)
- Her slot için LLM'e concurrent olarak gönderilir:
  - İsim, ünvan, lore arka plan, arketip, tik, gizli yara, alibi çapası üretilir
  - AI slotlarına seviye atanır (Çaylak/Orta/Uzman)
  - Varyasyon tohumu + lore mikro-büküm eklenir
- Sonuç: `CHAR_INIT` JSON bloğu → her karakter için tam profil

### Adım 2: Avatar Üretimi (fal.ai FLUX — Concurrent)
- Her karakter için `AVATAR_BRIEF` JSON üretilir
- fal.ai FLUX'a concurrent gönderilir
- Sonuç: her karakterin avatar URL'i

### Adım 3: Acting Prompt Üretimi
- Her karakter için `PROMPT_VARIATION` JSON üretilir
- Bu prompt, o karakterin oyun boyunca kullanacağı "acting talimatı"
- Temperature yüksek tutularak her seferinde farklı prompt çıkar
- Aynı arketip + arka plan olsa bile deneyim taze kalır

### Adım 4: Oyun Başlar
- İlk `[ORCH][PHASE=MORNING]` mesajı üretilir
- Yerleşim tanıtılır, Ocak Yemini duyurulur
- Oyuncular aksiyona geçer

---

## 7. Teknik Mimari (Benim Anladığım)

### Stack:
- **Backend**: FastAPI (Python)
- **LLM**: fal.ai OpenRouter (google/gemini-2.5-flash)
- **TTS**: fal.ai Freya TTS (voice versiyonda)
- **STT**: fal.ai Freya STT (voice versiyonda)
- **Avatar**: fal.ai FLUX
- **State**: In-memory dict (DB yok)
- **Auth**: Yok (direkt giriş, oyun başla)
- **Realtime**: WebSocket
- **Orchestration**: LangChain chain / workflow (LangGraph state machine)

### Bileşenler:

```
┌─────────────────────────────────────────────────────────┐
│                    FastAPI + WebSocket                    │
│                   (frontend bağlantısı)                  │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                  Game Orchestrator                        │
│          (state machine: faz kontrolü, sıra,             │
│           eşleştirme, oylama, bitiş kontrolü)            │
└───────┬──────────────┬──────────────┬───────────────────┘
        │              │              │
        ▼              ▼              ▼
┌──────────────┐ ┌──────────┐ ┌────────────────┐
│ Character    │ │ Init     │ │ Moderator      │
│ Agent Pool   │ │ Pipeline │ │ Agent          │
│              │ │          │ │                │
│ prompt_store │ │ char gen │ │ tüm text'i    │
│ + history    │ │ avatar   │ │ izler,         │
│ per character│ │ prompt   │ │ müdahale eder  │
│              │ │ variation│ │ bağımsız       │
│ sırayla      │ │ (conc.)  │ │ çalışır        │
│ çağrılır     │ │          │ │                │
└──────┬───────┘ └────┬─────┘ └───────┬────────┘
       │              │               │
       └──────────────┼───────────────┘
                      ▼
              ┌──────────────┐
              │ fal_services │
              │ .py          │
              │              │
              │ llm_generate │
              │ llm_stream   │
              │ tts_stream   │
              │ generate_    │
              │   avatar     │
              └──────────────┘
```

### Karakter Agent Pool — Nasıl Çalışır:
- Her karakter bir Python objesi: `{name, system_prompt, chat_history, archetype, ...}`
- Ayrı process/thread DEĞİL — sadece bir dict'te saklanan prompt + history
- Sırası gelince: `llm_generate(prompt=context, system_prompt=character.acting_prompt)` ile çağrılır
- Cevap gelir, history'e eklenir, sıra bir sonrakine geçer
- Resource tasarrufu: aynı anda 1 karakter konuşur (sequential), ama init'te concurrent

### Moderatör Agent — Nasıl Çalışır:
- Bağımsız olarak TÜM konuşma text'ini görür
- Her yeni mesajdan sonra (veya streaming olarak sürekli):
  - `llm_generate(prompt=tüm_konuşma_text, system_prompt=moderator_prompt)` çağrılır
  - Çıktı: `[WARDEN][ACTION=OK]` veya `[WARDEN][ACTION=WARN]...` vb.
- Eğer WARN/SILENCE/REMOVE dönerse → orchestrator'a bildirir → oyun state güncellenir
- Moderatör oyunun akışını bozmaz, sadece kural ihlali olursa araya girer

---

## 8. Init Pipeline Detayı

### Akış:
```
1. Kullanıcı "Oyun Başlat" der
2. Config belirlenir (kaç oyuncu, kaç AI, senaryo tipi, gün limiti)
3. Master prompt + config → LLM'e gönderilir
4. LLM karakter listesini üretir (CHAR_INIT JSON)
5. Her karakter için CONCURRENT olarak:
   a. AVATAR_BRIEF → fal.ai FLUX → avatar URL
   b. PROMPT_VARIATION → acting prompt üretimi (yüksek temperature)
6. Tüm karakterler hazır → Agent Pool'a yüklenir
7. İlk MORNING mesajı üretilir
8. Oyun başlar
```

### Temperature Stratejisi:
- Karakter init (yapısal üretim): temperature 0.7-0.8
- Acting prompt varyasyonu: temperature 1.0+ (her seferinde farklı olsun)
- Oyun içi karakter konuşması: temperature 0.8-0.9 (tutarlı ama canlı)
- Moderatör: temperature 0.2-0.3 (kesin, tutarlı kararlar)

---

## 9. Voice Pipeline (MVP Sonrası)

Text-only MVP çalıştıktan sonra eklenecek:

### İnsan Oyuncu (Ses Girdisi):
```
Mikrofon → STT (Freya) → ham metin → Proxy/Rewrite (LLM) → karakter sesi ile TTS (Freya) → diğer oyunculara
```
İnsanın gerçek sesi ASLA iletilmez. Her şey "Ses Maskesi" (kadim büyü) ile karakter sesine dönüşür. Bu sayede aksan, yaş, cinsiyet gibi biyometrik sızıntı engellenir.

### AI Oyuncu (Metin → Ses):
```
LLM yanıtı → TTS (Freya) → diğer oyunculara
```

### Sonuç:
Hem insan hem AI aynı ses pipeline'ından geçer → dışarıdan ayırt edilemez. Tüm sesler "karakter sesi". Eşit ifade.

---

## 10. MVP Scope (Hackathon İçin Ne Yapılacak)

### YAPILACAK (Must Have):
- [ ] Karakter init pipeline (concurrent LLM + FLUX avatar)
- [ ] Campfire (sequential turn, 1 mesaj/tur, 2 tur)
- [ ] Ev ziyareti (1v1 alternating turn, 6-10 tur)
- [ ] Oylama (sürgün + reveal)
- [ ] Moderatör agent (kural ihlali tespiti + müdahale)
- [ ] Gün döngüsü (Morning → Day → Houses → Campfire → Vote → Night)
- [ ] Kazanma/kaybetme koşulları
- [ ] Master prompt entegrasyonu (runtime_prompt_tr olarak saklı)
- [ ] fal_services.py ile LLM + FLUX çağrıları
- [ ] Basit frontend (React, mevcut UI adapte edilir)

### YAPILMAYACAK (Hackathon'da Yok):
- [ ] Postgres / Redis / Docker
- [ ] JWT auth
- [ ] Telemetry / metrics endpoint
- [ ] E2E test suite
- [ ] DB migrations
- [ ] Node.js (Python/FastAPI ile gidiyoruz)

### İLK ADIM (Şimdi):
- Text-only deney: terminal'de çalışan, API olmadan, 1 gün döngüsü
- 4-5 AI karakter + 1 insan (terminal'den input)
- Moderatör aktif
- Campfire + oylama
- fal_services.py → llm_generate() kullanarak

---

## 11. Açık Sorularım

1. **Senaryo tipi**: Demo için T1 mi (1 AI minimum) yoksa T2 mi (birden fazla AI)? Kaç AI olacak toplam?

2. **Ev ziyareti eşleştirme**: Kim kimi ziyaret edebilir? Oyuncu seçiyor mu, rastgele mi? Günde kaç ziyaret?

3. **Gece fazı**: MVP'de gece aksiyonu var mı? Yoksa sadece sabah → gündüz → evler → campfire → vote döngüsü mü?

4. **Oyuncu sayısı**: Demo'da kaç toplam karakter olacak? (örn: 1 insan + 5 AI = 6 kişi?)

5. **Master prompt**: Tamamını tek bir LLM'e mi göndereceğiz (orchestrator olarak), yoksa parçalayıp farklı agent'lara mı dağıtacağız?
   - Benim anladığım: orchestrator kısmı (faz kontrolü) → LangChain chain, karakter mesajları → ayrı LLM call'lar, moderatör → bağımsız LLM call

6. **Frontend**: Mevcut React UI'ı adapte mi edeceğiz, yoksa sıfırdan mı? (Mevcut Town of Salem UI'ında Lobby, DayPhase, VotePhase, NightPhase, ChatMessage componentleri var — adapte edilebilir)

7. **Campfire'da insan nasıl konuşacak?**: Serbest metin mi yazacak, yoksa niyet seçimi (suçla/savun/soru) + hedef seçimi mi yapacak? PDF'de niyet sistemi var ama master prompt'ta serbest metin gibi görünüyor.

8. **Agent pool vs individual agents**: Kaynak tasarrufu için tek bir LLM'e farklı system prompt'lar mı göndereceğiz (pool), yoksa her karakter için ayrı bir LangGraph node mu olacak?
