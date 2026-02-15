import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import { audioQueue } from '../audio/AudioQueue'
import PixelButton from './PixelButton'

const PHASE_NARRATIONS: Record<string, string> = {
  morning: 'Köyde yeni bir gün başlıyor...',
  campfire: 'Karakterler ateş başında tartışıyor',
  vote: 'Oylama başladı — kim sürgün edilecek?',
  night: 'Gece çöktü, herkes evine çekildi...',
  exile: 'Sürgün kararı verildi...',
  game_over: 'Oyun bitti!',
}

const PHASE_ICONS: Record<string, string> = {
  morning: '\u2600',
  campfire: '\uD83D\uDD25',
  vote: '\uD83D\uDDF3',
  night: '\uD83C\uDF19',
  exile: '\u2694',
  game_over: '\uD83C\uDFC6',
}

const PHASE_LABELS: Record<string, string> = {
  morning: 'Sabah',
  campfire: 'Ateş Başı',
  vote: 'Oylama',
  night: 'Gece',
  exile: 'Sürgün',
  game_over: 'Oyun Bitti',
}

export const ActionBar: React.FC = () => {
  const inputRequired = useGameStore((s) => s.inputRequired)
  const phase = useGameStore((s) => s.phase)
  const players = useGameStore((s) => s.players)
  const myName = useGameStore((s) => s.myName)
  const playerId = useGameStore((s) => s.playerId)
  const playerLocations = useGameStore((s) => s.playerLocations)
  const currentSpeaker = useGameStore((s) => s.currentSpeaker)

  const isSpectator = playerId === 'spectator' || myName === 'Seyirci'

  const myLocation = myName ? playerLocations[myName] : undefined
  const isInVisit = myLocation?.startsWith('visiting:') || inputRequired?.type === 'visit_speak'

  const [text, setText] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  useEffect(() => {
    if (
      inputRequired?.type === 'speak' ||
      inputRequired?.type === 'visit_speak'
    ) {
      inputRef.current?.focus()
    }
  }, [inputRequired])

  useEffect(() => {
    setSelectedTarget(null)
  }, [inputRequired?.type])

  // ── Microphone handlers ──

  const startRecording = useCallback(async () => {
    try {
      audioQueue.stop()

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      })

      // Web Audio API: high-pass filter ile düşük frekanslı gürültüyü kes
      const audioCtx = new AudioContext({ sampleRate: 16000 })
      const source = audioCtx.createMediaStreamSource(stream)
      const highpass = audioCtx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 100 // 100Hz altını kes (fan, klima, uğultu)
      const dest = audioCtx.createMediaStreamDestination()
      source.connect(highpass)
      highpass.connect(dest)

      const mediaRecorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())
        audioCtx.close()

        const reader = new FileReader()
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1]
          const speechType = isInVisit ? 'visit_speak' : 'speak'
          wsManager.send('speak_audio', { audio: base64, speech_type: speechType })
        }
        reader.readAsDataURL(blob)
        setIsRecording(false)
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (err) {
      console.error('Microphone access denied:', err)
      setIsRecording(false)
    }
  }, [isInVisit])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── Send handlers ──

  const handleSendSpeech = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return

    audioQueue.stop()

    const currentName = useGameStore.getState().myName
    if (currentName) {
      useGameStore.getState().addSpeech({
        speaker: currentName,
        content: trimmed,
        pending: true,
      })
    }

    wsManager.send('speak', { content: trimmed })
    setText('')
  }, [text])

  const handleSendVisitSpeech = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return

    audioQueue.stop()

    const state = useGameStore.getState()
    const currentName = state.myName
    if (currentName) {
      const myVisit = state.houseVisits.find(
        (v) => v.host === currentName || v.visitor === currentName
      )
      if (myVisit) {
        state.addVisitSpeech(myVisit.visit_id, {
          speaker: currentName,
          content: trimmed,
          pending: true,
        })
      }
    }

    wsManager.send('visit_speak', { content: trimmed })
    setText('')
  }, [text])

  const handleVote = useCallback(() => {
    if (!selectedTarget) return
    wsManager.send('vote', { target: selectedTarget })
    setSelectedTarget(null)
  }, [selectedTarget])

  const handleLocationChoice = useCallback((choice: string) => {
    wsManager.send('location_choice', { choice })
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return
      if (isInVisit) {
        handleSendVisitSpeech()
      } else {
        handleSendSpeech()
      }
    },
    [isInVisit, handleSendSpeech, handleSendVisitSpeech],
  )

  // ── Determine what to show ──

  const isCampfire = phase === 'campfire'
  const isVote = phase === 'vote' || inputRequired?.type === 'vote'
  const isLocationChoice = inputRequired?.type === 'location_choice'
  const isMyTurn = inputRequired?.type === 'speak' || inputRequired?.type === 'visit_speak'

  const showTextInput = isCampfire

  // ── Spectator: rich narration bar ──
  if (isSpectator) {
    const phaseIcon = PHASE_ICONS[phase] ?? ''
    const phaseLabel = PHASE_LABELS[phase] ?? 'Izleniyor'
    const narration = currentSpeaker
      ? `${currentSpeaker} konuşuyor...`
      : PHASE_NARRATIONS[phase] ?? 'İzleniyor...'

    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center px-5 py-2.5"
        style={{
          background: 'linear-gradient(to top, rgba(18,14,6,0.98), rgba(18,14,6,0.85))',
          borderTop: '1px solid rgba(139,94,60,0.3)',
          backdropFilter: 'blur(8px)',
        }}
      >
        {/* Left: Phase icon + label */}
        <div className="flex items-center gap-2 min-w-[120px]">
          <span className="text-base">{phaseIcon}</span>
          <span className="text-text-gold text-[10px] font-pixel font-bold tracking-wider">
            {phaseLabel}
          </span>
        </div>

        {/* Center: Narration text */}
        <div className="flex-1 flex items-center justify-center gap-2">
          {currentSpeaker && (
            <div
              className="w-2 h-2 rounded-full animate-pulse"
              style={{
                backgroundColor: players.find(p => p.name === currentSpeaker)?.color ?? '#DAA520',
                boxShadow: `0 0 8px ${players.find(p => p.name === currentSpeaker)?.color ?? '#DAA520'}60`,
              }}
            />
          )}
          <span className="text-text-light/80 text-[9px] font-pixel tracking-wide">
            {narration}
          </span>
        </div>

        {/* Right: Audio wave animation */}
        <div className="flex items-center gap-0.5 min-w-[60px] justify-end">
          {currentSpeaker ? (
            <>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="w-[2px] rounded-full"
                  style={{
                    backgroundColor: '#DAA520',
                    animation: `audioWave 0.8s ease-in-out ${i * 0.1}s infinite alternate`,
                    height: `${6 + Math.random() * 8}px`,
                  }}
                />
              ))}
              <style>{`
                @keyframes audioWave {
                  0% { height: 4px; opacity: 0.4; }
                  100% { height: 14px; opacity: 1; }
                }
              `}</style>
            </>
          ) : (
            <span className="text-stone/30 text-[8px] font-pixel">SEYIRCI</span>
          )}
        </div>
      </div>
    )
  }

  // Vote
  if (isVote) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-[#120e06] to-[#120e06]/95 backdrop-blur-sm"
           style={{ borderTop: '2px solid rgba(220,20,60,0.4)' }}>
        <div className="flex flex-col items-center gap-2.5 max-w-lg w-full">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-fire-red animate-pulse" />
            <span className="text-fire-orange text-[10px] font-pixel tracking-wider">
              OYLAMA ZAMANI
            </span>
            <div className="w-1.5 h-1.5 rounded-full bg-fire-red animate-pulse" />
          </div>
          {selectedTarget ? (
            <div className="flex items-center gap-3">
              <span className="text-text-light text-[9px] font-pixel">
                Oy: <span className="text-text-gold font-bold">{selectedTarget}</span>
              </span>
              <PixelButton label="Onayla" onClick={handleVote} variant="fire" />
            </div>
          ) : (
            <span className="text-stone text-[9px] opacity-60 font-pixel">
              Surgun icin bir oyuncu sec
            </span>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {players
              .filter((p) => p.alive && p.name !== myName)
              .map((p) => (
                <button
                  key={p.slot_id}
                  onClick={() => setSelectedTarget(p.name)}
                  className={`px-3 py-1.5 text-[9px] font-pixel transition-all duration-150 ${
                    selectedTarget === p.name
                      ? 'text-text-gold scale-105'
                      : 'text-text-light/70 hover:text-text-light hover:scale-105'
                  }`}
                  style={{
                    border: selectedTarget === p.name
                      ? '2px solid rgba(218,165,32,0.6)'
                      : '1px solid rgba(107,107,107,0.3)',
                    backgroundColor: selectedTarget === p.name
                      ? 'rgba(218,165,32,0.1)'
                      : 'rgba(42,42,42,0.5)',
                    borderRadius: '4px',
                  }}
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      </div>
    )
  }

  // Location choice
  if (isLocationChoice) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-[#120e06] to-[#120e06]/95 backdrop-blur-sm"
           style={{ borderTop: '2px solid rgba(218,165,32,0.3)' }}>
        <div className="flex flex-col items-center gap-2.5">
          <span className="text-text-gold text-[10px] font-pixel tracking-wider">
            NEREYE GIDECEKSIN?
          </span>
          <div className="flex flex-wrap gap-2 justify-center">
            <PixelButton
              label="Ates Basi"
              onClick={() => handleLocationChoice('CAMPFIRE')}
              variant="fire"
              size="sm"
            />
            <PixelButton
              label="Evime Don"
              onClick={() => handleLocationChoice('HOME')}
              variant="stone"
              size="sm"
            />
            {((inputRequired?.data?.alive_players as string[]) ?? [])
              .filter((name) => name !== myName)
              .map((name) => (
                <PixelButton
                  key={name}
                  label={`Ziyaret: ${name}`}
                  onClick={() => handleLocationChoice(`VISIT|${name}`)}
                  variant="wood"
                  size="sm"
                />
              ))}
          </div>
        </div>
      </div>
    )
  }

  // Text input (campfire + house visits)
  if (showTextInput) {
    const placeholder = isInVisit ? 'Konus...' : 'Soz al — istedigin an yaz...'
    const sendHandler = isInVisit ? handleSendVisitSpeech : handleSendSpeech
    const buttonLabel = isInVisit ? 'Konus' : 'Gonder'

    return (
      <div
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-t from-[#120e06] to-[#120e06]/90 backdrop-blur-sm transition-all duration-300"
        style={{
          borderTop: isMyTurn
            ? '2px solid rgba(218,165,32,0.5)'
            : '1px solid rgba(139,94,60,0.3)',
        }}
      >
        <div className="flex items-center gap-2.5 w-full max-w-xl">
          {isMyTurn && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded animate-pulse"
                 style={{ backgroundColor: 'rgba(218,165,32,0.1)', border: '1px solid rgba(218,165,32,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-text-gold" />
              <span className="text-text-gold text-[8px] font-pixel whitespace-nowrap">
                Siran!
              </span>
            </div>
          )}
          {/* Mic button */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`px-3 py-2.5 font-pixel text-[10px] transition-all duration-150 rounded ${
              isRecording
                ? 'bg-red-900/60 text-red-300 animate-pulse shadow-[0_0_12px_rgba(220,20,60,0.3)]'
                : 'bg-[#1a1208] text-stone hover:text-text-light hover:bg-[#2a1f10]'
            }`}
            style={{
              border: isRecording
                ? '1px solid rgba(220,20,60,0.5)'
                : '1px solid rgba(139,94,60,0.3)',
            }}
            title="Basili tut ve konus"
          >
            {isRecording ? '...' : '\uD83C\uDF99'}
          </button>
          {/* Text input */}
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMyTurn ? 'Sira sende! Yaz ve Enter...' : placeholder}
            className="flex-1 px-3 py-2.5 text-text-light font-pixel text-[10px] outline-none placeholder:text-stone/50 bg-[#0f0b05] rounded transition-all duration-200"
            style={{
              border: isMyTurn
                ? '1px solid rgba(218,165,32,0.4)'
                : '1px solid rgba(139,94,60,0.25)',
            }}
          />
          {/* Send button */}
          <button
            onClick={sendHandler}
            disabled={!text.trim()}
            className={`px-4 py-2.5 font-pixel text-[9px] font-bold tracking-wider rounded transition-all duration-150 ${
              text.trim()
                ? 'text-text-gold hover:scale-105 active:scale-95'
                : 'text-stone/30 cursor-not-allowed'
            }`}
            style={{
              border: text.trim()
                ? '1px solid rgba(218,165,32,0.4)'
                : '1px solid rgba(107,107,107,0.15)',
              backgroundColor: text.trim()
                ? 'rgba(218,165,32,0.1)'
                : 'transparent',
            }}
          >
            {buttonLabel}
          </button>
        </div>
      </div>
    )
  }

  // Default: waiting
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-3 bg-[#120e06]/90 backdrop-blur-sm"
         style={{ borderTop: '1px solid rgba(139,94,60,0.2)' }}>
      <div className="flex items-center gap-2">
        <div className="flex gap-1">
          <div className="w-1 h-1 rounded-full bg-stone/40 animate-pulse" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-1 rounded-full bg-stone/40 animate-pulse" style={{ animationDelay: '300ms' }} />
          <div className="w-1 h-1 rounded-full bg-stone/40 animate-pulse" style={{ animationDelay: '600ms' }} />
        </div>
        <span className="text-stone/50 text-[9px] font-pixel">
          Bekleniyor
        </span>
      </div>
    </div>
  )
}

export default ActionBar
