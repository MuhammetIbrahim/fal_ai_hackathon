import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import PixelButton from './PixelButton'

export const ActionBar: React.FC = () => {
  const inputRequired = useGameStore((s) => s.inputRequired)
  const phase = useGameStore((s) => s.phase)
  const players = useGameStore((s) => s.players)
  const myName = useGameStore((s) => s.myName)
  const playerId = useGameStore((s) => s.playerId)
  const playerLocations = useGameStore((s) => s.playerLocations)

  // Spectator mode: no interaction allowed
  const isSpectator = playerId === 'spectator' || myName === 'Seyirci'

  // Detect if human is currently in a house visit (location = "visiting:X")
  const myLocation = myName ? playerLocations[myName] : undefined
  const isInVisit = myLocation?.startsWith('visiting:') || inputRequired?.type === 'visit_speak'

  const [text, setText] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const [sentWaiting, setSentWaiting] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  // Focus input when it's the player's turn
  useEffect(() => {
    if (
      inputRequired?.type === 'speak' ||
      inputRequired?.type === 'visit_speak'
    ) {
      inputRef.current?.focus()
      setSentWaiting(false)
    }
  }, [inputRequired])

  // Reset vote target when input type changes
  useEffect(() => {
    setSelectedTarget(null)
  }, [inputRequired?.type])

  // ── Microphone handlers ──

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        stream.getTracks().forEach((t) => t.stop())

        // Convert to base64 and send
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
    wsManager.send('speak', { content: trimmed })
    setText('')
    // If we sent before our turn, show a "sent" indicator
    if (!inputRequired || inputRequired.type !== 'speak') {
      setSentWaiting(true)
    }
  }, [text, inputRequired])

  const handleSendVisitSpeech = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    wsManager.send('visit_speak', { content: trimmed })
    setText('')
    if (!inputRequired || inputRequired.type !== 'visit_speak') {
      setSentWaiting(true)
    }
  }, [text, inputRequired])

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

  // Show text input during campfire phase (covers both campfire chat and house visits)
  const showTextInput = isCampfire

  // Spectator: show a passive status bar, no interaction
  if (isSpectator) {
    const phaseLabel =
      isCampfire ? 'Ates Basi' :
      isVote ? 'Oylama' :
      phase === 'morning' ? 'Sabah' :
      phase === 'night' ? 'Gece' :
      phase === 'exile' ? 'Surgun' :
      'Izleniyor'

    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-2 border-t-4 border-stone bg-bg-dark/90 shadow-lg shadow-black/50">
        <span className="text-stone text-[9px] font-pixel">
          Seyirci Modu — {phaseLabel}
        </span>
      </div>
    )
  }

  // Vote and location choice override text input
  if (isVote) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 border-t-4 border-fire-red bg-bg-dark/95 shadow-lg shadow-black/50">
        <div className="flex flex-col items-center gap-2">
          <span className="text-fire-orange text-[10px] font-pixel animate-pulse">
            Oylama Zamani!
          </span>
          {selectedTarget ? (
            <div className="flex items-center gap-3">
              <span className="text-text-light text-[10px]">
                Oy: <span className="text-text-gold font-bold">{selectedTarget}</span>
              </span>
              <PixelButton
                label="Onayla"
                onClick={handleVote}
                variant="fire"
              />
            </div>
          ) : (
            <span className="text-text-light text-[10px] opacity-70">
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
                  className={`px-3 py-1.5 text-[9px] font-pixel border-2 transition-all ${
                    selectedTarget === p.name
                      ? 'border-text-gold bg-[#3a2a10] text-text-gold scale-110'
                      : 'border-stone bg-[#2a2a2a] text-text-light hover:border-wood hover:scale-105'
                  }`}
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      </div>
    )
  }

  if (isLocationChoice) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 border-t-4 border-text-gold bg-bg-dark/95 shadow-lg shadow-black/50">
        <div className="flex flex-col items-center gap-2">
          <span className="text-text-gold text-[10px] font-pixel animate-pulse">
            Nereye gideceksin?
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

  if (showTextInput) {
    const placeholder = isInVisit ? 'Konus...' : 'Soz al...'
    const sendHandler = isInVisit ? handleSendVisitSpeech : handleSendSpeech
    const buttonLabel = isInVisit ? 'Konus' : 'Soz Al'

    return (
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 border-t-4 shadow-lg shadow-black/50 transition-all ${
          isMyTurn
            ? 'border-text-gold bg-[#2a1f10]/95 animate-pulse'
            : 'border-wood bg-bg-dark/90'
        }`}
      >
        <div className="flex items-center gap-2 w-full max-w-xl">
          {isMyTurn && (
            <span className="text-text-gold text-[9px] font-pixel whitespace-nowrap animate-pulse">
              Sira sende!
            </span>
          )}
          {sentWaiting && !isMyTurn && (
            <span className="text-stone text-[8px] font-pixel whitespace-nowrap">
              Gonderildi
            </span>
          )}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={stopRecording}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            className={`px-3 py-2 border-2 font-pixel text-[10px] transition-all ${
              isRecording
                ? 'bg-red-900 border-red-500 text-red-300 animate-pulse'
                : 'bg-[#2a1f10] border-wood text-stone hover:border-text-gold hover:text-text-light'
            }`}
            title="Basilı tut ve konus"
          >
            {isRecording ? '...' : '🎤'}
          </button>
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMyTurn ? 'Sira sende! Yaz ve Enter...' : placeholder}
            className={`flex-1 px-3 py-2 border-2 text-text-light font-pixel text-[10px] outline-none placeholder:text-stone ${
              isMyTurn
                ? 'bg-[#3a2a10] border-text-gold'
                : 'bg-[#2a1f10] border-wood focus:border-text-gold'
            }`}
          />
          <PixelButton
            label={buttonLabel}
            onClick={sendHandler}
            variant={isMyTurn ? 'fire' : 'stone'}
            disabled={!text.trim()}
          />
        </div>
      </div>
    )
  }

  // Default: waiting state (morning, night, exile, etc.)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-3 border-t-4 border-wood bg-bg-dark/90 shadow-lg shadow-black/50">
      <span className="text-text-light text-[10px] opacity-60">
        Bekleniyor...
      </span>
    </div>
  )
}

export default ActionBar
