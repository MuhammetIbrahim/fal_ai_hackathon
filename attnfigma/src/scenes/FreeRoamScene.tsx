import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const FreeRoamScene: React.FC = () => {
  const { currentDayScript, advancePhase } = useGame()
  const decisions = currentDayScript?.freeRoamDecisions ?? []
  const [visibleCount, setVisibleCount] = useState(0)

  // Kararlar birer birer acilir
  useEffect(() => {
    if (visibleCount < decisions.length) {
      const t = setTimeout(() => setVisibleCount(c => c + 1), 800)
      return () => clearTimeout(t)
    }
  }, [visibleCount, decisions.length])

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(() => advancePhase(), 6000)
    return () => clearTimeout(t)
  }, [advancePhase])

  const campfirePlayers = decisions.filter(d => d.choice === 'CAMPFIRE').slice(0, visibleCount)
  const homePlayers = decisions.filter(d => d.choice === 'HOME').slice(0, visibleCount)
  const visitors = decisions.filter(d => d.choice.startsWith('VISIT')).slice(0, visibleCount)

  return (
    <div className="relative flex flex-col h-screen bg-[#050302] overflow-hidden">
      <div className="cf-glow" />
      <div className="cf-vignette" />

      {/* Header */}
      <div className="relative z-10 pt-8 pb-4 text-center">
        <p className="text-xs uppercase tracking-[3px] text-accent/70 mb-2">Serbest Dolasim</p>
        <p className="text-sm text-text-secondary">Herkes konumunu seciyor...</p>
      </div>

      {/* Grid */}
      <div className="relative z-10 flex-1 grid grid-cols-3 gap-6 px-8 pb-8 max-w-4xl mx-auto w-full">
        {/* Ates Basi */}
        <div className="flex flex-col items-center">
          <div className="mb-4 text-center">
            <span className="text-accent text-lg">🔥</span>
            <p className="text-sm font-semibold text-accent mt-1">Ates Basi</p>
          </div>
          <div className="space-y-2 w-full">
            {campfirePlayers.map(d => (
              <div key={d.playerName} className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm text-text-primary text-center animate-fade-in">
                {d.playerName}
              </div>
            ))}
          </div>
        </div>

        {/* Hareket Duyurulari */}
        <div className="flex flex-col items-center justify-center">
          <div className="space-y-3 w-full">
            {decisions.slice(0, visibleCount).map(d => (
              <p key={d.playerName} className="text-xs text-text-secondary/80 text-center italic animate-fade-in">
                {d.displayText}
              </p>
            ))}
          </div>
        </div>

        {/* Evler */}
        <div className="flex flex-col items-center">
          <div className="mb-4 text-center">
            <span className="text-text-secondary text-lg">🏠</span>
            <p className="text-sm font-semibold text-text-secondary mt-1">Evler</p>
          </div>
          <div className="space-y-2 w-full">
            {homePlayers.map(d => (
              <div key={d.playerName} className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm text-text-primary text-center animate-fade-in">
                {d.playerName} <span className="text-text-secondary text-xs">(evde)</span>
              </div>
            ))}
            {visitors.map(d => {
              const target = d.choice.replace('VISIT|', '')
              return (
                <div key={d.playerName} className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent text-center animate-fade-in">
                  {d.playerName} → {target}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
