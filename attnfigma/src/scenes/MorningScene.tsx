import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { SpotlightCardDisplay } from '../components/spotlight/SpotlightCardDisplay'
import { MiniEventCard } from '../components/campfire/MiniEventCard'
import type { SinamaType } from '../types/game'

function getSinamaColor(type: SinamaType): string {
  switch (type) {
    case 'esik_haritasi': return 'rgba(255,191,0,0.7)'
    case 'kor_bedeli': return 'rgba(211,47,47,0.7)'
    case 'sessiz_soru': return 'rgba(120,160,200,0.7)'
  }
}

export const MorningScene: React.FC = () => {
  const { round, dayLimit, morningText, omens, sinama, spotlightCards, selfPlayerName, miniEvent, morningCrisis } = useGame()
  const [displayed, setDisplayed] = useState('')
  const [showOmens, setShowOmens] = useState(false)
  const [cursorVisible, setCursorVisible] = useState(true)

  // Katman 1 state
  const [showSinama, setShowSinama] = useState(false)
  const [sinamaDisplayed, setSinamaDisplayed] = useState('')
  const [showMiniEvent, setShowMiniEvent] = useState(false)
  const [showSpotlight, setShowSpotlight] = useState(false)
  // Katman 4 state
  const [showCrisis, setShowCrisis] = useState(false)

  // Typewriter efekti
  useEffect(() => {
    if (!morningText) return
    setDisplayed('')
    setShowOmens(false)
    setShowSinama(false)
    setSinamaDisplayed('')
    setShowMiniEvent(false)
    setShowSpotlight(false)
    setShowCrisis(false)
    setCursorVisible(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(morningText.slice(0, i))
      if (i >= morningText.length) {
        clearInterval(iv)
        setTimeout(() => {
          setCursorVisible(false)
          setShowOmens(true)
        }, 600)
      }
    }, 30)
    return () => clearInterval(iv)
  }, [morningText])

  // Show sinama after omens appear
  useEffect(() => {
    if (showOmens && sinama) {
      const delay = setTimeout(() => setShowSinama(true), 2000)
      return () => clearTimeout(delay)
    }
  }, [showOmens, sinama])

  // Sinama typewriter
  useEffect(() => {
    if (!showSinama || !sinama) return
    setSinamaDisplayed('')
    let i = 0
    const iv = setInterval(() => {
      i++
      setSinamaDisplayed(sinama.content.slice(0, i))
      if (i >= sinama.content.length) {
        clearInterval(iv)
        // After sinama finishes, show mini event (if any), then spotlight
        if (miniEvent) {
          setTimeout(() => setShowMiniEvent(true), 1500)
        } else if (spotlightCards.length > 0) {
          setTimeout(() => setShowSpotlight(true), 2000)
        }
      }
    }, 25)
    return () => clearInterval(iv)
  }, [showSinama, sinama, spotlightCards.length])

  // Show crisis after sınama finishes (or after mini event if no sınama)
  useEffect(() => {
    if (morningCrisis && !showCrisis) {
      // Show crisis after sınama typewriter completes, or after omens if no sınama
      if (showSinama && sinamaDisplayed.length >= (sinama?.content.length ?? 0)) {
        const delay = setTimeout(() => setShowCrisis(true), 1500)
        return () => clearTimeout(delay)
      } else if (showOmens && !sinama) {
        const delay = setTimeout(() => setShowCrisis(true), 2000)
        return () => clearTimeout(delay)
      }
    }
  }, [morningCrisis, showCrisis, showSinama, sinamaDisplayed, sinama, showOmens])

  // Show spotlight after mini event
  useEffect(() => {
    if (showMiniEvent && spotlightCards.length > 0) {
      const delay = setTimeout(() => setShowSpotlight(true), 3000)
      return () => clearTimeout(delay)
    }
  }, [showMiniEvent, spotlightCards.length])

  // If no sinama but has mini event or spotlight, chain them after omens
  useEffect(() => {
    if (showOmens && !sinama) {
      if (miniEvent) {
        const delay = setTimeout(() => setShowMiniEvent(true), 2000)
        return () => clearTimeout(delay)
      } else if (spotlightCards.length > 0) {
        const delay = setTimeout(() => setShowSpotlight(true), 3000)
        return () => clearTimeout(delay)
      }
    }
  }, [showOmens, sinama, miniEvent, spotlightCards.length])

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

        {/* Omen Bar — 3 alamet */}
        {showOmens && omens.length > 0 && (
          <div className="mt-10 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[3px] text-text-secondary/30 mb-3 font-semibold">
              Gunun Alametleri
            </p>
            <div className="flex items-center justify-center gap-4">
              {omens.map((omen, i) => (
                <div key={omen.id}
                     className="flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-500"
                     style={{
                       background: 'rgba(255,191,0,0.04)',
                       border: '1px solid rgba(255,191,0,0.1)',
                       animationDelay: `${i * 200}ms`,
                     }}>
                  <span className="text-lg" style={{ filter: 'drop-shadow(0 0 4px rgba(255,191,0,0.3))' }}>
                    {omen.icon}
                  </span>
                  <span className="text-xs text-accent/60 font-medium">{omen.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sinama Event (Katman 1) */}
        {showSinama && sinama && (
          <div className="mt-8 animate-fade-in">
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="text-xl" style={{ filter: 'drop-shadow(0 0 4px rgba(255,191,0,0.3))' }}>
                {sinama.icon}
              </span>
              <span className="text-[10px] uppercase tracking-[3px] font-semibold"
                    style={{ color: getSinamaColor(sinama.type) }}>
                {sinama.title}
              </span>
            </div>
            <p className="text-sm text-text-primary/80 leading-relaxed italic max-w-md mx-auto">
              {sinamaDisplayed}
              {sinamaDisplayed.length < sinama.content.length && (
                <span className="animate-pulse text-accent ml-0.5">|</span>
              )}
            </p>
          </div>
        )}
      </div>

      {/* Morning Crisis (Katman 4) */}
      {showCrisis && morningCrisis && (
        <div className="relative z-10 mt-6 max-w-lg mx-auto px-8 animate-fade-in">
          <div className="crisis-card px-5 py-4 rounded-xl"
               style={{
                 background: 'linear-gradient(135deg, rgba(211,47,47,0.06) 0%, rgba(139,0,0,0.04) 100%)',
                 border: '1px solid rgba(211,47,47,0.15)',
               }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg" style={{ filter: 'drop-shadow(0 0 4px rgba(211,47,47,0.5))' }}>&#9888;</span>
              <span className="text-[10px] uppercase tracking-[3px] text-warden-alert/60 font-semibold">Sabah Krizi</span>
            </div>
            <p className="text-sm text-text-primary/80 leading-relaxed mb-3">{morningCrisis.crisisText}</p>
            {morningCrisis.publicQuestion && (
              <p className="text-xs text-warden-alert/70 italic mb-3">"{morningCrisis.publicQuestion}"</p>
            )}
            {morningCrisis.whispers.length > 0 && (
              <div className="space-y-1 mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <p className="text-[9px] uppercase tracking-[2px] text-text-secondary/30 font-semibold">Fisildantilar</p>
                {morningCrisis.whispers.map((w, i) => (
                  <p key={i} className="text-[11px] text-text-secondary/50 italic">"{w}"</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mini Event Card (Katman 2) */}
      {showMiniEvent && miniEvent && (
        <div className="relative z-10 mt-6 max-w-md mx-auto px-8">
          <MiniEventCard event={miniEvent} />
        </div>
      )}

      {/* Spotlight Cards Overlay (Katman 1) */}
      {showSpotlight && spotlightCards.length > 0 && (
        <SpotlightCardDisplay cards={spotlightCards} selfPlayerName={selfPlayerName} />
      )}

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
