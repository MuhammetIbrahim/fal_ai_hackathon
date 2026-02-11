import React, { useState, useEffect } from 'react'
import type { SpotlightCard } from '../../types/game'

interface SpotlightCardDisplayProps {
  cards: SpotlightCard[]
  selfPlayerName: string | null
}

export const SpotlightCardDisplay: React.FC<SpotlightCardDisplayProps> = ({
  cards,
  selfPlayerName,
}) => {
  const [activeIndex, setActiveIndex] = useState(0)
  const [fadeIn, setFadeIn] = useState(true)

  // Auto-cycle cards every 6 seconds
  useEffect(() => {
    if (cards.length <= 1) return
    const iv = setInterval(() => {
      setFadeIn(false)
      setTimeout(() => {
        setActiveIndex(prev => (prev + 1) % cards.length)
        setFadeIn(true)
      }, 400)
    }, 6000)
    return () => clearInterval(iv)
  }, [cards.length])

  const card = cards[activeIndex]
  if (!card) return null

  const isSelf = card.playerName === selfPlayerName

  return (
    <div className="spotlight-overlay">
      {/* Title */}
      <div className="mb-6">
        <span className="inline-block px-4 py-1.5 rounded-full text-[10px] uppercase tracking-[3px] font-semibold"
              style={{
                background: 'linear-gradient(135deg, rgba(255,191,0,0.1) 0%, rgba(180,80,0,0.08) 100%)',
                border: '1px solid rgba(255,191,0,0.15)',
                color: 'rgba(255,191,0,0.7)',
              }}>
          Sahne Isigi
        </span>
      </div>

      {/* Card */}
      <div className={`spotlight-card transition-opacity duration-400 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
           style={isSelf ? { boxShadow: '0 0 30px rgba(255,191,0,0.15)' } : {}}>

        {/* Player Name */}
        <p className="text-lg font-bold text-accent mb-4 tracking-wide">
          {card.playerName}
          {isSelf && <span className="ml-2 text-xs text-accent/50">(SEN)</span>}
        </p>

        {/* Truths */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[2px] text-text-secondary/40 mb-2 font-semibold">
            Gercekler
          </p>
          {card.truths.map((truth, i) => (
            <div key={i} className="spotlight-truth">{truth}</div>
          ))}
        </div>

        {/* Agenda */}
        <div className="mb-4">
          <p className="text-[10px] uppercase tracking-[2px] text-text-secondary/40 mb-2 font-semibold">
            Gundem
          </p>
          <div className="spotlight-agenda">
            <p className="text-sm text-text-primary/80">{card.agenda}</p>
          </div>
        </div>

        {/* Oath */}
        <div>
          <p className="text-[10px] uppercase tracking-[2px] text-accent/50 mb-2 font-semibold">
            Yemin Cumlesi
          </p>
          <div className="spotlight-oath">
            <p className="text-sm text-accent/80 font-medium">&ldquo;{card.oath}&rdquo;</p>
          </div>
        </div>
      </div>

      {/* Card navigation dots */}
      {cards.length > 1 && (
        <div className="mt-6 flex items-center gap-2">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => { setFadeIn(false); setTimeout(() => { setActiveIndex(i); setFadeIn(true) }, 300) }}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                background: i === activeIndex ? 'rgba(255,191,0,0.7)' : 'rgba(255,255,255,0.15)',
                boxShadow: i === activeIndex ? '0 0 8px rgba(255,191,0,0.4)' : 'none',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
