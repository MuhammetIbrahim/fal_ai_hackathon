import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const ExileScene: React.FC = () => {
  const { exiledName, exiledType, exiledRole, worldSeed, players } = useGame()
  const [step, setStep] = useState(0)

  useEffect(() => {
    setStep(0)
    const t1 = setTimeout(() => setStep(1), 1500)
    const t2 = setTimeout(() => setStep(2), 3000)
    const t3 = setTimeout(() => setStep(3), 4500)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [exiledName])

  const exiledPlayer = players.find(p => p.name === exiledName)
  const typeLabel = exiledType === 'yanki_dogmus' ? 'YANKI-DOGMUS' : exiledType === 'et_can' ? 'ET-CAN' : '???'
  const isYanki = exiledType === 'yanki_dogmus'

  const exilePhrase = worldSeed?.exilePhrase ?? 'Cember disina adim at.'

  // No exile (tie)
  if (!exiledName) {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
        <div className="cf-vignette" />
        <div className="cf-noise" />
        <div className="relative z-10 text-center px-6">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full"
                 style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-2xl text-text-secondary/40">&#9878;</span>
            </div>
          </div>
          <p className="text-sm italic text-text-secondary/40 mb-4">Oylar esit dagildi</p>
          <p className="text-2xl text-text-primary/80 font-light">Kimse surgun edilmedi.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Dynamic glow based on type */}
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[140%] h-[80%] pointer-events-none z-0 transition-all duration-1000"
           style={{
             background: step >= 2
               ? isYanki
                 ? 'radial-gradient(ellipse at center bottom, rgba(211,47,47,0.12) 0%, rgba(139,0,0,0.06) 35%, transparent 70%)'
                 : 'radial-gradient(ellipse at center bottom, rgba(67,160,71,0.12) 0%, rgba(30,80,30,0.06) 35%, transparent 70%)'
               : 'radial-gradient(ellipse at center bottom, rgba(255,255,255,0.03) 0%, transparent 70%)',
             animation: 'glowPulse 4s ease-in-out infinite',
           }} />

      <div className="relative z-10 text-center px-6 max-w-lg">
        {/* Ritual phrase */}
        <p className={`text-sm italic text-text-secondary/40 mb-10 transition-all duration-1000 ${step >= 0 ? 'opacity-100' : 'opacity-0'}`}>
          &ldquo;{exilePhrase}&rdquo;
        </p>

        {/* Exiled name — dramatic reveal */}
        <div className={`transition-all duration-1000 ${step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}>
          {exiledPlayer && (
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                 style={{
                   backgroundColor: exiledPlayer.avatarColor,
                   border: '3px solid rgba(255,255,255,0.15)',
                   boxShadow: `0 0 30px ${exiledPlayer.avatarColor}44, 0 0 60px ${exiledPlayer.avatarColor}22`,
                 }} />
          )}
          <p className="text-5xl font-bold mb-3"
             style={{
               color: isYanki ? '#D32F2F' : '#43A047',
               textShadow: isYanki
                 ? '0 0 30px rgba(211,47,47,0.5), 0 0 80px rgba(211,47,47,0.2)'
                 : '0 0 30px rgba(67,160,71,0.5), 0 0 80px rgba(67,160,71,0.2)',
             }}>
            {exiledName}
          </p>
          {(exiledRole || exiledPlayer?.roleTitle) && (
            <p className="text-sm text-text-secondary/50 italic">
              {exiledRole || exiledPlayer?.roleTitle}
            </p>
          )}
        </div>

        {/* Type badge */}
        <div className={`mt-8 transition-all duration-1000 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          <span className="inline-block px-6 py-2.5 rounded-full text-sm font-bold tracking-[3px]"
                style={{
                  background: isYanki
                    ? 'linear-gradient(135deg, rgba(211,47,47,0.15) 0%, rgba(139,0,0,0.1) 100%)'
                    : 'linear-gradient(135deg, rgba(67,160,71,0.15) 0%, rgba(30,80,30,0.1) 100%)',
                  border: `1px solid ${isYanki ? 'rgba(211,47,47,0.3)' : 'rgba(67,160,71,0.3)'}`,
                  color: isYanki ? '#D32F2F' : '#43A047',
                  boxShadow: isYanki
                    ? '0 0 20px rgba(211,47,47,0.15)'
                    : '0 0 20px rgba(67,160,71,0.15)',
                }}>
            {typeLabel}
          </span>
        </div>

        {/* Exiled text */}
        <p className={`mt-8 text-xs uppercase tracking-[4px] text-text-secondary/30 transition-all duration-1000 ${step >= 3 ? 'opacity-100' : 'opacity-0'}`}>
          surgun edildi
        </p>
      </div>
    </div>
  )
}
