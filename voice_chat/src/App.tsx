import { useState, useRef, useCallback, useEffect } from 'react'

interface Message {
  speaker: string
  text: string
  audioUrl?: string
  color: string
  isOrchestrator?: boolean
}

const AUTH = { Authorization: 'Bearer demo-key-123' }
const HEADERS = { 'Content-Type': 'application/json', ...AUTH }

const SPEAKERS = [
  { id: 'user', name: 'Sen', color: '#e94560', voice: '', emoji: '🧑', personality: '' },
  { id: 'ai1', name: 'Kael', color: '#00b4d8', voice: 'alloy', emoji: '🦅', personality: 'Kael milliyetçi, muhafazakâr bir siyasetçi. Geleneklere bağlı, sert söylemli. Devlet otoritesini ve milli değerleri savunur. Kısa, keskin cümleler kurar. Karşı tarafla doğrudan tartışır. Türkçe konuşur.' },
  { id: 'ai2', name: 'Lyra', color: '#f4a261', voice: 'zeynep', emoji: '🌹', personality: 'Lyra ilerici, sosyal demokrat bir aktivist. Eşitlik, özgürlük ve insan haklarını savunur. Sakin ama kararlı konuşur. Karşı tarafın argümanlarına direkt yanıt verir. Türkçe konuşur.' },
]

const ORCHESTRATOR = {
  name: 'Moderatör',
  color: '#a855f7',
  emoji: '⚖️',
  voice: 'ali',
}

const TOPIC = 'Türkiye\'de eğitim sistemi baştan aşağı değişmeli mi? Mevcut sistem kimin işine yarıyor?'
const MOD_INTERVAL = 4

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [status, setStatus] = useState('Konuyu seç ve başla')
  const [isRecording, setIsRecording] = useState(false)
  const [textInput, setTextInput] = useState('')
  const [topic, setTopic] = useState(TOPIC)
  const [started, setStarted] = useState(false)
  const [activeSpeakerId, setActiveSpeakerId] = useState('')

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef<Message[]>([])
  const msgCountSinceModRef = useRef(0)

  // ── GENERATION ID: her loop'a benzersiz ID, eski loop'lar kendini öldürür ──
  const genRef = useRef(0)
  // ── Tek audio ref: aynı anda tek ses çalar ──
  const currentAudioRef = useRef<HTMLAudioElement | null>(null)
  // ── Loop çalışıyor mu? ──
  const loopRunningRef = useRef(false)

  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Yardımcı: bu generation hâlâ geçerli mi? ──
  const isStale = (gen: number) => gen !== genRef.current

  // ── API helpers ──
  const llmCall = async (prompt: string, systemPrompt: string, temp = 0.8): Promise<string> => {
    const res = await fetch('/v1/llm/generate', {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ prompt, system_prompt: systemPrompt, temperature: temp }),
    })
    if (!res.ok) throw new Error(`LLM ${res.status}`)
    return (await res.json()).output?.trim() || ''
  }

  const ttsCall = async (text: string, voiceId: string): Promise<string | null> => {
    const res = await fetch('/v1/voice/tts', {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ text, voice_id: voiceId, voice_speed: 1.0 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.audio_url) return data.audio_url
    if (data.job_id) return await pollJob(data.job_id)
    return null
  }

  // ── Ses çal — eski sesi DURDUR, yenisini başlat ──
  const playAudioAndWait = (url: string, gen: number): Promise<void> =>
    new Promise((resolve) => {
      // Eski ses varsa durdur
      if (currentAudioRef.current) {
        currentAudioRef.current.pause()
        currentAudioRef.current.src = ''
        currentAudioRef.current = null
      }
      // Stale kontrolü
      if (isStale(gen)) { resolve(); return }

      const audio = new Audio(url)
      currentAudioRef.current = audio
      audio.onended = () => { currentAudioRef.current = null; resolve() }
      audio.onerror = () => { currentAudioRef.current = null; resolve() }
      audio.play().catch(() => { currentAudioRef.current = null; resolve() })
    })

  // ── Eski sesi hemen durdur ──
  const stopCurrentAudio = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause()
      currentAudioRef.current.src = ''
      currentAudioRef.current = null
    }
  }

  const pollJob = async (jobId: string): Promise<string | null> => {
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const res = await fetch(`/v1/jobs/${jobId}`, { headers: AUTH })
      if (!res.ok) continue
      const data = await res.json()
      if (data.status === 'completed' && data.result?.audio_url) return data.result.audio_url
      if (data.status === 'failed') return null
    }
    return null
  }

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(blob)
    })

  // ── Moderatör konuşması ──
  const moderatorSpeak = async (text: string, gen: number) => {
    if (isStale(gen)) return
    setActiveSpeakerId('mod')
    setStatus('⚖️ Moderatör...')
    const msg: Message = { speaker: ORCHESTRATOR.name, text, color: ORCHESTRATOR.color, isOrchestrator: true }
    setMessages((prev) => [...prev, msg])

    if (isStale(gen)) return
    const audioUrl = await ttsCall(text, ORCHESTRATOR.voice)
    if (isStale(gen)) return

    if (audioUrl) {
      setMessages((prev) => prev.map((m, idx) => idx === prev.length - 1 && m.isOrchestrator ? { ...m, audioUrl } : m))
      await playAudioAndWait(audioUrl, gen)
    }
    msgCountSinceModRef.current = 0
  }

  // ── Moderatör soru üret ──
  const generateModeratorQuestion = async (): Promise<string> => {
    const history = messagesRef.current.slice(-8).map((m) => `${m.speaker}: ${m.text}`).join('\n')
    const prompt = `Konu: ${topic}

Son konuşmalar:
${history}

Sen tartışma moderatörüsün. Tartışmayı ilerletmek için kısa, provoke edici bir soru sor veya yeni bir açı getir. SADECE 1 cümle yaz. Kimseyi ismiyle çağırma, masaya genel olarak sor.`
    return await llmCall(prompt, 'Tarafsız tartışma moderatörüsün. Kısa ve keskin sorular sorarsın. Türkçe konuşursun.', 0.7) || 'Bu konuda başka ne düşünüyorsunuz?'
  }

  // ── AI konuşma ──
  const aiSpeak = async (speakerId: string, gen: number) => {
    if (isStale(gen)) return
    const ai = SPEAKERS.find(s => s.id === speakerId)!
    const other = SPEAKERS.find(s => s.id !== speakerId && s.id !== 'user')!
    setActiveSpeakerId(speakerId)
    setStatus(`🤖 ${ai.name} düşünüyor...`)

    const history = messagesRef.current.slice(-10).map((m) => `${m.speaker}: ${m.text}`).join('\n')
    const prompt = `Konu: ${topic}

Konuşma:
${history}

Sen ${ai.name}'sın. Son söylenenlere cevap ver. ${other.name}'a veya "Sen" (kullanıcı) birine direkt karşılık verebilirsin. 1-2 cümle, sadece kendi sözlerini yaz.`

    let text = await llmCall(prompt, ai.personality)
    if (isStale(gen)) return
    if (text.startsWith(`${ai.name}:`)) text = text.slice(ai.name.length + 1).trim()
    if (!text) text = 'Hmm...'

    setStatus(`🔊 ${ai.name} konuşuyor...`)
    if (isStale(gen)) return

    const audioUrl = await ttsCall(text, ai.voice)
    if (isStale(gen)) return

    setMessages((prev) => [...prev, { speaker: ai.name, text, audioUrl: audioUrl || undefined, color: ai.color }])
    msgCountSinceModRef.current++

    if (audioUrl && !isStale(gen)) {
      await playAudioAndWait(audioUrl, gen)
    }
  }

  // ── Ana tartışma döngüsü (generation-aware) ──
  const runDebateLoop = async (gen: number) => {
    if (loopRunningRef.current) return // zaten bir loop çalışıyor
    loopRunningRef.current = true

    const aiOrder = ['ai1', 'ai2']
    let idx = 0

    try {
      while (!isStale(gen)) {
        // Moderatör zamanı
        if (msgCountSinceModRef.current >= MOD_INTERVAL) {
          if (isStale(gen)) break
          const q = await generateModeratorQuestion()
          if (isStale(gen)) break
          await moderatorSpeak(q, gen)
          if (isStale(gen)) break
        }

        if (isStale(gen)) break

        // Sıradaki AI
        await aiSpeak(aiOrder[idx % 2], gen)
        idx++

        if (isStale(gen)) break

        // Doğallık beklemesi
        await new Promise((r) => setTimeout(r, 600))
      }
    } finally {
      loopRunningRef.current = false
    }
  }

  // ── Kullanıcı söz alıyor ──
  const userInterject = async (text: string) => {
    // 1. Generation'ı artır → eski loop otomatik ölür
    const newGen = ++genRef.current

    // 2. Çalan sesi hemen durdur
    stopCurrentAudio()

    // 3. Eski loop'un bitmesini bekle
    while (loopRunningRef.current) {
      await new Promise((r) => setTimeout(r, 50))
    }

    // 4. Kullanıcı mesajını ekle
    setActiveSpeakerId('user')
    setStatus('💬 Sen konuştun')
    setMessages((prev) => [...prev, { speaker: 'Sen', text, color: SPEAKERS[0].color }])
    msgCountSinceModRef.current++

    // 5. Kısa bekleme, sonra yeni loop
    await new Promise((r) => setTimeout(r, 400))

    if (isStale(newGen)) return
    await runDebateLoop(newGen)
  }

  // ── Mikrofon ──
  const startRecording = useCallback(async () => {
    if (isRecording) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setStatus('📝 Ses tanınıyor...')
        const base64 = await blobToBase64(blob)
        try {
          const res = await fetch('/v1/voice/stt', { method: 'POST', headers: HEADERS, body: JSON.stringify({ audio_base64: base64 }) })
          if (!res.ok) throw new Error(`STT ${res.status}`)
          const data = await res.json()
          const text = data.text?.trim()
          if (text) await userInterject(text)
          else setStatus('Ses tanınamadı')
        } catch (err) {
          setStatus(`STT hatası: ${err}`)
        }
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setStatus('🎤 Kayıt...')
    } catch (err) {
      setStatus(`Mikrofon hatası: ${err}`)
    }
  }, [isRecording])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [])

  const handleSendText = () => {
    const text = textInput.trim()
    if (!text) return
    setTextInput('')
    userInterject(text)
  }

  // ── Başla ──
  const handleStart = async () => {
    setStarted(true)
    setMessages([])
    msgCountSinceModRef.current = 0
    const gen = ++genRef.current

    // Moderatör açılış
    const openingPrompt = `Konu: ${topic}\n\nTartışmayı aç. Konuyu kısaca tanıt ve masaya provoke edici bir soru sor. 2 cümle MAX. Kimseyi ismiyle çağırma.`
    const opening = await llmCall(openingPrompt, 'Tarafsız tartışma moderatörüsün. Türkçe konuşursun.', 0.7)

    if (isStale(gen)) return
    await moderatorSpeak(opening || 'Buyurun, tartışmaya başlayalım.', gen)

    if (isStale(gen)) return
    await runDebateLoop(gen)
  }

  const allParticipants = [
    ...SPEAKERS,
    { id: 'mod', name: ORCHESTRATOR.name, color: ORCHESTRATOR.color, emoji: ORCHESTRATOR.emoji },
  ]

  return (
    <div style={{ maxWidth: 700, margin: '20px auto', padding: 20, fontFamily: 'system-ui' }}>

      {!started && (
        <div style={{ textAlign: 'center', marginTop: 60 }}>
          <h1 style={{ fontSize: 28, color: '#eee', marginBottom: 10 }}>Politik Sofra</h1>
          <p style={{ color: '#8892b0', fontSize: 13, marginBottom: 30 }}>AI'lar tartışır, sen istediğin zaman söz alırsın</p>
          <p style={{ color: '#8892b0', marginBottom: 10, fontSize: 13 }}>Konu:</p>
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={3}
            style={{ width: '100%', padding: 12, borderRadius: 8, background: '#16213e', color: '#eee', border: '1px solid #333', fontSize: 14, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            {SPEAKERS.filter(s => s.id !== 'user').map(s => (
              <div key={s.id} style={{ background: '#16213e', border: `1px solid ${s.color}`, borderRadius: 10, padding: '10px 16px', minWidth: 140 }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{s.emoji}</div>
                <div style={{ color: s.color, fontWeight: 700, fontSize: 14 }}>{s.name}</div>
                <div style={{ color: '#8892b0', fontSize: 11, marginTop: 4 }}>{s.personality.split('.').slice(0, 2).join('.')}</div>
              </div>
            ))}
          </div>
          <button onClick={handleStart} style={{ marginTop: 24, padding: '12px 40px', borderRadius: 8, border: 'none', background: '#533483', color: '#fff', fontSize: 16, cursor: 'pointer' }}>
            Tartışmayı Başlat
          </button>
        </div>
      )}

      {started && (
        <>
          {/* Avatarlar */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            {allParticipants.map((s) => {
              const isActive = s.id === activeSpeakerId
              const isMod = s.id === 'mod'
              return (
                <div key={s.id} style={{ textAlign: 'center' }}>
                  <div style={{
                    width: isMod ? 52 : 68, height: isMod ? 52 : 68,
                    borderRadius: '50%',
                    background: isMod ? '#2a1545' : s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: isMod ? 22 : 26,
                    border: isActive ? `3px solid ${s.color}` : '3px solid transparent',
                    boxShadow: isActive ? `0 0 18px ${s.color}` : 'none',
                    transition: 'all 0.3s',
                    animation: isActive ? 'pulse 1s infinite' : 'none',
                  }}>
                    {s.emoji}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 11, color: isActive ? '#fff' : '#555', fontWeight: isActive ? 700 : 400 }}>
                    {s.name}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Konu + status */}
          <div style={{ textAlign: 'center', fontSize: 11, color: '#555', marginBottom: 6 }}>📜 {topic}</div>
          <div style={{ padding: '5px 14px', marginBottom: 10, background: '#16213e', borderRadius: 8, textAlign: 'center', fontSize: 12, color: '#8892b0' }}>
            {status}
          </div>

          {/* Mesajlar */}
          <div style={{ height: 360, overflowY: 'auto', background: '#0a0a1a', borderRadius: 8, padding: 14, marginBottom: 12 }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start',
                padding: msg.isOrchestrator ? '6px 8px' : undefined,
                background: msg.isOrchestrator ? '#1a1035' : undefined,
                borderRadius: msg.isOrchestrator ? 6 : undefined,
                borderLeft: msg.isOrchestrator ? `2px solid ${ORCHESTRATOR.color}` : undefined,
              }}>
                <span style={{
                  color: msg.color, fontWeight: 700,
                  fontSize: msg.isOrchestrator ? 11 : 13,
                  minWidth: 70,
                  fontStyle: msg.isOrchestrator ? 'italic' : undefined,
                }}>
                  {msg.speaker}:
                </span>
                <span style={{
                  fontSize: msg.isOrchestrator ? 12 : 13,
                  color: msg.isOrchestrator ? '#9988bb' : '#ccc',
                  flex: 1,
                  fontStyle: msg.isOrchestrator ? 'italic' : undefined,
                }}>
                  {msg.text}
                </span>
                {msg.audioUrl && (
                  <button
                    onClick={() => {
                      stopCurrentAudio()
                      const a = new Audio(msg.audioUrl!)
                      currentAudioRef.current = a
                      a.onended = () => { currentAudioRef.current = null }
                      a.play()
                    }}
                    style={{ fontSize: 10, padding: '2px 6px', background: '#222', color: '#888', border: 'none', borderRadius: 4, cursor: 'pointer', flexShrink: 0 }}
                  >
                    ▶
                  </button>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Kontroller — HER ZAMAN AKTİF */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onMouseLeave={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              style={{
                width: 50, height: 42, borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer',
                background: isRecording ? '#e94560' : '#333', color: '#fff', transition: 'background 0.2s',
              }}
            >
              🎤
            </button>
            <input
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
              placeholder="Söz al — yaz ve Enter..."
              style={{ flex: 1, padding: '0 12px', borderRadius: 8, border: '1px solid #333', background: '#16213e', color: '#eee', fontSize: 13, outline: 'none' }}
            />
            <button
              onClick={handleSendText}
              style={{ padding: '0 16px', borderRadius: 8, border: 'none', background: '#e94560', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}
            >
              Söz Al
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 10, color: '#444', marginTop: 6 }}>
            istediğin zaman yazıp tartışmaya katılabilirsin — çalan ses kesilir
          </div>
        </>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
      `}</style>
    </div>
  )
}
