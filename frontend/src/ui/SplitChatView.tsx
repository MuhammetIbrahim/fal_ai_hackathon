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

// ── Single chat panel (reused for campfire and each 1v1) ──
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
    <div className="flex flex-col border-2 border-wood/60 bg-bg-dark/95 shadow-lg shadow-black/40 min-h-0 flex-1">
      {/* Header */}
      <div className="px-2 py-1.5 border-b-2 border-wood/30 flex-shrink-0">
        <span className="text-[9px] font-pixel" style={{ color: titleColor }}>
          {icon && <span className="mr-1">{icon}</span>}
          {title}
        </span>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1.5 scrollbar-thin min-h-0"
      >
        {speeches.length === 0 && (
          <p className="text-stone text-[7px] text-center mt-2 opacity-50 font-pixel">
            Bekleniyor...
          </p>
        )}

        {speeches.map((speech, idx) => (
          <div key={idx} className="flex flex-col gap-0.5">
            <span
              className="text-[8px] font-pixel font-bold"
              style={{ color: getColor(speech.speaker) }}
            >
              {speech.speaker}
            </span>
            <p className="text-text-light text-[8px] font-pixel leading-relaxed pl-1.5 border-l-2 border-wood/30">
              {speech.content}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main split view: campfire + 1v1s ──
export const SplitChatView: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const houseVisits = useGameStore((s) => s.houseVisits)

  const hasVisits = houseVisits.length > 0

  // If no 1v1s, show full-width campfire chat
  if (!hasVisits) {
    return (
      <div className="fixed right-0 top-12 bottom-16 w-[300px] z-30 flex flex-col">
        <ChatPanel
          title="Ates Basi"
          titleColor="#DAA520"
          speeches={speeches}
          icon="🔥"
        />
      </div>
    )
  }

  // Split layout: campfire left panel + 1v1s right panel
  return (
    <div className="fixed right-0 top-12 bottom-16 z-30 flex gap-1" style={{ width: '580px' }}>
      {/* Campfire chat — left column */}
      <div className="flex flex-col w-[280px] min-h-0">
        <ChatPanel
          title="Ates Basi"
          titleColor="#DAA520"
          speeches={speeches}
          icon="🔥"
        />
      </div>

      {/* 1v1 visits — right column, stacked */}
      <div className="flex flex-col w-[280px] gap-1 min-h-0">
        {houseVisits.map((visit) => (
          <ChatPanel
            key={`${visit.host}-${visit.visitor}`}
            title={`${visit.visitor} → ${visit.host}`}
            titleColor="#C2B280"
            speeches={visit.speeches}
            icon="🏠"
          />
        ))}
      </div>
    </div>
  )
}

export default SplitChatView
