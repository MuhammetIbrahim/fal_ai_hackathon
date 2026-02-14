import React, { useState, useEffect, useCallback } from 'react'
import type { SpotlightCard } from '../state/types'

interface CardRevealProps {
  cards: SpotlightCard[]
  onComplete?: () => void
}

const borderColors: Record<SpotlightCard['type'], string> = {
  spotlight: 'rgba(218,165,32,0.6)',
  sinama: 'rgba(220,20,60,0.5)',
  kriz: 'rgba(138,43,226,0.5)',
}

const glowColors: Record<SpotlightCard['type'], string> = {
  spotlight: 'rgba(218,165,32,0.2)',
  sinama: 'rgba(220,20,60,0.15)',
  kriz: 'rgba(138,43,226,0.15)',
}

const labelColors: Record<SpotlightCard['type'], string> = {
  spotlight: '#DAA520',
  sinama: '#DC143C',
  kriz: '#8a2be2',
}

const typeLabels: Record<SpotlightCard['type'], string> = {
  spotlight: 'Spotlight',
  sinama: 'Sinama',
  kriz: 'Kriz',
}

export const CardReveal: React.FC<CardRevealProps> = ({ cards, onComplete }) => {
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    cards.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setRevealedIndices((prev) => new Set([...prev, idx]))
        }, 1500 * (idx + 1)),
      )
    })

    if (cards.length > 0) {
      timers.push(
        setTimeout(() => {
          onComplete?.()
        }, 1500 * cards.length + 1000),
      )
    }

    return () => timers.forEach(clearTimeout)
  }, [cards, onComplete])

  const handleCardClick = useCallback((idx: number) => {
    setRevealedIndices((prev) => new Set([...prev, idx]))
  }, [])

  if (cards.length === 0) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />

      <div className="relative flex gap-6">
        {cards.map((card, idx) => {
          const isRevealed = revealedIndices.has(idx)

          return (
            <div
              key={card.id}
              className="cursor-pointer"
              style={{ perspective: '800px' }}
              onClick={() => handleCardClick(idx)}
            >
              <div
                className="relative w-[160px] h-[220px] transition-transform duration-700 ease-in-out"
                style={{
                  transformStyle: 'preserve-3d',
                  transform: isRevealed ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Card Back */}
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-lg"
                  style={{
                    backfaceVisibility: 'hidden',
                    border: '1px solid rgba(107,107,107,0.3)',
                    backgroundColor: 'rgba(20,20,35,0.9)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-4xl text-stone/50">?</span>
                    <div className="w-10 h-px bg-gradient-to-r from-transparent via-stone/30 to-transparent" />
                    <span className="text-[8px] font-pixel text-stone/40 uppercase tracking-wider">
                      Kart
                    </span>
                  </div>
                  {/* Inner border */}
                  <div
                    className="absolute inset-2 rounded"
                    style={{ border: '1px solid rgba(107,107,107,0.12)' }}
                  />
                </div>

                {/* Card Front */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center p-4 gap-3 rounded-lg"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: 'linear-gradient(135deg, #d8bc96 0%, #c8a878 50%, #d4b890 100%)',
                    border: `1px solid ${borderColors[card.type]}`,
                    boxShadow: `0 8px 24px rgba(0,0,0,0.4), 0 0 20px ${glowColors[card.type]}`,
                  }}
                >
                  {/* Type label */}
                  <span
                    className="text-[8px] font-pixel uppercase tracking-[0.15em]"
                    style={{ color: labelColors[card.type] }}
                  >
                    {typeLabels[card.type]}
                  </span>

                  {/* Title */}
                  <h3 className="text-[10px] font-pixel text-[#2a1f10] text-center font-bold">
                    {card.title}
                  </h3>

                  <div className="w-full h-px bg-gradient-to-r from-transparent via-[#8B5E3C]/40 to-transparent" />

                  {/* Description */}
                  <p className="text-[8px] font-pixel text-[#4a3a20] text-center leading-relaxed">
                    {card.description}
                  </p>

                  {/* Target */}
                  {card.target && (
                    <span className="text-[8px] font-pixel text-[#8B0000] mt-1">
                      Hedef: {card.target}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default CardReveal
