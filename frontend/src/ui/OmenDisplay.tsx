import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'
import type { Omen } from '../state/types'

const omenIcons: Record<Omen['type'], string> = {
  warning: '\u26A0\uFE0F',
  hint: '\uD83D\uDD2E',
  neutral: '\uD83C\uDF19',
}

const omenTintClasses: Record<Omen['type'], string> = {
  warning: 'border-fire-red/70 bg-[#3a1515]/90',
  hint: 'border-[#2a4a7a] bg-[#15202a]/90',
  neutral: 'border-wood bg-[#d4b896]/20',
}

export const OmenDisplay: React.FC = () => {
  const omens = useGameStore((s) => s.omens)
  const phase = useGameStore((s) => s.phase)
  const [visibleCount, setVisibleCount] = useState(0)

  // Staggered reveal animation
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
      {omens.map((omen, idx) => (
        <div
          key={omen.id}
          className={`
            w-[180px] border-4 px-3 py-4 flex flex-col items-center gap-2
            transition-all duration-500 ease-out
            shadow-lg shadow-black/40
            ${omenTintClasses[omen.type]}
            ${idx < visibleCount
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 -translate-y-4 pointer-events-none'
            }
          `}
        >
          {/* Icon */}
          <span className="text-2xl">{omenIcons[omen.type]}</span>

          {/* Type label */}
          <span className="text-[8px] font-pixel uppercase tracking-wider text-text-gold">
            {omen.type === 'warning' ? 'Uyari' : omen.type === 'hint' ? 'Ipucu' : 'Kehanet'}
          </span>

          {/* Text */}
          <p className="text-text-light text-[9px] font-pixel text-center leading-relaxed">
            {omen.text}
          </p>
        </div>
      ))}
    </div>
  )
}

export default OmenDisplay
