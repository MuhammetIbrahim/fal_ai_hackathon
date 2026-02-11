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

### 0.2 Karakter Karti Genisletme (TAMAMLANDI)
- [x] `game_state.py` — Player modeline yeni alanlar: `institution`, `institution_label`, `public_tick`, `alibi_anchor`, `speech_color`
- [x] `game.py` — `_build_acting_request()` structured JSON output istiyor (acting_prompt + public_tick + alibi_anchor + speech_color)
- [x] `game.py` — `_parse_character_card()` LLM JSON ciktisini parse eder
- [x] `game.py` — `_generate_acting_prompt()` dict dondurur (str yerine)
- [x] `game.py` — `generate_players()` card dict'ten Player olusturur
- [x] `game.py` — `_build_card_context()` karakter kartindan campfire/1v1 prompt'a eklenir
- [x] `game.py` — CHARACTER_WRAPPER + VISIT_WRAPPER `{card_context}` placeholder eklendi
- [x] `game_engine.py` — mock karakter uretimi yeni alanlarla guncellendi
- [x] NOT: public_tick, alibi_anchor, speech_color hardcoded degil — LLM karakter basina uretir

### 0.3 Kurum Dagilimi (TAMAMLANDI)
- [x] `data.json` — 6 kurum tanimlandi (Kilerci x2, Gecitci x2, Kul Rahibi, Sifaci, Demirci, Han Insani)
- [x] `game.py` — `_build_institution_pool()` oyuncu sayisina gore kurum havuzu
- [x] `game.py` — `create_character_slots()` her karaktere kurum atar
- [x] `game.py` — acting prompt'a kurum bilgisi eklendi
- [x] Frontend `types/game.ts` — `GamePlayer`'a `institution`, `institutionLabel`, `publicTick`, `alibiAnchor`, `speechColor` eklendi

### 0.4 Alamet (Omen) Sistemi — Atmosfer (TAMAMLANDI)
- [x] `data.json` — 12 alamet tanimlandi (id, label, icon, atmosphere)
- [x] `game.py` — `run_morning()` icinde deterministik RNG ile gunun 3 alametini secer, state'e kaydeder
- [x] `game_loop.py` — morning broadcast'ine `omens` array eklendi (id, label, icon)
- [x] Frontend `types/game.ts` — `Omen` interface eklendi
- [x] Frontend `GameContext.tsx` — `omens: Omen[]` state + morning event parse + phase_change reset
- [x] Frontend `MorningScene.tsx` — OmenBar: typewriter bittikten sonra 3 alamet ikonu + isim gosterir

### 0.5 End-to-End Test (TAMAMLANDI)
- [x] Backend + Frontend birlikte calistir
- [x] Yeni oyun olustur, tum fazlari oyna (4 gun, 4 surgun, game over)
- [x] Karakter kartlarinda yeni alanlar gorunuyor mu kontrol et (acting_prompt, public_tick, alibi_anchor, speech_color LLM uretimi OK)
- [x] Morning'de alametler gorunuyor mu kontrol et (gun bazli 3 alamet secimi OK)
- [x] TTS hala calisiyor mu kontrol et (broadcast calisiyor, WS baglantisi olmadan test)
- [x] BUG FIX: `_deserialize_state()` — Player objeleri zaten Player ise tekrar `Player(**p)` yapmamali

---

## Katman 1 — Spotlight + Sinama + Ocak Tepkisi (TAMAMLANDI)

**Hedef:** Konusmalara yapi ve yakalanabilirlik ekle.

### 1.1 Spotlight Sahne Kartlari (TAMAMLANDI)
- [x] `game.py` — her gun 2-3 oyuncu spotlight sec (`generate_spotlight_cards()`)
- [x] Spotlight karti uret: 2 Gercek + 1 Gundem Cumlesi + 1 Yemin Cumlesi (paralel LLM)
- [x] `game_loop.py` — morning sonrasi spotlight kartlarini broadcast et
- [x] LLM oyuncular icin prompt'a spotlight karti ekle (`_build_spotlight_context()` + CHARACTER_WRAPPER)
- [x] Frontend `SpotlightCardDisplay.tsx` — spotlight karti overlay carousel (auto-cycle 6s, kendi kartin altin glow)
- [x] Frontend `types/game.ts` — SpotlightCard tipi
- [x] Frontend `GameContext.tsx` — spotlightCards state + WS handler
- [x] Frontend `MorningScene.tsx` — sinama bittikten 2s sonra spotlight overlay

### 1.2 Sinama Event'i (gunde 1) (TAMAMLANDI)
- [x] `game.py` — 3 sinama tipi: Esik Haritasi, Kor Bedeli, Sessiz Soru (`generate_sinama_event()`)
- [x] `data.json` — sinama_types eklendi (id, label, icon, prompt_hint)
- [x] `game_loop.py` — morning sonrasi sinama broadcast
- [x] Frontend `MorningScene.tsx` — sinama event typewriter gosterimi (omen bardan 2s sonra)
- [x] Frontend `types/game.ts` — SinamaEvent + SinamaType tipi
- [x] Frontend `GameContext.tsx` — sinama state + WS handler

### 1.3 Ocak Tepkisi (T1 + Kivilcim) (TAMAMLANDI)
- [x] `game.py` — `check_ocak_tepki()` Flash LLM ile celiski tespiti
- [x] `game_loop.py` — campfire speech sonrasi T1 tutarsizlik tespiti (her konusmadan sonra)
- [x] Tetikleyici: kamu canon ile acik celisen kesin iddia
- [x] Tepki: narrator mesaji + contradiction hint
- [x] Frontend `CampfireScene.tsx` — kivilcim flash overlay (3s animasyon)
- [x] Frontend `ChatLog.tsx` — tepki bubble (sender === 'Ocak' → turuncu/altin ozel stil)
- [x] Frontend `GameContext.tsx` — ocakTepki state + WS handler
- [x] Frontend `index.css` — `.ocak-flash`, `.cf-bubble.tepki`, `@keyframes ocakFlash/tepkiPulse`

---

## Katman 2 — Lokasyonlar + Mini Event'ler + UI Objeleri + Tam Ocak Tepkisi (TAMAMLANDI)

**Hedef:** Dunyayi somutlastir, ipucu motorunu calistir.

### 2.1 Kurum Lokasyonlari (TAMAMLANDI)
- [x] Free Roam'a kurum lokasyonlari ekle (Kiler, Gecit Kulesi, Kul Tapinagi, Sifahane, Demirhane, Gezgin Hani)
- [x] Her lokasyonda 1 mini sahne (LLM uretir — `generate_institution_scene()`)
- [x] Lokasyon ziyaretleri "alibi" olarak campfire'da referans verilebilir (`_build_card_context` state param)
- [x] Frontend `LocationScene.tsx` — kurum lokasyon sahnesi (typewriter narrative)
- [x] Frontend `FreeRoamScene.tsx` — 6 kurum lokasyonu grid + Kurumlar kolonu
- [x] Frontend `SceneRouter.tsx` — `institution` phase case

### 2.2 Mini Event'ler (TAMAMLANDI)
- [x] Kamu Mini Event: morning sonrasi broadcast (`generate_public_mini_event()`, omen-triggered)
- [x] Ozel Mini Event: lokasyon girisinde tetiklenir (`generate_private_mini_event()`, %50 sans)
- [x] Her mini event en az 1 UI objesine baglanir
- [x] Frontend `MiniEventCard.tsx` — mini event overlay karti
- [x] Frontend `MorningScene.tsx` — sinama'dan sonra mini event gosterimi

### 2.3 UI Objeleri (6 tane) (TAMAMLANDI)
- [x] Kiler Kapisi (kilit durumu: locked/unlocked)
- [x] Anahtar Halkasi (kayip/var: present/missing)
- [x] Kayit Defteri (1 satir bulanik: blurred_line)
- [x] Nobet Levhasi (isimler + silik satir)
- [x] Kul Kasesi (doluluk cizgisi: fill 0-1)
- [x] Sifahane Dolabi (sise sayaci: bottle_count)
- [x] Frontend `GameObjects.tsx` — HUD bar (sadece degisen objeler gosterilir)
- [x] `data.json` — `ui_objects` + `mini_event_templates` eklendi
- [x] `game.py` — `init_state` icinde `_ui_objects` default state dict

### 2.4 Ocak Tepkisi — Tam (T1 + T2 + Kul Kaymasi) (TAMAMLANDI)
- [x] T1: Canon celiski → Kivilcim (her zaman)
- [x] T2: Kendi sozleriyle celiski → %70 Kivilcim, %30 Kul Kaymasi
- [x] Kul Kaymasi: gri flash + 1 zorunlu soru dogar (`_generate_kul_kaymasi_question()`)
- [x] `game.py` — TEPKI_SYSTEM v2 (T1+T2 dual analysis JSON)
- [x] `game_loop.py` — kul_kaymasi event broadcast + _kul_kaymasi_queue
- [x] Frontend `CampfireScene.tsx` — `.kul-kaymasi-flash` overlay (5s gri animasyon)
- [x] Frontend `ChatLog.tsx` — `.cf-bubble.kul-kaymasi` gri/kul stili
- [x] Frontend `index.css` — kul kaymasi CSS + institution badge + mini event card + game objects bar

---

## Katman 3 — Gece Fazı + Kamu Baskısı + Politik Motor

**Hedef:** Politik motoru tam calistir. Gece fazi ekle. Oylamaya derinlik kat.

### 3.1 Gece Fazı — Sis Hattı (TAMAMLANDI)
- [x] Yeni phase: `night` (vote sonrasi, morning oncesi)
- [x] Her gece herkes 1 hamle secer (gizli):
  - **Itibar Kirigi**: Hedef oyuncuya verilen oylar ertesi gun 2x sayilir
  - **Gundem Kaydirma**: Ertesi gunun sinama tipini etkileme
  - **Sahte Iz**: Bir UI objesinde yaniltici degisiklik yaratir
- [x] En cok secilen hamle "gecenin sonucu" olur
- [x] Sonuc ertesi gunun krizine / mini event zincirine donusur
- [x] Frontend `NightScene.tsx` — gece entrika UI (3 secenekli kart)
- [x] `game.py` — `resolve_night_phase()` hamle toplama + sonuc hesaplama
- [x] `game_loop.py` — night phase WS akisi

### 3.2 Kamu Baskısı + Kalkan (TAMAMLANDI)
- [x] Hedef: 1 oyuncu, vote'ta +1 oy etkisi (2x oy)
- [x] Ayni hedefe ust uste uygulanamaz
- [x] Baski altindaki oyuncu campfire'da 1 ekstra konusma hakki
- [x] **Kalkan**: Oyuncu 1 kez kullanabilir, 2x oyu iptal eder
  - Kalkan kullaniminin kendisi "politik iz" birakir
- [x] Frontend `VoteScene.tsx` — baski gostergesi (+1 badge) + kalkan butonu
- [x] `game.py` — baski + kalkan state yonetimi

### 3.3 Tam UI Obje Seti (TAMAMLANDI)
- [x] 12 zorunlu objenin tamami aktif
- [x] 8 zenginlestirici opsiyonel obje
- [x] Gun bazli 2-3 obje "aktif", geri kalani gizli/dim
- [x] Objeler gece hamlelerine baglanir (Sahte Iz → obje degisikligi)

### 3.4 Alamet — Oyuncu Secimi (TAMAMLANDI)
- [x] Gece fazinda 3 alametin 1'ini oyuncular secer
- [x] Zincir: alamet → mini event → campfire sorusu
- [x] Secilen alametin ertesi gun tonu ve krizi uzerinde etkisi var

---

## Katman 4 — Buyuk Kriz + Politik Onerge + Soz Borcu + Atmosfer

**Hedef:** Oyun deneyimini "tam sahne" hissine getir. Her gun kendi hikayesini anlatsin.

### 4.1 Buyuk Kriz Event (Sabah Krizi) (TAMAMLANDI)
- [x] Her sabah 1 "buyuk kriz" olayi (LLM uretir, omenlerden ilham alir)
- [x] Kriz birden fazla UI objesini ayni anda aktif eder (ornek: kiler kapisi + anahtar + defter)
- [x] Kriz kamu canon'una yeni bilgi ekler (herkesin bilecegi somut olay)
- [x] Kalabalik fisiltilari: 2-3 atmosferik NPC cumle (kanit degil, ton)
- [x] `game.py` — `generate_morning_crisis()` buyuk event + UI obje aktivasyonu
- [x] Frontend `MorningScene.tsx` — kriz sahne gosterimi (UI objeleri highlight)

### 4.2 Politik Onerge Sistemi (TAMAMLANDI)
- [x] Campfire'da gunun ana onergesi masaya gelir (LLM uretir, krize bagli)
- [x] AI konusmalari + oylama (surgun oyundan ayri)
- [x] Onerge sonucu kamu canon'a eklenir
- [x] `game.py` — `generate_campfire_proposal()` + `resolve_proposal_vote()` + `generate_proposal_speech()` + `generate_proposal_vote_ai()`
- [x] `game_loop.py` — proposal flow (AI konusmalar + AI+human oylama)
- [x] Frontend `CampfireScene.tsx` — onerge karti + A/B oylama butonu + sonuc gosterimi

### 4.3 Soz Borcu Mekaniği (TAMAMLANDI)
- [x] Kul Kaymasi zorunlu sorusuna kacamak cevap → Soz Borcu dogar
- [x] Soz Borclu oyuncu sonraki turda ilk soru hedefi olur (forced speaker)
- [x] Ust uste 2 Soz Borcu → "Ocak Damgasi" (kamu gorunur uyari)
- [x] `game.py` — `check_soz_borcu()` + `check_soz_borcu_verdict()` + damga mekaniği
- [x] `game_loop.py` — campfire basinda soz borcu kontrol → forced speaker banner
- [x] Frontend `CampfireScene.tsx` — soz borcu banner + damga gostergesi

### 4.4 Alamet Yorumu Turu (TAMAMLANDI)
- [x] Campfire basinda AI oyuncular alamet hakkinda 1 cumle soler
- [x] Bu tur "dili evrene sokar" — herkesin karanlik fantazi tonunda konusmasi
- [x] `game.py` — `generate_omen_interpretation()` omen yorumu prompt + LLM
- [x] `game_loop.py` — campfire_open oncesi omen yorumu turu akisi
- [x] Frontend `CampfireScene.tsx` — omen yorumu banner (speaker: text listesi)

### 4.5 House Giris Mini Event (TAMAMLANDI)
- [x] House ziyaretinde kapidan girerken ozel mini event tetiklenir (%60 sans)
- [x] Bu event 1v1 konusmayi yonlendirir
- [x] `game.py` — `generate_house_entry_event()` kapı tetikleyici
- [x] `game_loop.py` — house_visit_start sonrasi house_entry_event broadcast
- [x] Frontend `HouseScene.tsx` — kapida detay karti (exchanges bos iken gosterilir)

### 4.6 Sinama "Askida Birakma" (TAMAMLANDI)
- [x] Sinama sonucu campfire'da "yankisi" gelir
- [x] Campfire ortasinda sinama yankisi → tartisma besler
- [x] `game.py` — `generate_sinama_echo()` sinama delayed reveal
- [x] `game_loop.py` — opening campfire sonrasi sinama_echo broadcast
- [x] Frontend `GameContext.tsx` — sinamaEcho state + sinama_echo WS handler → chat mesaji olarak eklenir

### 4.7 Harita UI (TAMAMLANDI)
- [x] Gorsel lokasyon haritasi (Ocak Meydani, Kiler, Kule, Tapinak, Sifahane, Demirhane, Han, Sis Hatti)
- [x] Aktif lokasyonlar parlak, bos olanlar dim
- [x] Oyuncu hareketleri haritada canli gosterilir (renkli dot)
- [x] Frontend `MapView.tsx` — SVG tabanli interaktif harita
- [x] `FreeRoamScene.tsx` — compact harita kararlar sonrasi gosterilir

---

## Hackathon Teslim Fazlari

| Faz | Aciklama | Katmanlar |
|-----|----------|-----------|
| Faz 1 | Canli demo — insan oyuncu ses girdisi | Katman 0-2 |
| Faz 2 | Cok oyunculu — lobby sistemi | Katman 0-3 |
| Faz 3 | Cilalama — muzik/SFX, karakter sesleri, demo provasi | Katman 0-4 |

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
Katman 0.2 (karakter karti)      ████████████████████ TAMAM
Katman 0.3 (kurum dagilimi)      ████████████████████ TAMAM
Katman 0.4 (alamet sistemi)      ████████████████████ TAMAM
Katman 0.5 (e2e test)            ████████████████████ TAMAM
Katman 1   (spotlight + sinama)  ████████████████████ TAMAM
Katman 2   (lokasyon + event)    ████████████████████ TAMAM
Katman 3   (gece + politik)      ████████████████████ TAMAM
Katman 4   (kriz + onerge + tam) ████████████████████ TAMAM
```

## Notlar

- Her katman bagimsiz test edilebilir — bir sonraki katmana gecmeden once mevcut katman stabil olmali
- LLM prompt'lari katman bazli genisler: Katman 0'da basit persona, Katman 4'te tam kart + kurum + alamet + spotlight + kriz + onerge
- UI objeleri lazy-load: sadece aktif olanlar render edilir
- Ses (TTS) tum katmanlarda calisir — zaten entegre
- Katman 3 ve 4 "Gün 1 — Çatlak Ayna Günü" referans dökümanından türetilmiştir
