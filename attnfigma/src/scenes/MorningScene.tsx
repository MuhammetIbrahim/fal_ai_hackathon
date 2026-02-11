import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const MorningScene: React.FC = () => {
  const { round, dayLimit, morningText, worldSeed } = useGame()
  const [displayed, setDisplayed] = useState('')
  const [showOmen, setShowOmen] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)

  // Typewriter efekti
  useEffect(() => {
    if (!morningText) return
    setDisplayed('')
    setShowOmen(false)
    setCursorVisible(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(morningText.slice(0, i))
      if (i >= morningText.length) {
        clearInterval(iv)
        setTimeout(() => {
          setCursorVisible(false)
          setShowOmen(true)
        }, 600)
      }
    }, 30)
    return () => clearInterval(iv)
  }, [morningText])

  const omens = worldSeed?.omens ?? []
  const omen = omens[(round - 1) % omens.length] ?? ''

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      {/* Atmosfer */}
      <div className="cf-glow" />
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Gun badge */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 z-10">
        <div className="flex items-center gap-3 px-5 py-2 rounded-full backdrop-blur-sm"
             style={{
               background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,191,0,0.04) 100%)',
               border: '1px solid rgba(255,255,255,0.08)',
             }}>
          <span className="text-accent/60 text-sm">&#9788;</span>
          <span className="text-text-secondary/70 text-xs tracking-[3px] uppercase font-medium">
            Gun {round}
          </span>
          <span className="text-text-secondary/30 text-xs">/ {dayLimit}</span>
        </div>
      </div>

      {/* Narrator content */}
      <div className="relative z-10 max-w-xl px-8 text-center">
        {/* Narrator badge */}
        <div className="mb-6">
          <span className="inline-block px-4 py-1.5 rounded-full text-[10px] uppercase tracking-[3px] font-semibold"
                style={{
                  background: 'linear-gradient(135deg, rgba(255,191,0,0.1) 0%, rgba(180,80,0,0.08) 100%)',
                  border: '1px solid rgba(255,191,0,0.15)',
                  color: 'rgba(255,191,0,0.7)',
                }}>
            Ocak Bekcisi
          </span>
        </div>

        {/* Typewriter text */}
        <p className="text-xl leading-[1.8] text-text-primary/90 font-light">
          {displayed}
          {cursorVisible && <span className="animate-pulse text-accent ml-0.5">|</span>}
        </p>

        {/* Omen */}
        {showOmen && omen && (
          <div className="mt-10 animate-fade-in">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg"
                 style={{
                   background: 'rgba(255,191,0,0.04)',
                   border: '1px solid rgba(255,191,0,0.1)',
                 }}>
              <span className="text-accent/50 text-xs">&#9670;</span>
              <p className="text-sm italic text-text-secondary/50">{omen}</p>
              <span className="text-accent/50 text-xs">&#9670;</span>
            </div>
          </div>
        )}
      </div>

      {/* Waiting indicator */}
      {!morningText && (
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-accent/20 border-t-accent/60 rounded-full animate-spin" />
          <p className="text-sm text-text-secondary/40">Sabah oluyor...</p>
        </div>
      )}

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050302] to-transparent z-5 pointer-events-none" />
    </div>
  )
}
