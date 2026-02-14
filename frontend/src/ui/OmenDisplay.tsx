import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'
import type { Omen } from '../state/types'

const omenIcons: Record<Omen['type'], string> = {
  warning: '\u26A0\uFE0F',
  hint: '\uD83D\uDD2E',
  neutral: '\uD83C\uDF19',
}

const omenStyles: Record<Omen['type'], { border: string; bg: string; glow: string }> = {
  warning: {
    border: '1px solid rgba(220,20,60,0.4)',
    bg: 'rgba(40,12,12,0.9)',
    glow: '0 0 16px rgba(220,20,60,0.1)',
  },
  hint: {
    border: '1px solid rgba(100,150,255,0.3)',
    bg: 'rgba(12,20,35,0.9)',
    glow: '0 0 16px rgba(100,150,255,0.1)',
  },
  neutral: {
    border: '1px solid rgba(139,94,60,0.4)',
    bg: 'rgba(30,22,12,0.9)',
    glow: '0 0 16px rgba(218,165,32,0.08)',
  },
}

export const OmenDisplay: React.FC = () => {
  const omens = useGameStore((s) => s.omens)
  const phase = useGameStore((s) => s.phase)
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    if (phase !== 'morning' || omens.length === 0) {
      setVisibleCount(0)
      return
    }

    setVisibleCount(0)
    const timers: ReturnType<typeof setTimeout>[] = []

    omens.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((prev) => Math.max(prev, idx + 1))
        }, 600 * (idx + 1)),
      )
    })

    return () => timers.forEach(clearTimeout)
  }, [omens, phase])

  if (phase !== 'morning' || omens.length === 0) return null

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-35 flex gap-4">
      {omens.map((omen, idx) => {
        const s = omenStyles[omen.type] ?? omenStyles.neutral

        return (
          <div
            key={omen.id}
            className={`
              w-[180px] px-4 py-4 flex flex-col items-center gap-2.5
              transition-all duration-500 ease-out rounded-lg backdrop-blur-md
              ${idx < visibleCount
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 -translate-y-4 pointer-events-none'
              }
            `}
            style={{
              border: s.border,
              backgroundColor: s.bg,
              boxShadow: `${s.glow}, 0 8px 24px rgba(0,0,0,0.4)`,
            }}
          >
            <span className="text-2xl">{omenIcons[omen.type] ?? '\uD83C\uDF19'}</span>

            <span className="text-[8px] font-pixel uppercase tracking-[0.15em] text-text-gold/80">
              {omen.type === 'warning' ? 'Uyari' : omen.type === 'hint' ? 'Ipucu' : 'Kehanet'}
            </span>

            <p className="text-text-light/80 text-[9px] font-pixel text-center leading-relaxed">
              {omen.text}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default OmenDisplay
