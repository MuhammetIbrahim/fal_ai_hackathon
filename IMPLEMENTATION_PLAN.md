# Ocak Yemini — Implementation Plan (Katmanli)

## Vizyon

Oyuncularin kimligi kanit ile degil **davranis, tutarlilik, niyet-eylem uyumu, sosyal baski ve politik koalisyonlar** uzerinden dedukte ettigi sesli AI Turing testi.

- 8 oyuncu (insan + LLM karisik)
- 2 soy: Et-Can / Yanki-Dogmus
- Olum yok, surgun var (tur ifsasi yok)
- Evren disi / meta konusma tabu

---

## Katman 0 — Hackathon MVP

### 0.1 Temel Altyapi (TAMAMLANDI)
- [x] Karakter uretimi (LLM ile isim, unvan, rol)
- [x] Morning sahne (anlatici text, typewriter)
- [x] Campfire konusma (orchestrator + moderator + sira yonetimi)
- [x] Free Roam (konum secimi: ates basi / ev / ziyaret)
- [x] House Visit (1v1 exchange, 4 tur)
- [x] Vote + Exile (oy toplama, surgun animasyonu)
- [x] Game Over (kazanan taraf + tum oyuncu ifsasi)
- [x] WebSocket entegrasyonu (frontend <-> backend)
- [x] TTS ses uretimi (fal.ai tts_generate -> audio URL -> frontend playback)
- [x] UI polish (dark fantasy tema, tum sahneler)

### 0.2 Karakter Karti Genisletme
- [ ] `data.json` — kamu tik'i havuzu ekle (15+ tik)
- [ ] `data.json` — alibi capasi kaliplari ekle (15+ kalip)
- [ ] `data.json` — konusma rengi ornekleri ekle
- [ ] `game_state.py` — Player modeline yeni alanlar: `institution`, `institution_label`, `public_tick`, `alibi_anchor`, `speech_color`
- [ ] `game.py` — `create_character_slots()` yeni alanlari ata
- [ ] `game.py` — `_build_acting_request()` yeni alanlari prompt'a ekle
- [ ] `game_engine.py` — mock karakter uretimini guncelle (yeni alanlar)

### 0.3 Kurum Dagilimi
- [ ] `data.json` — 6 kurum tanimla (Kilerciler, Gecitciler, Kul Rahibi, Sifaci, Demirci, Han Insani)
- [ ] `game.py` — `create_character_slots()` kurumlari dagit (8 oyuncu icin: 2+2+1+1+1+1)
- [ ] `game.py` — acting prompt'a kurum bilgisi ekle
- [ ] Frontend — `GamePlayer` tipine `institution` alani ekle

### 0.4 Alamet (Omen) Sistemi — Atmosfer
- [ ] `data.json` — 12 alamet tanimla (isim, ikon, atmosfer aciklamasi)
- [ ] `game.py` — `run_morning()` icinde gunun 3 alametini sec
- [ ] `game_loop.py` — morning broadcast'ine alamet verisini ekle
- [ ] Frontend `types/game.ts` — Omen tipi ekle
- [ ] Frontend `GameContext.tsx` — omens state + morning event'inden parse
- [ ] Frontend `MorningScene.tsx` — OmenBar goster (3 alamet ikonu + isim)

### 0.5 End-to-End Test
- [ ] Backend + Frontend birlikte calistir
- [ ] Yeni oyun olustur, tum fazlari oyna
- [ ] Karakter kartlarinda yeni alanlar gorunuyor mu kontrol et
- [ ] Morning'de alametler gorunuyor mu kontrol et
- [ ] TTS hala calisiyor mu kontrol et

---

## Katman 1 — Spotlight + Sinama + Ocak Tepkisi (Yumusak)

**Hedef:** Konusmalara yapi ve yakalanabilirlik ekle.

### 1.1 Spotlight Sahne Kartlari
- [ ] `game.py` — her gun 2-3 oyuncu spotlight sec
- [ ] Spotlight karti uret: 2 Gercek + 1 Gundem Cumlesi + 1 Yemin Cumlesi
- [ ] `game_loop.py` — campfire basinda spotlight kartini broadcast et
- [ ] LLM oyuncular icin prompt'a spotlight karti ekle
- [ ] Frontend `CampfireScene.tsx` — spotlight karti UI (insan oyuncu icin)
- [ ] Frontend `types/game.ts` — SpotlightCard tipi

### 1.2 Sinama Event'i (gunde 1)
- [ ] `game.py` — 3 sinama tipi: Esik Haritasi, Kor Bedeli, Sessiz Soru
- [ ] `game_loop.py` — morning sonrasi sinama broadcast
- [ ] Frontend `MorningScene.tsx` — sinama event gosterimi
- [ ] Frontend `types/game.ts` — SinamaEvent tipi

### 1.3 Ocak Tepkisi (T1 + Kivilcim)
- [ ] `game_loop.py` — campfire speech sonrasi T1 tutarsizlik tespiti (LLM-based)
- [ ] Tetikleyici: kamu canon ile acik celisen kesin iddia
- [ ] Tepki: "Ocak kisa kivilcim atti; kalabalik huzursuzlandi."
- [ ] Frontend — kivilcim animasyonu (campfire'da flash efekt)

---

## Katman 2 — Lokasyonlar + Mini Event'ler + UI Objeleri + Tam Ocak Tepkisi

**Hedef:** Dunyayi somutlastir, ipucu motorunu calistir.

### 2.1 Kurum Lokasyonlari
- [ ] Free Roam'a kurum lokasyonlari ekle (Kiler, Gecit Kulesi, Kul Tapinagi, Sifahane, Demirhane, Gezgin Hani)
- [ ] Her lokasyonda 1 mini sahne (LLM uretir)
- [ ] Lokasyon ziyaretleri "alibi" olarak campfire'da referans verilebilir
- [ ] Frontend `LocationScene.tsx` — **YENI** kurum lokasyon sahnesi

### 2.2 Mini Event'ler
- [ ] Kamu Mini Event: campfire oncesi okunur (alamete gore secilir)
- [ ] Ozel Mini Event: house/lokasyon girisinde tetiklenir
- [ ] Her mini event en az 1 UI objesine baglanir
- [ ] Frontend `MiniEventCard.tsx` — **YENI**

### 2.3 UI Objeleri (6 tane)
- [ ] Kiler Kapisi (kilit durumu)
- [ ] Anahtar Halkasi (kayip/var)
- [ ] Kayit Defteri (1 satir bulanik)
- [ ] Nobet Levhasi (isimler + silik satir)
- [ ] Kul Kasesi (doluluk cizgisi)
- [ ] Sifahane Dolabi (sise sayaci)
- [ ] Frontend `GameObjects.tsx` — **YENI** UI obje bilesenleri

### 2.4 Ocak Tepkisi — Tam (T1 + T2 + Kul Kaymasi)
- [ ] T1: Canon celiski -> Kivilcim
- [ ] T2: Kendi sozleriyle celiski -> Kivilcim veya Kul Kaymasi
- [ ] Kul Kaymasi: "Kuller bir yana yigildi..." -> 1 zorunlu soru dogar

---

## Katman 3 — Gece Entrikasi + Kamu Baskisi + Tam Obje Seti

**Hedef:** Politik motoru tam calistir.

### 3.1 Gece Entrikasi
- [ ] Her gece 1 hamle: "Kime sis at?"
- [ ] Hedefin ertesi gun alibi capasi "bulanik" gorunur
- [ ] Frontend `NightScene.tsx` — **YENI** gece entrika UI

### 3.2 Kamu Baskisi
- [ ] Hedef: 1 oyuncu, vote'ta +1 oy etkisi
- [ ] Ayni hedefe ust uste uygulanamaz
- [ ] Baski altindaki oyuncu campfire'da 1 ekstra konusma hakki
- [ ] Frontend `VoteScene.tsx` — baski gostergesi (+1 badge)

### 3.3 Tam UI Obje Seti
- [ ] 12 zorunlu objenin tamami aktif
- [ ] 8 zenginlestirici opsiyonel
- [ ] Gun bazli 2-3 obje "aktif", geri kalani gizli/dim

### 3.4 Alamet — Oyuncu Secimi
- [ ] 3 alametin 1'ini oyuncular gece secer
- [ ] Zincir: alamet -> mini event -> campfire sorusu

---

## Referans Veriler

### Alamet (Omen) Seti — 12'lik havuz

| # | Alamet | Atmosfer Etkisi |
|---|--------|-----------------|
| 1 | Pasli Anahtar | Guvensizlik, erisim sorusu |
| 2 | Kirik Can | Iletisim kopuklugu, uyari |
| 3 | Catlak Ayna | Kimlik, yansima, ikiyuzluluk |
| 4 | Silik Muhur | Yetki sorgusu, mesuriyet |
| 5 | Soguk Kor | Sonmus umut, gizli tehlike |
| 6 | Kirik Sise | Kayip, israf, kaza |
| 7 | Dikenli Tac | Liderlik yuku, fedakarlik |
| 8 | Kanli Tuy | Masumiyet kaybi, iz |
| 9 | Bos Besik | Kayip, gelecek endisesi |
| 10 | Ters Kum Saati | Zaman baskisi, geri donusuzluk |
| 11 | Kullu El Izi | Suc ortakligi, temas |
| 12 | Yarim Harita | Eksik bilgi, yon kaybi |

### Kurum Dagilimi

| Kurum | Sayi | Konum | Rol |
|-------|------|-------|-----|
| Kilerciler | 2 | Kiler/Ambar | Erzak yonetimi |
| Gecitciler | 2 | Gecit Kulesi | Sinir guvenligi |
| Kul Rahibi | 1 | Kul Tapinagi | Rituel, alamet yorumu |
| Sifaci | 1 | Sifahane | Saglik, ilac |
| Demirci | 1 | Demirhane | Alet, silah, iz |
| Han Insani | 1 | Gezgin Hani | Dedikodu, ticaret |

---

## Ilerleme

```
Katman 0.1 (temel altyapi)       ████████████████████ TAMAM
Katman 0.2 (karakter karti)      ░░░░░░░░░░░░░░░░░░░ sirada <<<
Katman 0.3 (kurum dagilimi)      ░░░░░░░░░░░░░░░░░░░ bekliyor
Katman 0.4 (alamet sistemi)      ░░░░░░░░░░░░░░░░░░░ bekliyor
Katman 0.5 (e2e test)            ░░░░░░░░░░░░░░░░░░░ bekliyor
Katman 1   (spotlight + sinama)  ░░░░░░░░░░░░░░░░░░░ baslamadi
Katman 2   (lokasyon + event)    ░░░░░░░░░░░░░░░░░░░ baslamadi
Katman 3   (gece + politik)      ░░░░░░░░░░░░░░░░░░░ baslamadi
```

## Notlar

- Her katman bagimsiz test edilebilir — bir sonraki katmana gecmeden once mevcut katman stabil olmali
- LLM prompt'lari katman bazli genisler: Katman 0'da basit persona, Katman 3'te tam kart + kurum + alamet + spotlight
- UI objeleri lazy-load: sadece aktif olanlar render edilir
- Ses (TTS) tum katmanlarda calisir — zaten entegre
