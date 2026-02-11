import React, { useEffect, useRef } from 'react'
import { useGameStore } from '../state/GameStore'
import type { Speech } from '../state/types'

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

// ── Chat message list for a single room ──
const ChatMessages: React.FC<{ speeches: Speech[] }> = ({ speeches }) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const getColor = usePlayerColor()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  return (
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
  )
}

// ── Main RoomChatOverlay ──
export const RoomChatOverlay: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const houseVisits = useGameStore((s) => s.houseVisits)
  const selectedRoom = useGameStore((s) => s.selectedRoom)
  const setSelectedRoom = useGameStore((s) => s.setSelectedRoom)

  // Build tab list: campfire is always first, then house visits
  const tabs: { id: string; label: string; icon: string; speeches: Speech[] }[] = [
    { id: 'campfire', label: 'Ocak', icon: '🔥', speeches },
  ]

  for (const visit of houseVisits) {
    tabs.push({
      id: `visit:${visit.host}:${visit.visitor}`,
      label: `${visit.visitor} → ${visit.host}`,
      icon: '🏠',
      speeches: visit.speeches,
    })
  }

  // Find active tab
  const activeTab = tabs.find((t) => {
    if (selectedRoom === 'campfire' && t.id === 'campfire') return true
    if (selectedRoom && t.id.includes(selectedRoom)) return true
    return false
  }) ?? tabs[0]

  return (
    <div className="fixed right-0 top-12 bottom-16 w-[320px] z-30 flex flex-col border-2 border-wood/60 bg-bg-dark/95 shadow-lg shadow-black/40">
      {/* Tab bar */}
      <div className="flex-shrink-0 flex overflow-x-auto border-b-2 border-wood/30 scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                // Map tab id back to selectedRoom
                if (tab.id === 'campfire') {
                  setSelectedRoom('campfire')
                } else {
                  // Extract host name from visit tab
                  const parts = tab.id.split(':')
                  setSelectedRoom(parts[1]) // host name
                }
              }}
              className={`flex-shrink-0 px-2 py-1.5 text-[8px] font-pixel whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-text-gold border-b-2 border-text-gold font-bold bg-wood/10'
                  : 'text-stone hover:text-text-light hover:bg-wood/5'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.label}
              {/* New message indicator for non-active tabs */}
              {!isActive && tab.speeches.length > 0 && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-fire-orange animate-pulse" />
              )}
            </button>
          )
        })}
      </div>

      {/* Chat content */}
      <ChatMessages speeches={activeTab.speeches} />
    </div>
  )
}

export default RoomChatOverlay
