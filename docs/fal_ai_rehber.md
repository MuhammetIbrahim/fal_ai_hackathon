# fal.ai — Hackathon Teknik Rehberi

> **Platform:** 600+ generatif AI modeli, tek API | **Değerleme:** $4.5B | **Günlük inference:** 100M+ istek
> **CTO:** Görkem Yurtseven (jüri üyesi!) | **Uptime:** %99.99

---

## 1. fal.ai Nedir?

fal.ai, görüntü/video/ses/3D üretimi için **serverless GPU inference platformu**. Kendi modelini eğitmene gerek yok — hazır 600+ modeli API çağrısıyla kullanıyorsun. Rakiplerine göre **10x daha hızlı** inference iddiası var.

```python
import fal_client

# Bu kadar basit:
result = fal_client.subscribe(
    "fal-ai/flux/dev",
    arguments={"prompt": "a friendly AI assistant avatar"},
)
```

**SDK Desteği:** Python, JavaScript, Kotlin, Swift, Dart

---

## 2. Model Kategorileri

### 2.1 Video Üretimi (Text/Image → Video)

| Model | Özellik | Kullanım Alanı |
|-------|---------|----------------|
| **Kling O3** (Standard/Pro) | Gerçekçi video, başlangıç-bitiş kare kontrolü | Ürün demosu, avatar animasyonu |
| **Kling Video v3** | Sinematik görseller, akıcı hareket | Profesyonel video içerik |
| **Grok Imagine Video** | xAI, **ses dahil video** üretimi | Sesli tanıtım videoları |
| **Veo 3.1** | Google DeepMind, en gelişmiş video modeli | Yüksek kalite sahne üretimi |
| **Sora 2 / 2 Pro** | OpenAI, **ses destekli**, remix özelliği | Yaratıcı video içerik |
| **LTX-2 19B** | Görüntüden sesli video | Hızlı prototipleme |
| **PixVerse v5** | Yüksek kalite kısa klipler | Sosyal medya içeriği |
| **Wan 2.2** | Hareket ve stil kontrolü | Kontrollü video üretimi |

### 2.2 Görüntü Üretimi (Text/Image → Image)

| Model | Özellik |
|-------|---------|
| **FLUX 2 Flex** | Tipografi ve metin render desteği |
| **Nano Banana Pro** | Google, üretim + düzenleme |
| **Recraft V3** | SOTA, uzun metin + vektör sanat |
| **Grok Imagine Image** | xAI, estetik görseller + düzenleme |
| **Kling Image v3 / O3** | Gerçekçi görsel üretimi |
| **FLUX Kontext Pro/Dev** | Bağlamsal görüntü düzenleme |

### 2.3 Ses & Müzik (Audio)

| Model | Özellik | Hackathon Kullanımı |
|-------|---------|---------------------|
| **MiniMax Speech-2.8 HD/Turbo** | Text-to-Speech, yüksek kalite | Sesli ajan yanıtları, TTS alternatifi |
| **MiniMax Speech-02 HD** | TTS, HD ses | Doğal ses üretimi |
| **Chatterbox** | Resemble AI TTS, çeşitli karakterler | Farklı ajan kişilikleri |
| **Dia TTS Voice Clone** | Ses klonlama | Özel ses profili oluşturma |
| **Beatoven Music** | Telifsiz müzik üretimi | Arka plan müziği, bekleme müziği |
| **Beatoven SFX** | Ses efektleri | UI ses geri bildirimleri |
| **Mirelo AI SFX** | Video-senkron ses üretimi | Video içeriklere ses ekleme |

### 2.4 Avatar & Lipsync

| Model | Özellik |
|-------|---------|
| **Aurora** | Avatar animasyonu |
| **VEED Fabric** | Video avatar |
| **Omnihuman v1.5** | İnsan benzeri avatar üretimi |
| **Dreamactor v2** | Videodan karakter hareket transferi |

### 2.5 3D & Yardımcı Araçlar

| Model | Özellik |
|-------|---------|
| **Hunyuan 3D v3.1** | Text/Image → 3D model |
| **Bria RMBG 2.0** | Arka plan kaldırma (image/video) |
| **Topaz Upscale** | Video/görüntü çözünürlük artırma |
| **NSFW Classifier** | İçerik filtreleme |
| **FLUX LoRA Trainer** | Model fine-tuning (<5 dk) |

---

## 3. Teknik Özellikler

| Özellik | Detay |
|---------|-------|
| **Real-time inference** | WebSocket üzerinden sub-100ms görüntü üretimi |
| **Streaming** | Sonuçları parça parça alma |
| **Queue sistemi** | Uzun süren işlemler için asenkron kuyruk |
| **Workflows** | Birden fazla modeli zincirleme (pipeline) |
| **LoRA Training** | 5 dakikada model fine-tuning |
| **Persistent Storage** | `/data` volume ile kalıcı depolama |
| **KV Store** | Runner'lar arası state paylaşımı |

### API Çağrı Yapısı

```python
import fal_client

# Senkron çağrı
result = fal_client.subscribe("fal-ai/model-id", arguments={...})

# Asenkron (kuyruk) çağrı
handler = fal_client.submit("fal-ai/model-id", arguments={...})
result = handler.get()
```

```javascript
import { fal } from "@fal-ai/client";

const result = await fal.subscribe("fal-ai/model-id", {
  input: { prompt: "..." },
});
```

---

## 4. Workflows — Modelleri Zincirleme & Tek API Endpoint

fal.ai'ın en güçlü özelliklerinden biri: **birden fazla modeli görsel editörde birbirine bağla, tek bir API endpoint'i olarak çağır.**

### Nasıl Çalışıyor?

```
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────┐
│  INPUT   │────▶│  Model #1    │────▶│  Model #2    │────▶│  OUTPUT  │
│  Node    │     │  (ör: FLUX)  │     │  (ör: RMBG)  │     │  Node    │
└──────────┘     └──────────────┘     └──────────────┘     └──────────┘
     API isteği       Görsel üret          Arka plan sil       API yanıtı
```

### 3 Temel Bileşen

| Bileşen | Rolü |
|---------|------|
| **Input Node** | API isteğini alır (kullanıcıdan gelen prompt, görsel vb.) |
| **fal Model Node(ler)** | Sıralı model çağrıları — bir öncekinin çıktısı sonrakinin girdisi |
| **Output Node** | Son sonucu API yanıtı olarak döner |

### Node'lar Arası Veri Aktarımı

Bir node'un çıktısını sonraki node'a `$node_id.field` referansıyla bağlıyorsun:

```json
{
  "node_2": {
    "app_id": "fal-ai/bria/rmbg-2.0",
    "depends": ["node_1"],
    "input": {
      "image_url": "$node_1.images.0.url"
    }
  }
}
```

### Workflow Çalıştırma (Kod)

```javascript
import { fal } from "@fal-ai/client";

const stream = fal.stream("workflows/execute", {
  input: {
    workflow_definition: {
      nodes: {
        input: { type: "input" },
        node_1: {
          app_id: "fal-ai/flux/dev",
          depends: ["input"],
          input: { prompt: "$input.prompt" }
        },
        node_2: {
          app_id: "fal-ai/bria/rmbg-2.0",
          depends: ["node_1"],
          input: { image_url: "$node_1.images.0.url" }
        },
        output: {
          type: "output",
          depends: ["node_2"],
          input: { image_url: "$node_2.image.url" }
        }
      }
    },
    input: { prompt: "a cute mascot character" }
  }
});

// Streaming: her adımın sonucunu anlık al
for await (const event of stream) {
  console.log(event.type, event.data);
  // "submit"     → adım başladı
  // "completion"  → adım tamamlandı (ara sonuç)
  // "output"      → workflow bitti (final sonuç)
  // "error"       → hata
}
```

### Event Sistemi (Streaming)

Workflow çalışırken 4 event tipi alırsın:

| Event | Ne Zaman | İçerik |
|-------|----------|--------|
| `submit` | Bir adım başladığında | `node_id`, `app_id`, `request_id` |
| `completion` | Bir adım tamamlandığında | Çıktı verisi + performans metrikleri |
| `output` | Workflow bittiğinde | Final sonuç |
| `error` | Hata olduğunda | HTTP status, hata detayı |

### Hazır Workflow Template'leri (12 adet)

| Template | Ne Yapıyor | Zincirlenen Modeller |
|----------|-----------|----------------------|
| **Documentary** | Metinden hikaye → görsel → ses → video | LLM + Image Gen + TTS + Video |
| **Photo to Video** | 2 fotoğraftan video sahne | Seedream + Seedance |
| **VTON (Virtual Try-On)** | Kıyafet + model = deneme videosu | Bytedance + Seedream + Vision |
| **Game Assets** | Metinden 3D oyun nesnesi | Seedream + Multi-angle + Rodin 3D |
| **Weather** | Konum fotoğrafı + hava durumu → video | Seedream + Seedance |
| **Logo Maker** | Metinden logo tasarımı | LLM + Image Gen |
| **Replace Anything** | Görseldeki nesneyi değiştir | Segmentation + Inpainting |

### Hackathon İçin Workflow Fikirleri

**Workflow 1: Sesli Tarif → Ürün Görseli → Video Reklam**
```
Input (ses metni) → FLUX (görsel üret) → Kling v3 (video animasyon) → Beatoven (müzik) → Output
```

**Workflow 2: Müşteri Fotoğrafı → Avatar → Konuşan Video**
```
Input (fotoğraf) → RMBG (arka plan sil) → Omnihuman (avatar) → Lipsync (konuşma) → Output
```

**Workflow 3: Teknik Destek Görseli**
```
Input (sorun açıklaması) → LLM (çözüm metni) → FLUX (görsel kılavuz) → TTS (sesli anlatım) → Output
```

> **Jüri notu:** Görkem ve Umut, workflow'ları **derinlemesine** kullanmanızı görmek isteyecek. Tek model çağrısı yerine zincirleme pipeline kurmak büyük artı.

---

## 5. Hackathon'da Nasıl Kullanırız?

### Senaryo A: Sesli Ajan + Görsel Üretim
```
Kullanıcı sesle bir şey tarif eder
    → Freya STT ile metne çevrilir
    → fal.ai FLUX/Recraft ile görsel üretilir
    → Görsel kullanıcıya gösterilir + sesli açıklama
```
**Örnek:** "Mavi bir elbise göster" → Ajan görsel üretir ve sesle anlatır

### Senaryo B: Sesli Ajan + Video Avatar
```
Sesli ajan konuşurken
    → fal.ai Avatar/Lipsync modeli ile
    → Ajanın yüzü senkronize hareket eder
```
**Örnek:** Müşteri hizmetleri ajanı görüntülü konuşma yapar

### Senaryo C: Sesli Ajan + Ses Klonlama/Kişilik
```
fal.ai Dia TTS Voice Clone ile
    → Markanın sesini klonla
    → Freya ajanı bu sesle konuşsun
```
**Örnek:** Şirketin kendi ses kimliğiyle konuşan ajan

### Senaryo D: Sesli Komut → Video İçerik
```
Kullanıcı sesle tarif eder
    → Freya ile metin alınır
    → fal.ai Kling/Sora ile video üretilir
    → Beatoven ile müzik eklenir
```
**Örnek:** "30 saniyelik bir tanıtım videosu oluştur" → Komple video pipeline

### Senaryo E: Çoklu Modal CX Ajanı
```
Müşteri sesle sorun bildirir
    → Freya ajanı sorunu anlar
    → fal.ai ile görsel çözüm kılavuzu üretir
    → Adım adım sesli + görsel rehberlik
```
**Örnek:** Teknik destek ajanı — "Routerınızın arkasını göstereyim" diyerek görsel üretir

---

## 5. Jüri Perspektifinden fal.ai Kullanımı

| Jüri | Beklentisi | Nasıl Etkileriz |
|------|-----------|-----------------|
| **Görkem Yurtseven** (fal CTO) | API'nin derin ve verimli kullanımı | Sadece tek model değil, **zincirleme workflow** kur (image → video → audio) |
| **Umut Günbak** (fal Ops) | fal ekosistem uyumu, yaratıcı kullanım | fal startup programına uygun ürün, birden fazla fal modeli kullan |
| **Tunga Bayrak** (Freya CEO) | Freya + fal sinerji | İki platformun **tek vücut gibi** çalışmasını göster |

### Puan Kazandıran Taktikler
1. **Birden fazla fal.ai modeli kullan** — sadece image değil, video + audio + avatar
2. **Latency ölç ve göster** — "fal.ai inference: Xms" dashboard'da real-time göster
3. **Streaming kullan** — sonuçları anlık göster, kullanıcıyı bekletme
4. **Caching/preloading** — sık kullanılan promptları önceden yükle
5. **Workflow zincirleme** — model çıktısını başka modelin girdisine bağla

---

## 6. Hızlı Başlangıç

```bash
# Python SDK kurulumu
pip install fal-client

# JavaScript SDK kurulumu
npm install @fal-ai/client
```

```python
import fal_client
import os

# API key ayarla
os.environ["FAL_KEY"] = "YOUR_API_KEY"

# Görsel üret
image = fal_client.subscribe("fal-ai/flux/dev", arguments={
    "prompt": "professional customer service agent, friendly smile",
    "image_size": "landscape_16_9"
})
print(image["images"][0]["url"])

# TTS — Metin → Ses
speech = fal_client.subscribe("fal-ai/minimax-speech/speech-2.8-hd", arguments={
    "text": "Merhaba, size nasıl yardımcı olabilirim?",
    "voice_id": "default"
})

# Video üret
video = fal_client.subscribe("fal-ai/kling-video/v3/standard/text-to-video", arguments={
    "prompt": "a helpful AI assistant explaining a concept"
})
```

---

*Bu rehber ATTN ekibi için Voice AI Hackathon (9-15 Şubat 2026) kapsamında hazırlanmıştır.*
