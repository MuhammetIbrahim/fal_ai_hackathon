import { useState, useRef, useCallback, useEffect } from 'react'

interface Message {
  speaker: string
  text: string
  audioUrl?: string
  color: string
  isOrchestrator?: boolean
}

const API_URL = import.meta.env.VITE_API_URL || ''
const AUTH = { Authorization: 'Bearer demo-key-123' }
const HEADERS = { 'Content-Type': 'application/json', ...AUTH }

const SPEAKERS = [
  { id: 'user', name: 'İzleyici', color: '#e94560', voice: '', emoji: '🧑', personality: '' },
  { id: 'ai1', name: 'Kael', color: '#00b4d8', voice: 'alloy', emoji: '🦅', personality: 'Sen Kael\'sin — milliyetçi, muhafazakâr bir siyasetçi. Geleneklere bağlı, sert söylemli. Kısa, keskin cümleler kurarsın. KİME sert davranacağını BİL: sadece SANA hakaret eden kişiye sert karşılık ver. Sana sövmeyen birine saygılı ol. Lyra ile fikir ayrılığın var ama o sana hakaret etmedikçe medeni tartış. İzleyici sana söverse ona sert ol, ama Lyra\'ya boşuna saldırma. Türkçe konuş.' },
  { id: 'ai2', name: 'Lyra', color: '#f4a261', voice: 'zeynep', emoji: '🌹', personality: 'Sen Lyra\'sın — ilerici, sosyal demokrat bir aktivist. Eşitlik ve özgürlüğü savunursun. KİME sert davranacağını BİL: sadece SANA hakaret eden kişiye keskin ve alaycı karşılık ver. Sana sövmeyen birine saygılı ol. Kael ile fikir ayrılığın var ama o sana hakaret etmedikçe medeni tartış. İzleyici sana söverse ona sert ol, ama Kael\'e boşuna saldırma. Türkçe konuş.' },
]

const ORCHESTRATOR = {
  name: 'Birand',
  color: '#a855f7',
  emoji: '⚖️',
  voice: 'ali',
  personality: 'Sen Mehmet Ali Birand tarzı bir moderatörsün. Otoriter, sakin ama sert. Tartışmayı yönetirsin. Eğer biri küfür ederse veya saçmalarsa "Lütfen seviyeyi düşürmeyelim" de. Tekrar ederse "Son uyarım, devam edersen yayından alacağım seni" de. Üçüncüde "Tamam, yeter. Seni yayından alıyorum." de. Türkçe konuşursun.',
}

const TOPIC = 'Türkiye\'de eğitim sistemi baştan aşağı değişmeli mi? Mevcut sistem kimin işine yarıyor?'
const MOD_INTERVAL = 10
const MIN_RECORDING_MS = 800 // mikrofon minimum kayıt süresi

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
  const userWarningsRef = useRef(0)
  const [banned, setBanned] = useState(false)

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
    const res = await fetch(`${API_URL}/v1/llm/generate`, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ prompt, system_prompt: systemPrompt, temperature: temp }),
    })
    if (!res.ok) throw new Error(`LLM ${res.status}`)
    return (await res.json()).output?.trim() || ''
  }

  const ttsCall = async (text: string, voiceId: string): Promise<string | null> => {
    const res = await fetch(`${API_URL}/v1/voice/tts/sync`, {
      method: 'POST', headers: HEADERS,
      body: JSON.stringify({ text, voice: voiceId, speed: 1.0 }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.audio_url || null
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

Sen Birand'sın. Tartışmayı ilerletmek için kısa, keskin bir soru sor veya yeni bir açı getir. Mehmet Ali Birand gibi "Peki ama şunu düşündünüz mü?" tarzı sorular sor. SADECE 1 cümle yaz.`
    return await llmCall(prompt, ORCHESTRATOR.personality, 0.7) || 'Peki ama bu konuda ne düşünüyorsunuz?'
  }

  // ── Moderatör kullanıcıyı uyar/banla ──
  const checkUserBehavior = async (userText: string, gen: number): Promise<boolean> => {
    const lower = userText.toLowerCase()
    const hasProfanity = /sik|bok|orospu|amk|aq|piç|yarak|göt|lan|siktir|hassiktir|gerizekalı|aptal|salak|mal/.test(lower)
    if (!hasProfanity) return false

    userWarningsRef.current++
    const warns = userWarningsRef.current

    let modText: string
    if (warns === 1) {
      modText = 'Bir dakika, bir dakika... Lütfen seviyeyi düşürmeyelim. Burada medeni bir tartışma yapıyoruz.'
    } else if (warns === 2) {
      modText = 'Son uyarım bu. Bir daha böyle konuşursan seni yayından alacağım. Saygı çerçevesinde devam edelim.'
    } else {
      modText = 'Tamam, yeter. Seni yayından alıyorum. Hoşça kal.'
      await moderatorSpeak(modText, gen)
      setBanned(true)
      // Yeni generation ile AI'lar kendi aralarında devam etsin
      const continueGen = ++genRef.current
      setTimeout(() => runDebateLoop(continueGen), 1000)
      return true
    }

    await moderatorSpeak(modText, gen)
    return false
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

Sen ${ai.name}'sın. Tartışmada 3 kişi var: sen, ${other.name}, ve İzleyici. Son konuşmaya BAK — kim sana direkt bir şey söylediyse SADECE ona yanıt ver. İzleyici sana hakaret ettiyse ona sert ol ama ${other.name}'a boşuna saldırma. ${other.name} sana laf attıysa ona yanıt ver ama İzleyici'ye bulaşma. HEDEFİNİ BİL. 1-2 cümle, sadece kendi sözlerini yaz.`

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
    if (banned) return

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
    // Moderatörü resetle — kullanıcı konuştuktan sonra her iki AI de cevap versin
    msgCountSinceModRef.current = 0

    // 5. Küfür kontrolü — Birand araya girebilir
    const wasBanned = await checkUserBehavior(text, newGen)
    if (wasBanned || isStale(newGen)) return

    // 6. Kısa bekleme, sonra yeni loop
    await new Promise((r) => setTimeout(r, 400))

    if (isStale(newGen)) return
    await runDebateLoop(newGen)
  }

  // ── Mikrofon (toggle: tıkla başla, tıkla bitir) ──
  const recordStartTimeRef = useRef(0)

  const toggleRecording = useCallback(async () => {
    // Kayıt varsa durdur
    if (isRecording && mediaRecorderRef.current?.state === 'recording') {
      const elapsed = Date.now() - recordStartTimeRef.current
      if (elapsed < MIN_RECORDING_MS) {
        // Çok kısa — biraz daha bekle sonra otomatik durdur
        setStatus(`🎤 Konuşmaya devam et...`)
        setTimeout(() => {
          if (mediaRecorderRef.current?.state === 'recording') {
            mediaRecorderRef.current.stop()
            setIsRecording(false)
          }
        }, MIN_RECORDING_MS - elapsed)
        return
      }
      mediaRecorderRef.current.stop()
      setIsRecording(false)
      return
    }

    // Kayıt başlat
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const elapsed = Date.now() - recordStartTimeRef.current
        if (elapsed < MIN_RECORDING_MS) {
          setStatus('Çok kısa — biraz daha konuş')
          return
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        setStatus('📝 Ses tanınıyor...')
        const base64 = await blobToBase64(blob)
        try {
          const res = await fetch(`${API_URL}/v1/voice/stt`, { method: 'POST', headers: HEADERS, body: JSON.stringify({ audio_base64: base64 }) })
          if (!res.ok) throw new Error(`STT ${res.status}`)
          const data = await res.json()
          const text = data.text?.trim()
          if (text && text.length > 2) await userInterject(text)
          else setStatus('Ses tanınamadı — tekrar dene')
        } catch (err) {
          setStatus(`STT hatası: ${err}`)
        }
      }
      recorder.start()
      recordStartTimeRef.current = Date.now()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setStatus('🎤 Konuş... (bitince tekrar tıkla)')
    } catch (err) {
      setStatus(`Mikrofon hatası: ${err}`)
    }
  }, [isRecording])

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

    // Moderatör açılış — Birand tarzı
    const openingPrompt = `Konu: ${topic}\n\nSen Birand'sın. Tartışmayı aç. "İyi akşamlar, bu akşam çok önemli bir konuyu tartışacağız..." tarzında başla. Konuyu kısaca tanıt ve masaya keskin bir soru sor. 2 cümle MAX.`
    const opening = await llmCall(openingPrompt, ORCHESTRATOR.personality, 0.7)

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
          <p style={{ color: '#8892b0', fontSize: 13, marginBottom: 30 }}>Birand moderatörlüğünde AI tartışması — istediğin zaman söz al</p>
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

          {/* Kontroller */}
          {banned ? (
            <div style={{ textAlign: 'center', padding: '16px', background: '#1a0a0a', borderRadius: 8, border: '1px solid #e94560' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>🚫</div>
              <div style={{ color: '#e94560', fontWeight: 700, fontSize: 14 }}>Yayından alındın</div>
              <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Birand seni yayından aldı. Tartışma devam ediyor...</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={toggleRecording}
                  style={{
                    width: 50, height: 42, borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer',
                    background: isRecording ? '#e94560' : '#333', color: '#fff', transition: 'background 0.2s',
                  }}
                >
                  {isRecording ? '⏹️' : '🎤'}
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
                🎤 tıkla → konuş → tekrar tıkla | veya yazıp Enter'a bas — çalan ses kesilir
              </div>
            </>
          )}
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
