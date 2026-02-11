import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

const LOCATION_DATA: Record<string, { label: string; icon: string }> = {
  kiler: { label: 'Kiler', icon: '🗝️' },
  gecit_kulesi: { label: 'Gecit Kulesi', icon: '🏰' },
  kul_tapinagi: { label: 'Kul Tapinagi', icon: '🕯️' },
  sifahane: { label: 'Sifahane', icon: '⚕️' },
  demirhane: { label: 'Demirhane', icon: '⚒️' },
  gezgin_hani: { label: 'Gezgin Hani', icon: '🍺' },
}

export const LocationScene: React.FC = () => {
  const { institutionVisit } = useGame()
  const [displayed, setDisplayed] = useState('')
  const [cursorVisible, setCursorVisible] = useState(true)

  const locationId = institutionVisit?.locationId ?? ''
  const locInfo = LOCATION_DATA[locationId] ?? { label: locationId, icon: '📍' }
  const narrative = institutionVisit?.narrative

  // Typewriter effect
  useEffect(() => {
    if (!narrative) {
      setDisplayed('')
      setCursorVisible(true)
      return
    }
    setDisplayed('')
    setCursorVisible(true)
    let i = 0
    const iv = setInterval(() => {
      i++
      setDisplayed(narrative.slice(0, i))
      if (i >= narrative.length) {
        clearInterval(iv)
        setTimeout(() => setCursorVisible(false), 600)
      }
    }, 30)
    return () => clearInterval(iv)
  }, [narrative])

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      {/* Atmosfer */}
      <div className="cf-glow" />
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Location badge */}
      <div className="relative z-10 text-center">
        <div className="institution-badge mb-6">
          <span className="text-4xl block mb-3" style={{ filter: 'drop-shadow(0 0 8px rgba(255,191,0,0.3))' }}>
            {locInfo.icon}
          </span>
          <span className="text-xs uppercase tracking-[4px] text-accent/60 font-semibold">
            {locInfo.label}
          </span>
        </div>

        {/* Narrative */}
        <div className="max-w-lg px-8">
          {!narrative ? (
            <div className="flex flex-col items-center gap-4">
              <div className="w-6 h-6 border-2 border-accent/20 border-t-accent/50 rounded-full animate-spin" />
              <p className="text-sm text-text-secondary/40">Sahne hazirlaniyor...</p>
            </div>
          ) : (
            <p className="text-lg leading-[1.8] text-text-primary/90 font-light">
              {displayed}
              {cursorVisible && <span className="animate-pulse text-accent ml-0.5">|</span>}
            </p>
          )}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#050302] to-transparent z-5 pointer-events-none" />
    </div>
  )
}
