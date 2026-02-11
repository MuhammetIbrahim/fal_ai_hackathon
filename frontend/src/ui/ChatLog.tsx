import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../state/GameStore'

// A simple set of fallback colors for speakers who don't have a color assigned
const FALLBACK_COLORS = [
  '#DAA520', '#DC143C', '#4A7023', '#2E5090', '#FF8C00',
  '#8B5E3C', '#6B6B6B', '#5A6672', '#C2B280', '#8B0000',
]

export const ChatLog: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const players = useGameStore((s) => s.players)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new speeches
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  const getPlayerColor = (speakerName: string): string => {
    const player = players.find((p) => p.name === speakerName)
    if (player?.speech_color) return player.speech_color
    if (player?.color) return player.color
    // Deterministic fallback based on name hash
    let hash = 0
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }

  return (
    <div className="fixed right-0 top-12 bottom-16 w-[300px] z-30 border-l-4 border-wood bg-bg-dark/90 shadow-lg shadow-black/50 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b-2 border-wood/50">
        <span className="text-text-gold text-[10px] font-pixel">
          Ates Basi Konusmalari
        </span>
      </div>

      {/* Scrollable speech list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin"
      >
        {speeches.length === 0 && (
          <p className="text-stone text-[8px] text-center mt-4 opacity-60">
            Henuz kimse konusmadi...
          </p>
        )}

        {speeches.map((speech, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            <span
              className="text-[9px] font-pixel font-bold"
              style={{ color: getPlayerColor(speech.speaker) }}
            >
              {speech.speaker}
            </span>
            <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2 border-l-2 border-wood/30">
              {speech.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default ChatLog
