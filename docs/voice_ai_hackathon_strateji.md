# Voice AI Hackathon - Strateji ve Jüri Analizi

> **Tarih:** 9-15 Şubat 2026 | **Final:** 15 Şubat Pazar @ Komünite Space, Vadistanbul
> **Ödül Havuzu:** $10.000 | **Ekip:** ATTN | **Altyapı:** Freya AI + fal.ai

---

## 1. Değerlendirme Kriterleri ve Ağırlıklar

| Kriter | Ağırlık | Ne Bekleniyor? |
|--------|---------|----------------|
| **Teknik Uygulama & Performans** | **%35** | Düşük latency, kesinti yönetimi (interruption handling), fal.ai ve Freya API'lerinin verimli kullanımı |
| **İnovasyon & Problem Çözümü** | **%25** | Anlamlı bir problem, mevcut yöntemlerden (tuşlama, web formu) daha verimli bir çözüm |
| **Kullanıcı Deneyimi (UX)** | **%20** | Doğal ses tonu, kişilik, güven veren ajan, hata durumlarında toparlama |
| **Ticarileşme Potansiyeli** | **%20** | Ürüne dönüşebilirlik, pazar büyüklüğü, "Bir defa yap, hep sat" modeline uygunluk |

### Stratejik Çıkarım
- **En yüksek ağırlık teknikte (%35):** Latency optimizasyonu ve API entegrasyonu demoda gösterilmeli.
- **İnovasyon + Ticarileşme toplamı %45:** Sadece teknik demo yetmez; gerçek bir pazar problemi çözülmeli ve gelir modeli net olmalı.
- **UX %20:** Ajanın "insan gibi" konuşması, hata durumlarında zarif toparlama (graceful fallback) kritik.

---

## 2. Jüri Üyeleri - Derinlemesine Analiz

### 2.1 Birkan Babakol — Founder @ The Client Company

| Bilgi | Detay |
|-------|-------|
| **Deneyim** | 30+ yıl müşteri deneyimi (CX), çağrı merkezi ve CRM alanında |
| **Kariyeri** | Turk.Net (Sabancı Holding) Call Center Director → Procat International → AloTech Co-Founder (bulut çağrı merkezi, $3M yatırım) → Bain & Company Senior Advisor → Doping Hafıza CGO → OPLOG Board Member |
| **Uzmanlık** | CX stratejisi, NPS, çağrı merkezi optimizasyonu, conversational commerce, cloud migration |
| **Sosyal Medya** | LinkedIn: /in/birkanbabakol, X: @birkan |

**Birkan'ı etkileyen noktalar:**
- Müşteri merkezli düşünce — "Bu ajan müşteriyi ne kadar iyi anlıyor?"
- Ölçülebilir CX metrikleri (NPS, CSAT, çözüm oranı)
- Operasyonel mükemmellik — sadece teori değil, çalışan uçtan uca sistem
- Cloud-native, SaaS modeli
- Conversational commerce deneyimi (AloTech kurucusu!)

**ATTN için ipucu:** Birkan, AloTech ile bulut çağrı merkezi kurmuş biri. Sesli ajanınızın klasik IVR/çağrı merkezlerinden farkını somut metriklerle (latency, çözüm oranı, maliyet tasarrufu) gösterin. CX jargonuna hakim olun.

---

### 2.2 Fatih Güner — Komünite & Lokomotif AI Kurucusu

| Bilgi | Detay |
|-------|-------|
| **Deneyim** | 25+ yıl dijital medya, topluluk yönetimi, girişimcilik |
| **Kariyeri** | sosyalmedya.co Founder (2014'te Webrazzi'ye satış) → Siyasi dijital kampanya yöneticisi (28 kişilik ekip) → Performans pazarlama ajansı → Komünite Founder (2020) → Lokomotif AI |
| **Felsefesi** | "Bir Defa Yap, Hep Sat" — productize et, zaman satma |
| **Yatırımcıları** | Nevzat Aydın (Yemeksepeti), Teknasyon, Pre-Series A: $10M değerleme |
| **Sosyal Medya** | X: @fatihguner, LinkedIn: /in/fatihguner |
| **Kitap** | "500 Gün" — bağımsız girişimciler için referans kitap |
| **TEDx** | TEDxBursa: "Her Şey Çok Net Olsun!" (50K+ görüntülenme) |

**Fatih'i etkileyen noktalar:**
- **"Bir defa yap, hep sat" modeli** — ürününüzün SaaS/recurring revenue modeline uygunluğu
- Topluluk değeri ve ölçeklenebilirlik
- Mikro-exit potansiyeli — büyük hayaller güzel ama gerçekçi gelir planı şart
- Ürün odaklılık — teknoloji araç, amaç değil
- Global düşünce — TL değil USD kazanma potansiyeli

**ATTN için ipucu:** Fatih, "build once, sell forever" adamı. Sunumda ürünün nasıl bir SaaS'a dönüşeceğini, aylık recurring revenue modelini ve ilk 100 müşteriye ulaşma planını net anlatın. Topluluk etkisi ve sosyal kanıt (social proof) önemli.

---

### 2.3 Görkem Yurtseven — Co-Founder & CTO @ fal.ai

| Bilgi | Detay |
|-------|-------|
| **Eğitim** | University of Pennsylvania — Computer Systems Engineering |
| **Kariyeri** | Amazon AWS (SageMaker) → fal.ai Co-Founder & CTO (2021) |
| **fal.ai** | $4.5B değerleme, Sequoia/a16z yatırımı, 2M+ geliştirici, 100M+/gün inference |
| **Teknik Derinlik** | 100+ custom CUDA kernel, TensorRT, ~120ms inference süresi |
| **Sosyal Medya** | X: @gorkemyurt, LinkedIn: /in/gorkemy |

**Görkem'i etkileyen noktalar:**
- **Latency her şeydir** — milisaniye farkları bile UX'i doğrudan etkiler
- Developer experience — temiz API kullanımı, basit entegrasyon
- Optimizasyon obsesyonu — her katmanda performans düşüncesi
- fal.ai API'lerinin verimli ve yaratıcı kullanımı
- Flat organizasyon, herkes kod yazar — "çalışan demo" > "güzel sunum"

**ATTN için ipucu:** Görkem teknik bir kurucu. fal.ai API'lerini ne kadar derinlemesine kullandığınızı gösterin. Latency metriklerini ölçüp sunumda paylaşın (örn: "ortalama yanıt süremiz X ms"). fal.ai'ın inference motorunu sadece "çağırmak" değil, optimize etmek (caching, preloading, streaming) puan kazandırır.

---

### 2.4 Tunga Bayrak — Co-Founder & CEO @ Freya (YC S25)

| Bilgi | Detay |
|-------|-------|
| **Eğitim** | UPenn CS (dropout), 16 yaşında Quantum ML araştırma makalesi, Türkiye matematik olimpiyatı birincisi (250K öğrenci arasında) |
| **Kariyeri** | Caltech quantum computing araştırması → UPenn → MotionShark (AI tutoring, Mark Cuban partneri) → Freya AI CEO |
| **Freya AI** | YC S25, $3.5M seed, finans sektörü için voice AI ajanları |
| **Odak** | Neural intonation, compliance-first design, duygu algılama |
| **Sosyal Medya** | X: @TungaBayrak, LinkedIn: /in/tunga-bayrak, GitHub: /tungabayrak |

**Tunga'yı etkileyen noktalar:**
- **"Finansal sektörde hata yapamazsınız"** — doğruluk ve güvenilirlik kritik
- İnsan benzeri ses kalitesi — robotik değil, doğal kadans, ton, duygu
- Neural intonation — duraksamalar, ses tonu değişimleri, empati
- Freya API'lerinin derinlemesine kullanımı (sadece wrapper değil)
- Compliance ve güvenlik düşüncesi
- Tool calling yeteneği — ajanın dış sistemlerle entegrasyonu

**ATTN için ipucu:** Tunga, Freya'nın kurucusu olarak ajanınızın ses kalitesine, doğallığına ve Freya platformunun ne kadar iyi kullanıldığına bakacak. Ajanın sadece metin okumadığını, gerçek bir "konuşma" yaptığını gösterin. Hata durumlarında (yanlış anlama, bağlam kaybı) nasıl toparlıyor — bunu canlı demoda göstermek çok değerli.

---

### 2.5 Umut Günbak — Operations @ fal

| Bilgi | Detay |
|-------|-------|
| **Eğitim** | Boğaziçi Üniversitesi |
| **Rolü** | fal.ai Türkiye/Avrupa operasyonları, topluluk yönetimi, hackathon organizasyonu |
| **Aktiviteler** | Adapty x FAL Istanbul Hackathon organizatörü, fal Startup Program Europe kurucusu, 180DC Boğaziçi Başkanı |
| **Sosyal Medya** | X: @umutgunbak, LinkedIn: /in/umutgunbak |

**Umut'u etkileyen noktalar:**
- fal.ai ekosisteminin etkin kullanımı
- Geliştirici topluluğuna katkı potansiyeli
- Türkiye pazarına uygunluk
- Ürünün ölçeklenebilirliği ve startup potansiyeli
- Generative media kullanım senaryoları

**ATTN için ipucu:** Umut, fal'ın Türkiye operasyonlarını yürütüyor. fal.ai'ın startup programına başvurabilecek bir ürün ortaya koymak, hackathon sonrası da ilişkiyi sürdürmenizi sağlar. fal API'lerini yaratıcı şekilde kullanın.

---

## 3. Jüri Kompozisyonu — Ne Anlama Geliyor?

| Jüri | Temsil Ettiği Bakış Açısı | En Çok Değer Verdiği |
|------|---------------------------|----------------------|
| Birkan Babakol | **Müşteri Deneyimi / Kurumsal** | CX metrikleri, operasyonel verimlilik, gerçek dünya etkisi |
| Fatih Güner | **Girişimcilik / Ürün** | Ticarileşme, SaaS modeli, ölçeklenebilirlik |
| Görkem Yurtseven | **Teknik Altyapı (fal.ai)** | Latency, API kullanımı, mühendislik kalitesi |
| Tunga Bayrak | **Voice AI (Freya)** | Ses doğallığı, compliance, Freya entegrasyonu |
| Umut Günbak | **Operasyon / Ekosistem (fal)** | fal ekosistemi, Türkiye pazarı, topluluk |

### Kritik Çıkarım
Jüride **2 kişi fal.ai'dan** (Görkem + Umut) ve **1 kişi Freya'dan** (Tunga). Bu, hackathon sponsorlarının API'lerini **derinlemesine ve verimli kullanmanın** değerlendirmede çok önemli olduğunu gösteriyor. Birkan **CX/iş değeri**, Fatih ise **ürün/ticarileşme** perspektifinden bakacak.

---

## 4. ATTN Ekibinin Güçlü Yönleri (CV Analizi)

| Güçlü Yön | Hackathon ile İlişkisi |
|------------|------------------------|
| **5 hackathon kazanımı** (Siemens 1., Meta Llama Top 5, Ticaret Bakanlığı 3., IU 2., Teknofest Finalist) | Jüride güçlü "track record" izlenimi yaratır |
| **Agentic AI deneyimi** (AIKanStock — otonom Kanban mantığı) | Voice AI ajanı için otonom karar ağacı tasarlama yetkinliği |
| **RAG sistemi deneyimi** (IU Hackathon, informis-ai, TableRAG) | Ajanın bilgi tabanına erişimi için RAG mimarisi kurabilme |
| **LangChain/LangGraph uzmanlığı** | Freya + fal.ai üzerinde agentic workflow kurma becerisi |
| **FastAPI backend** | Düşük latency backend servisi için doğrudan uygulanabilir |
| **Full-stack yetenek** (React.js/React Native + FastAPI + Redis + Supabase) | Uçtan uca ürün geliştirme — web widget veya mobil entegrasyon |
| **Tool calling deneyimi** (Lead Discovery projesi, n8n workflow) | Hackathon'un özellikle vurguladığı "tool calling" yeteneği |
| **1000+ eşzamanlı kullanıcı deneyimi** (Teknofest yoklama sistemi) | Ölçeklenebilirlik ve performans optimizasyonu |

---

## 5. Stratejik Öncelikler — Puan Maksimizasyonu

### Öncelik 1: Teknik Mükemmellik (%35)
- [ ] Freya AI ve fal.ai API'lerini entegre et — "Hello World" testini 9 Şubat'ta tamamla
- [ ] Latency ölçümü yap ve optimize et (hedef: <500ms uçtan uca yanıt)
- [ ] Interruption handling: Kullanıcı ajanı kestiğinde zarif şekilde dur ve yeniden başla
- [ ] Tool calling: Ajanın dış API'lere (takvim, CRM, veritabanı) sesli komutla erişmesini göster
- [ ] Hata yönetimi: Ajanın anlamadığında "doğal" bir şekilde tekrar sormasını sağla
- [ ] fal.ai inference motorunu streaming modda kullan (varsa)
- [ ] Redis/cache ile sık kullanılan yanıtları hızlandır

### Öncelik 2: İnovasyon (%25)
- [ ] Gerçek bir problemi çöz — mevcut yöntemlerden (IVR, web formu, tuşlama) neden daha iyi?
- [ ] "Voice-first" yaklaşım: Ekran bağımlılığını azaltan bir senaryo seç
- [ ] Sektör odağı belirle (CX, Fintech, EdTech, Erişilebilirlik vb.)
- [ ] Farklılaştırıcı özellik: Duygu algılama, bağlam hafızası, çoklu dil desteği

### Öncelik 3: Kullanıcı Deneyimi (%20)
- [ ] Ajanın kişiliğini tasarla — isim, ses tonu, konuşma stili
- [ ] Doğal diyalog akışı: "Evet/hayır" kalıplarının ötesinde serbest konuşma
- [ ] Hata senaryoları: Yanlış anlama, sessizlik, beklenmedik girdi durumlarında zarif toparlama
- [ ] Kullanıcı güveni: Ajanın kendini tanıtması, ne yapabileceğini açıklaması

### Öncelik 4: Ticarileşme (%20)
- [ ] İş modeli: SaaS pricing (aylık/yıllık), API kullanım başına ücretlendirme
- [ ] Hedef pazar büyüklüğü: TAM/SAM/SOM hesapla
- [ ] "Bir defa yap, hep sat" modeline uygunluk (Fatih Güner'in felsefesi!)
- [ ] İlk 100 müşteri planı
- [ ] Maliyet avantajı: Geleneksel çağrı merkezine kıyasla tasarruf hesabı

---

## 6. Önerilen Ürün Kategorileri (Jüri Uyumu Analizi)

| Kategori | Birkan | Fatih | Görkem | Tunga | Umut | Toplam Uyum |
|----------|--------|-------|--------|-------|------|-------------|
| **Yeni Nesil CX (Müşteri Hizmetleri)** | ★★★ | ★★ | ★★ | ★★★ | ★★ | ★★★★★ |
| **Fintech (Sesli Bankacılık)** | ★★ | ★★ | ★★ | ★★★ | ★★ | ★★★★ |
| **EdTech (AI Öğretmen/Koç)** | ★★ | ★★★ | ★★ | ★ | ★★ | ★★★★ |
| **Erişilebilirlik** | ★★ | ★★ | ★ | ★★ | ★ | ★★★ |
| **Oyun/Eğlence** | ★ | ★ | ★★★ | ★ | ★★★ | ★★★ |
| **Kişisel Asistan** | ★★ | ★★ | ★★ | ★★ | ★★ | ★★★★ |

### Tavsiye: Yeni Nesil CX veya Fintech
- **Birkan'ın** 30 yıllık CX/çağrı merkezi deneyimi bu alana doğrudan rezonans yaratır
- **Tunga'nın** Freya'sı finans sektörüne odaklı — fintech senaryosu Freya'nın vizyonuyla birebir örtüşür
- **Fatih** için net bir SaaS gelir modeli çizilebilir
- **Görkem ve Umut** için fal.ai API kullanımı her kategoride geçerli

---

## 7. Sunum Stratejisi (Demo Day - 15 Şubat)

### Sunum Yapısı (Tahmini 7-10 dk)
1. **Problem** (1 dk): Somut bir ağrı noktası — rakamlarla destekle
2. **Çözüm** (1 dk): Sesli ajanınızın ne yaptığını tek cümlede özetle
3. **Canlı Demo** (3-4 dk): En güçlü senaryo + bir hata senaryosunda toparlama
4. **Teknik Mimari** (1 dk): Freya + fal.ai + backend akış diyagramı, latency metrikleri
5. **İş Modeli** (1 dk): SaaS pricing, hedef pazar, maliyet avantajı
6. **Takım** (30 sn): ATTN'ın track record'u (5 hackathon kazanımı)

### Demo İpuçları
- **B Planı hazırla:** Canlı demo başarısız olursa, önceden kaydedilmiş video hazır olsun
- **Latency'yi göster:** Demo sırasında yanıt süresini ekranda real-time göster
- **Hata senaryosu:** Ajanın yanlış anladığı bir durumu kasıtlı olarak göster ve nasıl toparlıyor sunumlaya
- **Tool calling demo:** Ajanın sesli komutla bir API çağırmasını göster (örn: sipariş sorgulama, randevu alma)
- **Türkçe + İngilizce:** Çoklu dil desteği varsa kısa bir geçiş yap

### Jüriye Özel Mesajlar
| Jüri Üyesi | Sunumda Vurgula |
|-------------|-----------------|
| Birkan Babakol | "Geleneksel IVR'a kıyasla %60 daha hızlı çözüm, %50 maliyet tasarrufu" |
| Fatih Güner | "SaaS modeli, MRR projeksiyonu, ilk 100 müşteri planı" |
| Görkem Yurtseven | "fal.ai inference: X ms latency, Y istek/saniye throughput" |
| Tunga Bayrak | "Freya ajanı: doğal Türkçe, duygu algılama, compliance-ready" |
| Umut Günbak | "fal ekosistemiyle tam entegrasyon, startup programa uygun ürün" |

---

## 8. Haftalık Takvim ve Milestone'lar

| Tarih | Etkinlik | Hedef Çıktı |
|-------|----------|-------------|
| **9 Şubat Pzt** (20:00-21:30) | Online Check-in: Onboarding & Fikir Validasyonu | Proje konusu kesinleşmiş, API erişimleri test edilmiş, "Hello World" tamamlanmış |
| **10 Şubat Sal** (20:00-21:30) | Sistem Mimarisi & MVP Kapsamı | Teknik akış diyagramı, karar ağacı, MVP feature listesi |
| **11 Şubat Çar** (Gün boyu) | 1-on-1 Mentorluk Seansları | Teknik blocker'lar çözülmüş, tool calling senaryoları netleşmiş |
| **12 Şubat Per** (20:00-21:30) | Entegrasyon & Latency Testi | Alpha prototip çalışıyor, uçtan uca sesli diyalog test edilmiş, latency raporu |
| **13 Şubat Cum** (20:00-21:30) | Sunum Tasarımı & Final Kontroller | Pitch deck hazır, demo videosu (B planı) kaydedilmiş |
| **14 Şubat Cmt** | — | Son bug fix'ler, demo provası, stres testi |
| **15 Şubat Paz** (09:30) | **BÜYÜK FİNAL @ Komünite Space** | Code freeze (10-13), Demo (13-16:30), Ödül (16:30-18) |

---

## 9. Teknik Mimari Önerisi

```
┌─────────────────────────────────────────────────────┐
│                    KULLANICI                         │
│              (Web Widget / Mobil / Telefon)          │
└──────────────────────┬──────────────────────────────┘
                       │ Ses Girişi
                       ▼
┌─────────────────────────────────────────────────────┐
│               FREYA AI - Voice Engine                │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │ STT (Speech │  │ Ajan Zekası  │  │ TTS (Text  │ │
│  │ to Text)    │→ │ + Hafıza     │→ │ to Speech) │ │
│  └─────────────┘  └──────┬───────┘  └────────────┘ │
└──────────────────────────┼──────────────────────────┘
                           │ Tool Calling
                           ▼
┌─────────────────────────────────────────────────────┐
│              BACKEND (FastAPI + LangGraph)            │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Redis    │  │ RAG       │  │ Tool Functions   │ │
│  │ (Cache/  │  │ (Bilgi    │  │ (CRM, Takvim,    │ │
│  │ Session) │  │ Tabanı)   │  │ Sipariş vb.)     │ │
│  └──────────┘  └───────────┘  └──────────────────┘ │
└──────────────────────────┬──────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────┐
│              fal.ai - Inference Engine                │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │ Generative Media │  │ Ek AI Modelleri          │ │
│  │ (Görsel/Video)   │  │ (Duygu analizi, vb.)     │ │
│  └──────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 10. Riskler ve Önlemler

| Risk | Olasılık | Etki | Önlem |
|------|----------|------|-------|
| Canlı demoda internet/ses problemi | Yüksek | Kritik | B planı: Önceden kaydedilmiş demo videosu |
| Freya API rate limit / downtime | Orta | Yüksek | Fallback senaryosu, error handling, retry logic |
| Latency spike (yüksek gecikme) | Orta | Yüksek | Cache stratejisi, preloading, latency monitoring dashboard |
| Ajanın Türkçe'yi yanlış anlaması | Yüksek | Orta | Sınırlı domain vocabulary, fallback: "Anlayamadım, tekrar eder misiniz?" |
| Jüri sorusuna hazırlıksız yakalanma | Orta | Orta | Olası soruları önceden hazırla (aşağıda) |

---

## 11. Jüriden Gelebilecek Olası Sorular

### Birkan Babakol (CX perspektifi)
- "Bu ajan mevcut çağrı merkezi altyapısına nasıl entegre olur?"
- "Müşteri memnuniyetini nasıl ölçüyorsunuz? CSAT/NPS entegrasyonu var mı?"
- "Ajanın çözemediği durumlarda insana aktarım (handoff) nasıl çalışıyor?"

### Fatih Güner (Girişimcilik perspektifi)
- "İlk ödeme yapan müşteriniz kim olur? Fiyatlandırma modeliniz ne?"
- "Bu ürünü hackathon sonrası sürdürmeyi planlıyor musunuz?"
- "Rekabetçi avantajınız nedir? Başka biri bunu neden yapamaz?"

### Görkem Yurtseven (Teknik perspektif)
- "Ortalama latency'niz kaç ms? P99 nedir?"
- "fal.ai API'sini hangi modeller için kullanıyorsunuz? Neden bu modeli seçtiniz?"
- "Ölçeklendirme planınız ne? 1000 eşzamanlı kullanıcıda ne olur?"

### Tunga Bayrak (Voice AI perspektifi)
- "Ajanın doğal ses tonu nasıl sağlanıyor? Hangi TTS/STT modelini kullanıyorsunuz?"
- "Kullanıcı ajanı kestiğinde (interruption) ne oluyor?"
- "Hallucination'ı nasıl önlüyorsunuz? Yanlış bilgi verme riski?"

### Umut Günbak (Ekosistem perspektifi)
- "fal.ai'ın hangi özelliklerinden yararlandınız?"
- "Bu ürünü fal startup programına başvurduğunuzda nasıl konumlandırırsınız?"

---

## 12. Sonuç: Kazanma Formülü

```
KAZANMA = Düşük Latency (Görkem ✓)
        + İnsan Benzeri Ses (Tunga ✓)
        + Gerçek CX Problemi (Birkan ✓)
        + SaaS İş Modeli (Fatih ✓)
        + fal.ai Derinlik (Umut ✓)
        + Çalışan Canlı Demo (Herkes ✓)
```

**ATTN ekibinin avantajı:** 5 hackathon deneyimi, agentic AI + RAG + full-stack yetkinlik, ve en önemlisi — çalışan ürün çıkarma becerisi. Bu hackathon'da fark yaratacak olan, "en karmaşık sistemi kuran" değil, "en iyi çalışan ve en doğal konuşan ajanı" sahneye çıkaran ekip olacak.

---

*Bu belge ATTN ekibi için hazırlanmıştır. Son güncelleme: 8 Şubat 2026*
