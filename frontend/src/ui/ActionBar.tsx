import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import { BUILDING_POSITIONS } from '../utils/constants'
import PixelButton from './PixelButton'

export const ActionBar: React.FC = () => {
  const inputRequired = useGameStore((s) => s.inputRequired)
  const [text, setText] = useState('')
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const players = useGameStore((s) => s.players)

  // Focus input when speak/visit_speak is active
  useEffect(() => {
    if (
      inputRequired?.type === 'speak' ||
      inputRequired?.type === 'visit_speak'
    ) {
      inputRef.current?.focus()
    }
  }, [inputRequired])

  // Reset selected target when input changes
  useEffect(() => {
    setSelectedTarget(null)
    setText('')
  }, [inputRequired])

  const handleSendSpeech = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    wsManager.send('speak', { content: trimmed })
    setText('')
  }, [text])

  const handleSendVisitSpeech = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    wsManager.send('visit_speak', { content: trimmed })
    setText('')
  }, [text])

  const handleVote = useCallback(() => {
    if (!selectedTarget) return
    wsManager.send('vote', { target: selectedTarget })
    setSelectedTarget(null)
  }, [selectedTarget])

  const handleLocationChoice = useCallback((buildingId: string) => {
    wsManager.send('location_choice', { choice: buildingId })
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (inputRequired?.type === 'speak') handleSendSpeech()
        if (inputRequired?.type === 'visit_speak') handleSendVisitSpeech()
      }
    },
    [inputRequired, handleSendSpeech, handleSendVisitSpeech],
  )

  if (!inputRequired) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center px-4 py-3 border-t-4 border-wood bg-bg-dark/90 shadow-lg shadow-black/50">
        <span className="text-text-light text-[10px] opacity-60">
          Bekleniyor...
        </span>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-3 px-4 py-3 border-t-4 border-wood bg-bg-dark/90 shadow-lg shadow-black/50">
      {/* Speak input */}
      {inputRequired.type === 'speak' && (
        <div className="flex items-center gap-2 w-full max-w-xl">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Soz al..."
            className="flex-1 px-3 py-2 bg-[#2a1f10] border-2 border-wood text-text-light font-pixel text-[10px] outline-none focus:border-text-gold placeholder:text-stone"
          />
          <PixelButton
            label="Soz Al"
            onClick={handleSendSpeech}
            variant="fire"
            disabled={!text.trim()}
          />
        </div>
      )}

      {/* Visit speak input */}
      {inputRequired.type === 'visit_speak' && (
        <div className="flex items-center gap-2 w-full max-w-xl">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Konus..."
            className="flex-1 px-3 py-2 bg-[#2a1f10] border-2 border-wood text-text-light font-pixel text-[10px] outline-none focus:border-text-gold placeholder:text-stone"
          />
          <PixelButton
            label="Konus"
            onClick={handleSendVisitSpeech}
            variant="wood"
            disabled={!text.trim()}
          />
        </div>
      )}

      {/* Vote selection */}
      {inputRequired.type === 'vote' && (
        <div className="flex flex-col items-center gap-2">
          {selectedTarget ? (
            <div className="flex items-center gap-3">
              <span className="text-text-light text-[10px]">
                Oy Ver: <span className="text-text-gold">{selectedTarget}</span>
              </span>
              <PixelButton
                label="Onayla"
                onClick={handleVote}
                variant="fire"
              />
            </div>
          ) : (
            <span className="text-text-light text-[10px] opacity-70">
              Oy vermek icin bir oyuncu sec
            </span>
          )}
          <div className="flex flex-wrap gap-2 justify-center">
            {players
              .filter((p) => p.alive)
              .map((p) => (
                <button
                  key={p.slot_id}
                  onClick={() => setSelectedTarget(p.name)}
                  className={`px-2 py-1 text-[8px] font-pixel border-2 transition-all ${
                    selectedTarget === p.name
                      ? 'border-text-gold bg-[#3a2a10] text-text-gold'
                      : 'border-stone bg-[#2a2a2a] text-text-light hover:border-wood'
                  }`}
                >
                  {p.name}
                </button>
              ))}
          </div>
        </div>
      )}

      {/* Location choice */}
      {inputRequired.type === 'location_choice' && (
        <div className="flex flex-wrap gap-2 justify-center">
          {Object.entries(BUILDING_POSITIONS).map(([id, info]) => (
            <PixelButton
              key={id}
              label={info.label}
              onClick={() => handleLocationChoice(id)}
              variant="stone"
              size="sm"
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default ActionBar
