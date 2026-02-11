import React, { useState, useEffect, useCallback } from 'react'
import type { SpotlightCard } from '../state/types'

interface CardRevealProps {
  cards: SpotlightCard[]
  onComplete?: () => void
}

const borderColors: Record<SpotlightCard['type'], string> = {
  spotlight: 'border-text-gold',
  sinama: 'border-fire-red',
  kriz: 'border-[#8a2be2]',
}

const labelColors: Record<SpotlightCard['type'], string> = {
  spotlight: 'text-text-gold',
  sinama: 'text-fire-red',
  kriz: 'text-[#8a2be2]',
}

const typeLabels: Record<SpotlightCard['type'], string> = {
  spotlight: 'Spotlight',
  sinama: 'Sinama',
  kriz: 'Kriz',
}

export const CardReveal: React.FC<CardRevealProps> = ({ cards, onComplete }) => {
  const [revealedIndices, setRevealedIndices] = useState<Set<number>>(new Set())

  // Auto-reveal sequentially with delay
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []

    cards.forEach((_, idx) => {
      timers.push(
        setTimeout(() => {
          setRevealedIndices((prev) => new Set([...prev, idx]))
        }, 1500 * (idx + 1)),
      )
    })

    // Call onComplete after all cards revealed
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
      <div className="absolute inset-0 bg-black/50" />

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
                  className="absolute inset-0 border-4 border-stone bg-[#1a1a2e] flex items-center justify-center shadow-lg shadow-black/50"
                  style={{ backfaceVisibility: 'hidden' }}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className="text-4xl text-stone">?</span>
                    <div className="w-12 h-0.5 bg-stone/40" />
                    <span className="text-[8px] font-pixel text-stone/60 uppercase">
                      Kart
                    </span>
                  </div>
                  {/* Decorative pattern */}
                  <div className="absolute inset-2 border border-stone/20" />
                </div>

                {/* Card Front */}
                <div
                  className={`absolute inset-0 border-4 ${borderColors[card.type]} flex flex-col items-center justify-center p-3 gap-3 shadow-lg shadow-black/50`}
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    background: 'linear-gradient(135deg, #d4b896 0%, #c4a876 50%, #d4b896 100%)',
                  }}
                >
                  {/* Type label */}
                  <span className={`text-[8px] font-pixel uppercase tracking-wider ${labelColors[card.type]}`}>
                    {typeLabels[card.type]}
                  </span>

                  {/* Title */}
                  <h3 className="text-[10px] font-pixel text-[#2a1f10] text-center font-bold">
                    {card.title}
                  </h3>

                  <div className="w-full h-0.5 bg-wood/40" />

                  {/* Description */}
                  <p className="text-[8px] font-pixel text-[#4a3a20] text-center leading-relaxed">
                    {card.description}
                  </p>

                  {/* Target if applicable */}
                  {card.target && (
                    <span className="text-[8px] font-pixel text-accent-red mt-1">
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
