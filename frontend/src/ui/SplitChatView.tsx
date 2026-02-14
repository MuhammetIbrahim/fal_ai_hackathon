import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../state/GameStore'
import type { Speech, HouseVisit } from '../state/types'

const FALLBACK_COLORS = [
  '#DAA520', '#DC143C', '#4A7023', '#2E5090', '#FF8C00',
  '#8B5E3C', '#6B6B6B', '#5A6672', '#C2B280', '#8B0000',
]

function usePlayerColor() {
  const players = useGameStore((s) => s.players)

  return (speakerName: string): string => {
    const player = players.find((p) => p.name === speakerName)
    if (player?.speech_color) return player.speech_color
    if (player?.color) return player.color
    let hash = 0
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }
}

const ChatPanel: React.FC<{
  title: string
  titleColor: string
  speeches: Speech[]
  icon?: string
}> = ({ title, titleColor, speeches, icon }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const getColor = usePlayerColor()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  return (
    <div
      className="flex flex-col min-h-0 flex-1 rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'rgba(18,14,6,0.95)',
        border: '1px solid rgba(139,94,60,0.25)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(139,94,60,0.2)' }}
      >
        <span className="text-[9px] font-pixel tracking-wider" style={{ color: titleColor }}>
          {icon && <span className="mr-1.5">{icon}</span>}
          {title}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2.5 py-2 space-y-2 scrollbar-thin min-h-0"
      >
        {speeches.length === 0 && (
          <p className="text-stone/40 text-[7px] text-center mt-3 font-pixel">
            Bekleniyor...
          </p>
        )}

        {speeches.map((speech, idx) => {
          const color = getColor(speech.speaker)

          return (
            <div key={idx} className="flex flex-col gap-0.5">
              <span
                className="text-[8px] font-pixel font-bold"
                style={{ color }}
              >
                {speech.speaker}
              </span>
              <p
                className="text-text-light/85 text-[8px] font-pixel leading-relaxed pl-1.5"
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

export const SplitChatView: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const houseVisits = useGameStore((s) => s.houseVisits)

  const hasVisits = houseVisits.length > 0

  if (!hasVisits) {
    return (
      <div className="fixed right-0 top-12 bottom-16 w-[300px] z-30 flex flex-col p-1.5">
        <ChatPanel
          title="Ates Basi"
          titleColor="#DAA520"
          speeches={speeches}
          icon="\uD83D\uDD25"
        />
      </div>
    )
  }

  return (
    <div className="fixed right-0 top-12 bottom-16 z-30 flex gap-1.5 p-1.5" style={{ width: '580px' }}>
      <div className="flex flex-col w-[280px] min-h-0">
        <ChatPanel
          title="Ates Basi"
          titleColor="#DAA520"
          speeches={speeches}
          icon="\uD83D\uDD25"
        />
      </div>

      <div className="flex flex-col w-[280px] gap-1.5 min-h-0">
        {houseVisits.map((visit) => (
          <ChatPanel
            key={visit.visit_id}
            title={`${visit.visitor} \u2192 ${visit.host}`}
            titleColor="#C2B280"
            speeches={visit.speeches}
            icon="\uD83C\uDFE0"
          />
        ))}
      </div>
    </div>
  )
}

export default SplitChatView
