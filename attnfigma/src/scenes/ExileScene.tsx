import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const ExileScene: React.FC = () => {
  const { exiledName, exiledType, worldSeed, players, advancePhase } = useGame()
  const [step, setStep] = useState(0) // 0: ritual, 1: isim, 2: tip

  useEffect(() => {
    const t1 = setTimeout(() => setStep(1), 1500)
    const t2 = setTimeout(() => setStep(2), 3000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  // Auto-advance
  useEffect(() => {
    const t = setTimeout(() => advancePhase(), 6000)
    return () => clearTimeout(t)
  }, [advancePhase])

  const exiledPlayer = players.find(p => p.name === exiledName)
  const typeLabel = exiledType === 'yanki_dogmus' ? 'YANKI-DOGMUS' : 'ET-CAN'
  const typeColor = exiledType === 'yanki_dogmus' ? 'text-warden-alert' : 'text-success'

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-vignette" />

      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Ritual cumlesi */}
        <p className={`text-sm italic text-text-secondary/60 mb-8 transition-opacity duration-700 ${step >= 0 ? 'opacity-100' : 'opacity-0'}`}>
          "{worldSeed.exilePhrase}"
        </p>

        {/* Surgun edilen isim */}
        <div className={`transition-all duration-700 ${step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          <p className="text-4xl font-bold text-warden-alert mb-2 exile-glow">
            {exiledName}
          </p>
          {exiledPlayer && (
            <p className="text-sm text-text-secondary">
              {exiledPlayer.roleTitle}
            </p>
          )}
        </div>

        {/* Tip aciklamasi */}
        <div className={`mt-6 transition-all duration-700 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <span className={`inline-block px-4 py-2 rounded-full border text-sm font-bold tracking-widest ${typeColor} ${exiledType === 'yanki_dogmus' ? 'border-warden-alert/30 bg-warden-alert/10' : 'border-success/30 bg-success/10'}`}>
            [{typeLabel}]
          </span>
        </div>

        {/* Surgun edildi */}
        <p className={`mt-6 text-xs uppercase tracking-[3px] text-text-secondary/40 transition-opacity duration-700 ${step >= 2 ? 'opacity-100' : 'opacity-0'}`}>
          surgun edildi
        </p>
      </div>
    </div>
  )
}
