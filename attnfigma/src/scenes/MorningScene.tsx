import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const MorningScene: React.FC = () => {
  const { round, morningText, worldSeed, advancePhase } = useGame()
  const [displayed, setDisplayed] = useState('')
  const [showOmen, setShowOmen] = useState(false)

  // Typewriter efekti
  useEffect(() => {
    setDisplayed('')
    setShowOmen(false)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(morningText.slice(0, i))
      if (i >= morningText.length) {
        clearInterval(iv)
        setTimeout(() => setShowOmen(true), 500)
      }
    }, 35)
    return () => clearInterval(iv)
  }, [morningText])

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(() => advancePhase(), 7000)
    return () => clearTimeout(t)
  }, [advancePhase])

  const omen = worldSeed.omens[round - 1] ?? ''

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      {/* Atmosfer */}
      <div className="cf-glow" />
      <div className="cf-vignette" />

      {/* Gun badge */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 z-10">
        <span className="px-4 py-2 rounded-full border border-white/10 bg-white/5 text-text-secondary text-sm tracking-widest uppercase backdrop-blur-sm">
          Gun {round}
        </span>
      </div>

      {/* Narrator */}
      <div className="relative z-10 max-w-xl px-6 text-center">
        <p className="text-xs uppercase tracking-[3px] text-accent/70 mb-4">Ocak Bekcisi</p>
        <p className="text-xl leading-relaxed text-text-primary font-light">
          {displayed}
          <span className="animate-pulse text-accent">|</span>
        </p>
      </div>

      {/* Omen */}
      {showOmen && (
        <div className="relative z-10 mt-8 animate-fade-in">
          <p className="text-sm italic text-text-secondary/60">
            {omen}
          </p>
        </div>
      )}
    </div>
  )
}
