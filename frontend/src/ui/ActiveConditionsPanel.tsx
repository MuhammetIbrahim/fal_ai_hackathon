import React, { useState } from 'react'
import { useGameStore } from '../state/GameStore'
import type { WorldEvent } from '../state/types'

/**
 * ActiveConditionsPanel — Köyde aktif olan dünya olaylarını gösteren
 * persistent panel. Sağ alt köşede sabit durur ve tüm fazlarda görünür.
 */

const EVENT_TYPE_COLORS: Record<string, string> = {
  sinama: '#c9a44c',   // gold
  kriz: '#d94c4c',     // red
  mini_event: '#6ca3d9', // blue
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  sinama: 'Sınama',
  kriz: 'Kriz',
  mini_event: 'Olay',
}

const ActiveConditionsPanel: React.FC = () => {
  const activeWorldEvents = useGameStore((s) => s.activeWorldEvents)
  const round = useGameStore((s) => s.round)
  const phase = useGameStore((s) => s.phase)
  const [collapsed, setCollapsed] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // Don't show in lobby or no events
  if (phase === 'lobby' || activeWorldEvents.length === 0) return null

  return (
    <div
      className="fixed bottom-4 right-4 z-30 pointer-events-auto"
      style={{ maxWidth: 280, fontFamily: "'Merriweather', serif" }}
    >
      {/* Header / Toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-t-lg border-2 border-b-0 transition-colors"
        style={{
          background: 'linear-gradient(135deg, #2a1810 0%, #1a0f08 100%)',
          borderColor: '#8b6914',
          color: '#c9a44c',
        }}
      >
        <span className="text-[10px] font-bold tracking-wider uppercase flex items-center gap-1.5">
          <span>🔮</span>
          Aktif Koşullar
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[8px] font-bold"
            style={{ background: '#8b6914', color: '#1a0f08' }}
          >
            {activeWorldEvents.length}
          </span>
        </span>
        <span className="text-[10px]">{collapsed ? '▲' : '▼'}</span>
      </button>

      {/* Event List */}
      {!collapsed && (
        <div
          className="rounded-b-lg border-2 overflow-hidden"
          style={{
            background: 'rgba(26, 15, 8, 0.95)',
            borderColor: '#8b6914',
            backdropFilter: 'blur(8px)',
          }}
        >
          {activeWorldEvents.map((ev: WorldEvent) => {
            const typeColor = EVENT_TYPE_COLORS[ev.event_type] || '#c9a44c'
            const typeLabel = EVENT_TYPE_LABELS[ev.event_type] || ev.event_type
            const remainingRounds = Math.max(0, ev.expiry_round - round)
            const isHovered = hoveredId === ev.id

            return (
              <div
                key={ev.id}
                className="relative px-3 py-2 transition-all cursor-default"
                style={{
                  borderBottom: '1px solid rgba(139, 105, 20, 0.3)',
                  background: isHovered ? 'rgba(139, 105, 20, 0.1)' : 'transparent',
                }}
                onMouseEnter={() => setHoveredId(ev.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Top row: icon + name + type badge */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-sm">{ev.icon}</span>
                  <span
                    className="text-[10px] font-bold flex-1 truncate"
                    style={{ color: '#f4e8d0' }}
                  >
                    {ev.name}
                  </span>
                  <span
                    className="text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase"
                    style={{
                      background: typeColor,
                      color: '#1a0f08',
                    }}
                  >
                    {typeLabel}
                  </span>
                </div>

                {/* Description (truncated unless hovered) */}
                <p
                  className="text-[8px] leading-relaxed mb-1"
                  style={{
                    color: 'rgba(244, 232, 208, 0.7)',
                    display: '-webkit-box',
                    WebkitLineClamp: isHovered ? 4 : 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ev.description}
                </p>

                {/* Mechanical effect */}
                {ev.mechanical_effect && isHovered && (
                  <p
                    className="text-[8px] italic mb-1"
                    style={{ color: '#d94c4c' }}
                  >
                    ⚡ {ev.mechanical_effect}
                  </p>
                )}

                {/* Target + Duration row */}
                <div className="flex items-center justify-between">
                  {ev.target_player && (
                    <span
                      className="text-[7px] flex items-center gap-1"
                      style={{ color: '#c9a44c' }}
                    >
                      🎯 {ev.target_player}
                    </span>
                  )}
                  <span
                    className="text-[7px] ml-auto"
                    style={{
                      color: remainingRounds <= 1 ? '#d94c4c' : 'rgba(244, 232, 208, 0.5)',
                    }}
                  >
                    {remainingRounds <= 1 ? '⏳ Son gün' : `${remainingRounds} gün kaldı`}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ActiveConditionsPanel
