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
  const currentSpeaker = useGameStore((s) => s.currentSpeaker)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [speeches])

  const textSize = large ? 'text-[13px]' : 'text-[11px]'
  const nameSize = large ? 'text-[13px]' : 'text-[11px]'
  const sepSize = large ? 'text-[11px]' : 'text-[9px]'
  const avatarPx = large ? 44 : 36

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-3 space-y-3 scrollbar-thin min-h-0"
    >
      {speeches.length === 0 && (
        <div className="flex flex-col items-center justify-center mt-8 gap-2">
          <div className="w-8 h-8 rounded-full bg-wood/10 flex items-center justify-center">
            <span className="text-stone text-sm opacity-40">...</span>
          </div>
          <p className={`text-stone ${sepSize} text-center opacity-40 font-pixel`}>
            {emptyText ?? 'Bekleniyor...'}
          </p>
        </div>
      )}

      {speeches.map((speech, idx) => {
        // Separator message
        if (speech.speaker === '---') {
          return (
            <div key={idx} className="flex items-center gap-3 my-2 px-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-wood/30 to-transparent" />
              <span className={`text-stone ${sepSize} font-pixel whitespace-nowrap opacity-60`}>
                {speech.content.replace(/---/g, '').trim()}
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-wood/30 to-transparent" />
            </div>
          )
        }

        const avatarUrl = getAvatar(speech.speaker)
        const color = getColor(speech.speaker)
        const isSpeaking = currentSpeaker === speech.speaker && idx === speeches.length - 1

        return (
          <div
            key={idx}
            className={`flex gap-2.5 group transition-all duration-300 ${speech.pending ? 'opacity-60' : ''}`}
            style={{
              backgroundColor: isSpeaking ? `${color}08` : 'transparent',
              borderRadius: '6px',
              padding: isSpeaking ? '4px' : '0',
              boxShadow: isSpeaking ? `inset 0 0 20px ${color}10` : 'none',
            }}
          >
            {/* Avatar */}
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={speech.speaker}
                className="flex-shrink-0 object-cover mt-0.5"
                style={{
                  width: avatarPx,
                  height: avatarPx,
                  borderRadius: '50%',
                  border: `2px solid ${color}40`,
                }}
              />
            ) : (
              <div
                className="flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{
                  width: avatarPx,
                  height: avatarPx,
                  borderRadius: '50%',
                  backgroundColor: color + '20',
                  border: `2px solid ${color}40`,
                }}
              >
                <span className="text-[8px] font-pixel font-bold" style={{ color }}>
                  {speech.speaker.charAt(0)}
                </span>
              </div>
            )}
            {/* Message */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span
                className={`${nameSize} font-pixel font-bold`}
                style={{ color }}
              >
                {speech.speaker}
              </span>
              <p
                className={`${speech.pending ? 'text-stone italic' : 'text-text-light/90'} ${textSize} font-pixel leading-relaxed`}
                style={{
                  borderLeft: `2px solid ${color}30`,
                  paddingLeft: '8px',
                }}
              >
                {speech.content}{speech.pending ? ' ...' : ''}
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
  const lastManualSwitchRef = useRef(0)

  const myLocation = myName ? playerLocations[myName] : undefined
  const isInVisit = myLocation?.startsWith('visiting:')
  const myVisitHost = isInVisit ? myLocation!.split(':')[1] : null

  const tabs: TabInfo[] = useMemo(() => {
    const result: TabInfo[] = [
      { id: 'campfire', label: 'Ocak', icon: '\uD83D\uDD25', speeches },
    ]

    for (const visit of houseVisits) {
      const isMyVisit =
        myName !== null && (visit.host === myName || visit.visitor === myName)
      result.push({
        id: `visit:${visit.visit_id}`,
        label: `${visit.visitor} \u2192 ${visit.host}`,
        icon: '\uD83C\uDFE0',
        speeches: visit.speeches,
        emptyText: `${visit.visitor} ile ${visit.host} konusuyor...`,
        isMine: isMyVisit,
      })
    }

    return result
  }, [speeches, houseVisits, myName])

  useEffect(() => {
    const newCount = houseVisits.length
    const oldCount = prevVisitCountRef.current
    if (newCount > oldCount && newCount > 0) {
      const newest = houseVisits[newCount - 1]
      const recentManualSwitch = Date.now() - lastManualSwitchRef.current < 5000

      if (myName && (newest.host === myName || newest.visitor === myName)) {
        setSelectedRoom(newest.visit_id)
      } else if (!recentManualSwitch) {
        const currentRoom = useGameStore.getState().selectedRoom
        if (!currentRoom || currentRoom === 'campfire') {
          setSelectedRoom(newest.visit_id)
        }
      }
    }
    prevVisitCountRef.current = newCount
  }, [houseVisits.length, houseVisits, setSelectedRoom, myName])

  const activeTab = useMemo(() => {
    if (!selectedRoom || selectedRoom === 'campfire') {
      return tabs[0]
    }

    const visitTab = tabs.find((t) => {
      if (t.id === 'campfire') return false
      const visitId = t.id.replace('visit:', '')
      return visitId === selectedRoom
    })
    if (visitTab) return visitTab

    return tabs[0]
  }, [selectedRoom, tabs, houseVisits])

  const isImmersiveVisit = isInVisit && activeTab.isMine

  return (
    <div
      className={
        isImmersiveVisit
          ? 'fixed inset-x-0 top-12 bottom-16 z-30 flex flex-col mx-auto max-w-2xl bg-[#120e06]/98 shadow-2xl shadow-black/60'
          : 'fixed right-0 top-12 bottom-16 w-[340px] z-30 flex flex-col bg-[#120e06]/95 shadow-xl shadow-black/40'
      }
      style={{
        borderLeft: isImmersiveVisit ? 'none' : '1px solid rgba(139,94,60,0.3)',
        borderTop: isImmersiveVisit ? '1px solid rgba(218,165,32,0.3)' : 'none',
        backdropFilter: 'blur(8px)',
      }}
    >
      {/* Immersive visit header */}
      {isImmersiveVisit && (
        <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-transparent via-[#2a1f10]/60 to-transparent"
             style={{ borderBottom: '1px solid rgba(218,165,32,0.2)' }}>
          <span className="text-[10px] font-pixel text-text-gold tracking-wider">
            EV ZIYARETI
          </span>
          <span className="text-[8px] font-pixel text-stone">|</span>
          <span className="text-[9px] font-pixel text-text-light/80">
            {myVisitHost}&apos;in Evi
          </span>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex-shrink-0 flex overflow-x-auto scrollbar-thin"
           style={{ borderBottom: '1px solid rgba(139,94,60,0.2)' }}>
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
              className={`flex-shrink-0 px-3 py-2 text-[8px] font-pixel whitespace-nowrap transition-all duration-200 relative ${
                isActive
                  ? 'text-text-gold font-bold'
                  : tab.isMine
                    ? 'text-fire-orange hover:text-text-gold font-bold'
                    : 'text-stone/70 hover:text-text-light'
              }`}
            >
              <span className="mr-1">{tab.icon}</span>
              {tab.isMine ? `\u2605 ${tab.label}` : tab.label}
              {/* Active indicator line */}
              {isActive && (
                <div className="absolute bottom-0 left-1 right-1 h-[2px] bg-text-gold rounded-full" />
              )}
              {/* New message dot */}
              {!isActive && tab.speeches.length > 0 && (
                <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-fire-orange animate-pulse" />
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
