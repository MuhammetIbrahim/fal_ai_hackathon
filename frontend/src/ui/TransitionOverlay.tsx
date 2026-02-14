import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'

const PHASE_CONFIG: Record<string, { icon: string; label: string; gradient: string; accentColor: string }> = {
  morning: {
    icon: '\u2600',
    label: 'SABAH',
    gradient: 'radial-gradient(ellipse at center, rgba(218,165,32,0.3) 0%, rgba(26,18,8,0.95) 50%, #050302 100%)',
    accentColor: '#DAA520',
  },
  campfire: {
    icon: '\uD83D\uDD25',
    label: 'ATES BASI',
    gradient: 'radial-gradient(ellipse at center bottom, rgba(255,100,0,0.4) 0%, rgba(26,18,8,0.95) 50%, #050302 100%)',
    accentColor: '#FF6400',
  },
  vote: {
    icon: '\uD83D\uDDF3',
    label: 'OYLAMA',
    gradient: 'radial-gradient(ellipse at center, rgba(220,20,60,0.35) 0%, rgba(26,18,8,0.95) 50%, #050302 100%)',
    accentColor: '#DC143C',
  },
  exile: {
    icon: '\u2694',
    label: 'SURGUN',
    gradient: 'radial-gradient(ellipse at center, rgba(107,107,107,0.3) 0%, rgba(10,8,6,0.95) 50%, #050302 100%)',
    accentColor: '#6B6B6B',
  },
  night: {
    icon: '\uD83C\uDF19',
    label: 'GECE',
    gradient: 'radial-gradient(ellipse at top, rgba(30,30,80,0.4) 0%, rgba(5,3,15,0.95) 50%, #020108 100%)',
    accentColor: '#6666CC',
  },
  game_over: {
    icon: '\uD83C\uDFC6',
    label: 'OYUN BITTI',
    gradient: 'radial-gradient(ellipse at center, rgba(218,165,32,0.4) 0%, rgba(26,18,8,0.95) 50%, #050302 100%)',
    accentColor: '#DAA520',
  },
}

export const TransitionOverlay: React.FC = () => {
  const transitioning = useGameStore((s) => s.transitioning)
  const phase = useGameStore((s) => s.phase)
  const [showLabel, setShowLabel] = useState(false)

  const config = PHASE_CONFIG[phase] ?? PHASE_CONFIG.campfire

  useEffect(() => {
    if (transitioning) {
      setShowLabel(true)
      const timer = setTimeout(() => setShowLabel(false), 1500)
      return () => clearTimeout(timer)
    } else {
      setShowLabel(false)
    }
  }, [transitioning])

  return (
    <>
      {/* Background overlay */}
      <div
        className="fixed inset-0 z-[100] pointer-events-none transition-opacity duration-1000 ease-in-out"
        style={{
          background: config.gradient,
          opacity: transitioning ? 0.92 : 0,
        }}
      />

      {/* Phase label + icon */}
      <div
        className="fixed inset-0 z-[101] pointer-events-none flex items-center justify-center transition-all duration-500"
        style={{
          opacity: showLabel ? 1 : 0,
          transform: showLabel ? 'scale(1)' : 'scale(0.8)',
        }}
      >
        <div className="flex flex-col items-center gap-3">
          <span
            className="text-4xl"
            style={{
              filter: `drop-shadow(0 0 20px ${config.accentColor}60)`,
            }}
          >
            {config.icon}
          </span>
          <span
            className="text-[16px] font-pixel font-bold tracking-[0.3em]"
            style={{
              color: config.accentColor,
              textShadow: `0 0 20px ${config.accentColor}40, 0 0 40px ${config.accentColor}20`,
            }}
          >
            {config.label}
          </span>
          <div
            className="w-24 h-[1px] mt-1"
            style={{
              background: `linear-gradient(to right, transparent, ${config.accentColor}60, transparent)`,
            }}
          />
        </div>
      </div>

      {/* Night phase: star particles */}
      {transitioning && phase === 'night' && (
        <div className="fixed inset-0 z-[100] pointer-events-none overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-[2px] h-[2px] rounded-full bg-white"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 60}%`,
                opacity: 0.3 + Math.random() * 0.5,
                animation: `twinkle ${1 + Math.random() * 2}s ease-in-out ${Math.random() * 2}s infinite alternate`,
              }}
            />
          ))}
          <style>{`
            @keyframes twinkle {
              0% { opacity: 0.2; transform: scale(0.8); }
              100% { opacity: 0.8; transform: scale(1.2); }
            }
          `}</style>
        </div>
      )}

      {/* Vote phase: red vignette pulse */}
      {transitioning && phase === 'vote' && (
        <div
          className="fixed inset-0 z-[100] pointer-events-none animate-pulse"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 40%, rgba(220,20,60,0.15) 100%)',
          }}
        />
      )}
    </>
  )
}

export default TransitionOverlay
