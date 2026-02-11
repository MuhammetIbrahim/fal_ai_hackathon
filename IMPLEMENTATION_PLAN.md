# Ocak Yemini — Implementation Plan (Katmanlı)

## Vizyon

Oyuncuların kimliği kanıt ile değil **davranış, tutarlılık, niyet–eylem uyumu, sosyal baskı ve politik koalisyonlar** üzerinden dedükte ettiği sesli AI Turing testi.

- 8 oyuncu (insan + LLM karışık)
- 2 soy: Et-Can / Yankı-Doğmuş
- Ölüm yok, sürgün var (tür ifşası yok)
- Evren dışı / meta konuşma tabu

---

## Katman 0 — Hackathon MVP (Mevcut + Küçük Eklemeler)

**Durum:** Büyük kısmı zaten implemente.

### Mevcut (çalışıyor)
- [x] Karakter üretimi (LLM ile isim, unvan, rol)
- [x] Morning sahne (anlatıcı text, typewriter)
- [x] Campfire konuşma (orchestrator + moderator + sıra yönetimi)
- [x] Free Roam (konum seçimi: ateş başı / ev / ziyaret)
- [x] House Visit (1v1 exchange, 4 tur)
- [x] Vote + Exile (oy toplama, sürgün animasyonu)
- [x] Game Over (kazanan taraf + tüm oyuncu ifşası)
- [x] WebSocket entegrasyonu (frontend ↔ backend)
- [x] TTS ses üretimi (fal.ai tts_generate → audio URL → frontend playback)

### Eksik (Katman 0 tamamlama)
- [ ] **Karakter Kartı genişletme** — mevcut karakter üretimine ekle:
  - Arketip (şüpheli sessiz / konuşkan / agresif / sakin / manipülatif / idealist)
  - Kamu Tik'i (görünen alışkanlık — konuşmalara yansır)
  - Alibi Çapası (test edilebilir günlük rutin iddiası)
  - Konuşma Rengi (1–3 cümle, LLM persona prompt'una eklenir)
- [ ] **Kurum dağılımı** — 8 oyuncuya kurum ata:
  - 2 Kilerciler, 2 Geçitçiler, 1 Kül Rahibi, 1 Şifacı, 1 Demirci, 1 Han İnsanı
  - `generate_characters` prompt'una kurum bilgisi ekle
- [ ] **Alamet (Omen) — sadece atmosfer**
  - Morning'de 3 alamet ikonu göster (12'lik havuzdan rastgele 3)
  - UI'da Omen Bar (zaten component var, içeriği dinamik yap)
  - Alametin etkisi yok, sadece anlatıcı text'e ve campfire konuşma prompt'larına flavor ekler

### Dosyalar
| Dosya | İşlem |
|-------|-------|
| `src/prototypes/generate_characters.py` | Kart alanları ekle |
| `src/prototypes/game_state.py` | Player model'e yeni alanlar |
| `src/prototypes/game.py` | `run_morning()` alamet seçimi |
| `fal_services.py` | Karakter üretim prompt güncelle |
| `attnfigma/src/components/campfire/OmenBar.tsx` | Dinamik alamet gösterimi |

---

## Katman 1 — Spotlight + Sınama + Ocak Tepkisi (Yumuşak)

**Hedef:** Konuşmalara yapı ve yakalanabilirlik ekle.

### 1.1 Spotlight Sahne Kartları
- Her gün 2-3 oyuncu "spotlight" olur
- Spotlight olan oyuncu campfire'da söylemesi gereken:
  - 2 Gerçek (kısa, kart bilgisinden türetilir)
  - 1 Gündem Cümlesi (politik hamle — kurum çıkarı)
  - 1 Yemin Cümlesi (evren içi roleplay)
- LLM oyuncular prompt'a spotlight kartı eklenir
- İnsan oyuncu spotlight kartını UI'da görür
- Söylemezse → sonuç Katman 1'de yok (Katman 2'de Ocak Tepkisi T3)

### 1.2 Sınama Event'i (günde 1)
- Tip havuzu (başlangıç 3 tip):
  - **Eşik Haritası**: "Dün gece X lokasyonunda kimler vardı?" (mekânsal tutarlılık)
  - **Kor Bedeli**: "Bu kararı neden aldın?" (niyet–eylem uyumu)
  - **Sessiz Soru**: Rastgele 1 oyuncuya sürpriz tek soru
- Sonuç: "Ocak Yankısı" olarak görünür (yumuşak/orta) — kişiye etiket yapmaz
- Morning event'inin bir parçası olarak tetiklenir

### 1.3 Ocak Tepkisi (sadece T1 + Kıvılcım seviyesi)
- **T1 tetikleyici:** Kamu canon ile açık çelişen kesin iddia
- **Tepki:** Sadece Kıvılcım — "Ocak kısa kıvılcım attı; kalabalık huzursuzlandı."
- Bilgilendirici, cezalandırıcı değil
- Mekanik sonuç yok, sadece sosyal sinyal

### Dosyalar
| Dosya | İşlem |
|-------|-------|
| `src/prototypes/game.py` | Spotlight seçimi + sınama event üretimi |
| `src/core/game_loop.py` | Campfire'a spotlight akışı ekle |
| `src/core/game_loop.py` | Sınama event broadcast |
| `src/core/game_loop.py` | T1 tutarsızlık tespiti (LLM-based) |
| `attnfigma/src/scenes/CampfireScene.tsx` | Spotlight kartı UI |
| `attnfigma/src/scenes/MorningScene.tsx` | Sınama event gösterimi |
| `attnfigma/src/types/game.ts` | SpotlightCard, SinamaEvent tipleri |

---

## Katman 2 — Lokasyonlar + Mini Event'ler + UI Objeleri + Tam Ocak Tepkisi

**Hedef:** Dünyayı somutlaştır, ipucu motorunu çalıştır.

### 2.1 Kurum Lokasyonları
- Free Roam'da sadece "ateş/ev/ziyaret" değil, kurum lokasyonlarına gitme seçeneği:
  - Kiler/Ambar, Geçit Kulesi, Kül Tapınağı, Şifahane, Demirhane, Gezgin Hanı
- Her lokasyonda 1 mini sahne (LLM üretir)
- Lokasyon ziyaretleri "alibi" olarak campfire'da referans verilebilir

### 2.2 Mini Event'ler
- **Kamu Mini Event:** Campfire öncesi okunur (alamete göre seçilir)
- **Özel Mini Event:** House/lokasyon girişinde tetiklenir
- Her mini event en az 1 UI objesine bağlanır

### 2.3 UI Objeleri (6 tane ile başla)
Aktif objeler (event'e göre 2-3'ü gösterilir, geri kalanı gizli):
1. Kiler Kapısı (kilit durumu)
2. Anahtar Halkası (kayıp/var)
3. Kayıt Defteri (1 satır bulanık)
4. Nöbet Levhası (isimler + silik satır)
5. Kül Kasesi (doluluk çizgisi)
6. Şifahane Dolabı (şişe sayacı)

### 2.4 Ocak Tepkisi — Tam (T1 + T2 + Kül Kayması)
- **T1:** Canon çelişki → Kıvılcım
- **T2:** Kendi sözleriyle çelişki → Kıvılcım veya Kül Kayması
- **Kül Kayması:** "Küller bir yana yığıldı…" → 1 zorunlu soru doğar (bilgilendirici, ceza değil)
- ~~T3 (spotlight kaçırma)~~ → kaldırıldı, oyuncu agency'si korunur
- ~~Mavi Çalım~~ → kaldırıldı, mekanik ceza social deduction'da immersion kırar

### Dosyalar
| Dosya | İşlem |
|-------|-------|
| `src/prototypes/game.py` | Lokasyon sahneleri, mini event üretimi |
| `src/core/game_loop.py` | Lokasyon akışı, mini event broadcast |
| `src/core/game_loop.py` | T2 tutarsızlık tespiti (LLM conversation history) |
| `attnfigma/src/scenes/FreeRoamScene.tsx` | Lokasyon seçim UI |
| `attnfigma/src/scenes/LocationScene.tsx` | **YENİ** — kurum lokasyon sahnesi |
| `attnfigma/src/components/ui/GameObjects.tsx` | **YENİ** — UI obje bileşenleri |
| `attnfigma/src/components/ui/MiniEventCard.tsx` | **YENİ** — mini event kartı |

---

## Katman 3 — Gece Entrikası + Kamu Baskısı + Tam Obje Seti

**Hedef:** Politik motoru tam çalıştır.

### 3.1 Gece Entrikası (basitleştirilmiş)
- Her gece 1 hamle: **"Kime sis at?"**
- Hedefin ertesi gün alibi çapası "bulanık" görünür (doğrulanamaz)
- Basit, "kanıt yok ipucu var" felsefesiyle uyumlu
- Koalisyon gerektirmez

### 3.2 Kamu Baskısı (yumuşatılmış)
- Hedef: 1 oyuncu
- Etki: Vote'ta hedefe verilen oylar **+1** (2x değil)
- Aynı hedefe üst üste uygulanamaz
- Counterplay: Baskı altındaki oyuncu campfire'da **1 ekstra konuşma hakkı** kazanır (savunma şansı mekanik değil, retorik)

### 3.3 Tam UI Obje Seti
- 12 zorunlu objenin tamamı aktif
- 8 zenginleştirici opsiyonel
- Gün bazlı 2-3 obje "aktif", geri kalanı gizli/dim

### 3.4 Alamet — Oyuncu Seçimi
- 3 alametin 1'ini oyuncular gece seçer: "Yarınki alametlerden birini sen belirle"
- Bu zincir stratejik olur: alamet → mini event → campfire sorusu

### Dosyalar
| Dosya | İşlem |
|-------|-------|
| `src/core/game_loop.py` | Gece fazı, sis mekanizması, baskı hesaplama |
| `src/prototypes/game.py` | Gece hamle üretimi (AI), baskı etkisi |
| `attnfigma/src/scenes/NightScene.tsx` | **YENİ** — gece entrika UI |
| `attnfigma/src/scenes/VoteScene.tsx` | Baskı göstergesi (+1 badge) |
| `attnfigma/src/components/ui/GameObjects.tsx` | Tam obje seti |

---

## Alamet (Omen) Seti

12'lik havuz — her gün 3'ü seçilir:

| # | Alamet | Atmosfer Etkisi |
|---|--------|-----------------|
| 1 | Paslı Anahtar | Güvensizlik, erişim sorusu |
| 2 | Kırık Çan | İletişim kopukluğu, uyarı |
| 3 | Çatlak Ayna | Kimlik, yansıma, ikiyüzlülük |
| 4 | Silik Mühür | Yetki sorgusu, meşruiyet |
| 5 | Soğuk Kor | Sönmüş umut, gizli tehlike |
| 6 | Kırık Şişe | Kayıp, israf, kaza |
| 7 | Dikenli Taç | Liderlik yükü, fedakarlık |
| 8 | Kanlı Tüy | Masumiyet kaybı, iz |
| 9 | Boş Beşik | Kayıp, gelecek endişesi |
| 10 | Ters Kum Saati | Zaman baskısı, geri dönüşsüzlük |
| 11 | Küllü El İzi | Suç ortaklığı, temas |
| 12 | Yarım Harita | Eksik bilgi, yön kaybı |

---

## Kurum Dağılımı

| Kurum | Sayı | Konum | Rol |
|-------|------|-------|-----|
| Kilerciler | 2 | Kiler/Ambar | Erzak yönetimi |
| Geçitçiler | 2 | Geçit Kulesi | Sınır güvenliği |
| Kül Rahibi | 1 | Kül Tapınağı | Ritüel, alamet yorumu |
| Şifacı | 1 | Şifahane | Sağlık, ilaç |
| Demirci | 1 | Demirhane | Alet, silah, iz |
| Han İnsanı | 1 | Gezgin Hanı | Dedikodu, ticaret |

---

## Öncelik Sırası

```
Katman 0 (hackathon demo)     ██████████████████████ ~%70 bitti
Katman 1 (spotlight + sınama) ░░░░░░░░░░░░░░░░░░░░░ başlamadı
Katman 2 (lokasyon + event)   ░░░░░░░░░░░░░░░░░░░░░ başlamadı
Katman 3 (gece + politik)     ░░░░░░░░░░░░░░░░░░░░░ başlamadı
```

## Notlar

- Her katman bağımsız test edilebilir — bir sonraki katmana geçmeden önce mevcut katman stabil olmalı
- LLM prompt'ları katman bazlı genişler: Katman 0'da basit persona, Katman 3'te tam kart + kurum + alamet + spotlight
- UI objeleri lazy-load: sadece aktif olanlar render edilir
- Ses (TTS) tüm katmanlarda çalışır — zaten entegre
