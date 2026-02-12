import React, { useEffect, useRef, useMemo } from 'react'
import { useGameStore } from '../state/GameStore'
import type { Speech } from '../state/types'

const FALLBACK_COLORS = [
  '#DAA520', '#DC143C', '#4A7023', '#2E5090', '#FF8C00',
  '#8B5E3C', '#6B6B6B', '#5A6672', '#C2B280', '#8B0000',
]

function usePlayerLookup() {
  const players = useGameStore((s) => s.players)

  const getColor = (speakerName: string): string => {
    const player = players.find((p) => p.name === speakerName)
    if (player?.speech_color) return player.speech_color
    if (player?.color) return player.color
    let hash = 0
    for (let i = 0; i < speakerName.length; i++) {
      hash = speakerName.charCodeAt(i) + ((hash << 5) - hash)
    }
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }

  const getAvatar = (speakerName: string): string | undefined => {
    const player = players.find((p) => p.name === speakerName)
    return player?.avatar_url
  }

  return { getColor, getAvatar }
}

// ── Chat message list for a single room ──
const ChatMessages: React.FC<{ speeches: Speech[]; emptyText?: string; large?: boolean }> = ({
  speeches,
  emptyText,
  large,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const { getColor, getAvatar } = usePlayerLookup()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  const textSize = large ? 'text-[11px]' : 'text-[8px]'
  const nameSize = large ? 'text-[12px]' : 'text-[8px]'
  const sepSize = large ? 'text-[9px]' : 'text-[7px]'
  const avatarSize = large ? 'w-7 h-7' : 'w-5 h-5'

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-thin min-h-0"
    >
      {speeches.length === 0 && (
        <p className={`text-stone ${sepSize} text-center mt-4 opacity-50 font-pixel`}>
          {emptyText ?? 'Bekleniyor...'}
        </p>
      )}

      {speeches.map((speech, idx) => {
        // Separator message
        if (speech.speaker === '---') {
          return (
            <div key={idx} className="flex items-center gap-2 my-1">
              <div className="flex-1 h-px bg-wood/30" />
              <span className={`text-stone ${sepSize} font-pixel whitespace-nowrap`}>
                {speech.content.replace(/---/g, '').trim()}
              </span>
              <div className="flex-1 h-px bg-wood/30" />
            </div>
          )
        }

        const avatarUrl = getAvatar(speech.speaker)

        return (
          <div key={idx} className="flex gap-2">
            {/* Avatar */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={speech.speaker}
                className={`${avatarSize} rounded-full flex-shrink-0 object-cover border border-wood/40 mt-0.5`}
              />
            ) : (
              <div
                className={`${avatarSize} rounded-full flex-shrink-0 flex items-center justify-center border border-wood/40 mt-0.5`}
                style={{ backgroundColor: getColor(speech.speaker) + '33' }}
              >
                <span className="text-[7px] font-pixel font-bold" style={{ color: getColor(speech.speaker) }}>
                  {speech.speaker.charAt(0)}
                </span>
              </div>
            )}
            {/* Message */}
            <div className="flex flex-col gap-0.5 min-w-0">
              <span
                className={`${nameSize} font-pixel font-bold`}
                style={{ color: getColor(speech.speaker) }}
              >
                {speech.speaker}
              </span>
              <p className={`text-text-light ${textSize} font-pixel leading-relaxed`}>
                {speech.content}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface TabInfo {
  id: string
  label: string
  icon: string
  speeches: Speech[]
  emptyText?: string
  isMine?: boolean
}

// ── Main RoomChatOverlay ──
export const RoomChatOverlay: React.FC = () => {
  const speeches = useGameStore((s) => s.speeches)
  const houseVisits = useGameStore((s) => s.houseVisits)
  const selectedRoom = useGameStore((s) => s.selectedRoom)
  const setSelectedRoom = useGameStore((s) => s.setSelectedRoom)
  const playerLocations = useGameStore((s) => s.playerLocations)
  const myName = useGameStore((s) => s.myName)
  const prevVisitCountRef = useRef(0)
  const lastManualSwitchRef = useRef(0)  // timestamp of last manual tab click

  // Detect if human is in a house visit
  const myLocation = myName ? playerLocations[myName] : undefined
  const isInVisit = myLocation?.startsWith('visiting:')
  const myVisitHost = isInVisit ? myLocation!.split(':')[1] : null

  // Build tab list: campfire always first, then each active house visit
  const tabs: TabInfo[] = useMemo(() => {
    const result: TabInfo[] = [
      { id: 'campfire', label: 'Ocak', icon: '🔥', speeches },
    ]

    for (const visit of houseVisits) {
      const isMyVisit =
        myName !== null && (visit.host === myName || visit.visitor === myName)
      result.push({
        id: `visit:${visit.visit_id}`,
        label: `${visit.visitor} → ${visit.host}`,
        icon: isMyVisit ? '🏠' : '🏠',
        speeches: visit.speeches,
        emptyText: `${visit.visitor} ile ${visit.host} konusuyor...`,
        isMine: isMyVisit,
      })
    }

    return result
  }, [speeches, houseVisits, myName])

  // Auto-switch to human's own visit tab when it appears
  // Don't auto-switch if user recently clicked a tab (within 5 seconds)
  useEffect(() => {
    const newCount = houseVisits.length
    const oldCount = prevVisitCountRef.current
    if (newCount > oldCount && newCount > 0) {
      const newest = houseVisits[newCount - 1]
      const recentManualSwitch = Date.now() - lastManualSwitchRef.current < 5000

      // If the new visit involves me, always switch to it (my own visit is priority)
      if (myName && (newest.host === myName || newest.visitor === myName)) {
        setSelectedRoom(newest.host)
      } else if (!recentManualSwitch) {
        // Only auto-switch if user hasn't manually clicked a tab recently
        const currentRoom = useGameStore.getState().selectedRoom
        if (!currentRoom || currentRoom === 'campfire') {
          setSelectedRoom(newest.host)
        }
      }
    }
    prevVisitCountRef.current = newCount
  }, [houseVisits.length, houseVisits, setSelectedRoom, myName])

  // Find active tab based on selectedRoom
  const activeTab = useMemo(() => {
    if (!selectedRoom || selectedRoom === 'campfire') {
      return tabs[0]
    }

    // Try to find a visit tab where selectedRoom matches host OR visitor
    const visitTab = tabs.find((t) => {
      if (t.id === 'campfire') return false
      // Extract visit_id from tab id (format: 'visit:VISIT_ID')
      const visitId = t.id.replace('visit:', '')
      // Find the corresponding visit in houseVisits
      const visit = houseVisits.find((hv) => hv.visit_id === visitId)
      if (!visit) return false
      return visit.host === selectedRoom || visit.visitor === selectedRoom
    })
    if (visitTab) return visitTab

    return tabs[0]
  }, [selectedRoom, tabs, houseVisits])

  // Immersive mode: when human is in a visit and viewing their visit tab
  const isImmersiveVisit = isInVisit && activeTab.isMine

  // Panel dimensions based on mode
  const panelClass = isImmersiveVisit
    ? 'fixed inset-x-0 top-12 bottom-16 z-30 flex flex-col mx-auto max-w-2xl border-2 border-text-gold/60 bg-bg-dark/98 shadow-2xl shadow-black/60'
    : 'fixed right-0 top-12 bottom-16 w-[320px] z-30 flex flex-col border-2 border-wood/60 bg-bg-dark/95 shadow-lg shadow-black/40'

  return (
    <div className={panelClass}>
      {/* Immersive visit header */}
      {isImmersiveVisit && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2 border-b-2 border-text-gold/30 bg-[#2a1f10]/80">
          <span className="text-[10px] font-pixel text-text-gold">
            🏠 Ev Ziyareti
          </span>
          <span className="text-[9px] font-pixel text-text-light">
            {myVisitHost}'in Evi
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex-shrink-0 flex overflow-x-auto border-b-2 border-wood/30 scrollbar-thin">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                lastManualSwitchRef.current = Date.now()
                if (tab.id === 'campfire') {
                  setSelectedRoom('campfire')
                } else {
                  const parts = tab.id.split(':')
                  setSelectedRoom(parts[1])
                }
              }}
              className={`flex-shrink-0 px-2 py-1.5 text-[8px] font-pixel whitespace-nowrap transition-colors ${
                isActive
                  ? 'text-text-gold border-b-2 border-text-gold font-bold bg-wood/10'
                  : tab.isMine
                    ? 'text-fire-orange hover:text-text-gold hover:bg-wood/5 font-bold'
                    : 'text-stone hover:text-text-light hover:bg-wood/5'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.isMine ? `★ ${tab.label}` : tab.label}
              {/* New message indicator for non-active tabs */}
              {!isActive && tab.speeches.length > 0 && (
                <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-fire-orange animate-pulse" />
              )}
            </button>
          )
        })}
      </div>

      {/* Chat content */}
      <ChatMessages
        speeches={activeTab.speeches}
        emptyText={activeTab.emptyText}
        large={isImmersiveVisit}
      />
    </div>
  )
}

export default RoomChatOverlay
