import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../state/GameStore'

const FALLBACK_COLORS = [
  '#DAA520', '#DC143C', '#4A7023', '#2E5090', '#FF8C00',
  '#8B5E3C', '#6B6B6B', '#5A6672', '#C2B280', '#8B0000',
]

export const ChatLog: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const players = useGameStore((s) => s.players)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  const getPlayerColor = (speakerName: string): string => {
    const player = players.find((p) => p.name === speakerName)
    if (player?.speech_color) return player.speech_color
    if (player?.color) return player.color
    let hash = 0
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }

  return (
    <div
      className="fixed right-0 top-12 bottom-16 w-[300px] z-30 flex flex-col"
      style={{
        backgroundColor: 'rgba(18,14,6,0.95)',
        borderLeft: '1px solid rgba(139,94,60,0.3)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,94,60,0.2)' }}
      >
        <span className="text-text-gold text-[10px] font-pixel tracking-wider">
          Ates Basi Konusmalari
        </span>
      </div>

      {/* Scrollable speech list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2.5 scrollbar-thin min-h-0"
      >
        {speeches.length === 0 && (
          <div className="flex flex-col items-center mt-6 gap-2">
            <span className="text-stone/30 text-sm">...</span>
            <p className="text-stone/40 text-[8px] font-pixel text-center">
              Henuz kimse konusmadi...
            </p>
          </div>
        )}

        {speeches.map((speech, idx) => {
          const color = getPlayerColor(speech.speaker)

          return (
            <div key={idx} className="flex flex-col gap-0.5">
              <span
                className="text-[9px] font-pixel font-bold"
                style={{ color }}
              >
                {speech.speaker}
              </span>
              <p
                className="text-text-light/85 text-[9px] font-pixel leading-relaxed pl-2"
                style={{ borderLeft: `2px solid ${color}25` }}
              >
                {speech.content}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default ChatLog
