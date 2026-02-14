import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'
import { PHASE_NAMES } from '../utils/constants'

export const StatusHUD: React.FC = () => {
  const phase = useGameStore((s) => s.phase)
  const round = useGameStore((s) => s.round)
  const players = useGameStore((s) => s.players)
  const inputRequired = useGameStore((s) => s.inputRequired)
  const myName = useGameStore((s) => s.myName)

  const [timer, setTimer] = useState<number | null>(null)
  const [hoveredEffect, setHoveredEffect] = useState<string | null>(null)

  const alivePlayers = players.filter((p) => p.alive)
  const phaseName = PHASE_NAMES[phase] ?? phase
  const myPlayer = players.find((p) => p.name === myName)
  const myEffects = myPlayer?.active_effects || []

  // Effect type to emoji mapping
  const effectIcons: Record<string, string> = {
    accused: '⚠️',
    protected: '🛡️',
    restricted: '🔒',
    silenced: '🤐',
    blessed: '✨',
    cursed: '💀',
    marked: '🎯',
    default: '⚡',
  }

  // Countdown timer logic
  useEffect(() => {
    if (!inputRequired?.timeout_seconds) {
      setTimer(null)
      return
    }

    let remaining = inputRequired.timeout_seconds
    setTimer(remaining)

    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        setTimer(0)
      } else {
        setTimer(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [inputRequired])

  if (phase === 'lobby') return null

  return (
    <>
      <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-2 border-b-4 border-wood bg-bg-dark/90 shadow-lg shadow-black/50">
        {/* Day counter */}
        <div className="flex items-center gap-3">
          <span className="text-text-gold text-[10px]">
            Gun {round}
          </span>
          <span className="text-text-light text-[10px]">
            {phaseName}
          </span>
        </div>

        {/* Alive player count as colored dots */}
        <div className="flex items-center gap-2">
          <span className="text-text-light text-[8px] mr-1">
            {alivePlayers.length}/{players.length}
          </span>
          <div className="flex gap-1">
            {players.map((p) => (
              <div
                key={p.slot_id}
                className={`w-2 h-2 rounded-full ${
                  p.alive
                    ? 'bg-green-400'
                    : 'bg-accent-red opacity-50'
                }`}
                style={p.color ? { backgroundColor: p.alive ? p.color : undefined } : undefined}
                title={p.name}
              />
            ))}
          </div>
        </div>

        {/* Timer */}
        {timer !== null && timer > 0 && (
          <div className="flex items-center gap-1">
            <span className="animate-pulse text-[10px]">&#9203;</span>
            <span
              className={`text-[10px] ${
                timer <= 5 ? 'text-fire-red animate-pulse' : 'text-text-gold'
              }`}
            >
              {timer}s
            </span>
          </div>
        )}
      </div>

      {/* Active Effects Bar */}
      {myEffects.length > 0 && (
        <div className="fixed top-12 left-1/2 transform -translate-x-1/2 z-40 flex items-center gap-2 px-3 py-2 bg-bg-dark/95 border-2 border-wood rounded-lg shadow-lg">
          <span className="text-text-gold text-[8px] font-bold mr-1">AKTIF ETKILER:</span>
          {myEffects.map((effect) => (
            <div
              key={effect.id}
              className="relative group"
              onMouseEnter={() => setHoveredEffect(effect.id)}
              onMouseLeave={() => setHoveredEffect(null)}
            >
              <div className="w-8 h-8 flex items-center justify-center bg-bg-dark border-2 border-wood rounded cursor-pointer hover:border-text-gold transition-colors">
                <span className="text-base">
                  {effectIcons[effect.type] || effectIcons.default}
                </span>
              </div>

              {/* Tooltip */}
              {hoveredEffect === effect.id && (
                <div className="absolute top-10 left-1/2 transform -translate-x-1/2 w-48 p-2 bg-bg-dark border-2 border-text-gold rounded shadow-xl z-50 pointer-events-none">
                  <div className="text-text-gold text-[10px] font-bold mb-1">{effect.name}</div>
                  {effect.description && (
                    <div className="text-text-light text-[8px] mb-1">{effect.description}</div>
                  )}
                  {effect.consequence_text && (
                    <div className="text-fire-red text-[8px] italic">{effect.consequence_text}</div>
                  )}
                  <div className="text-text-light text-[7px] mt-1 opacity-70">
                    Süre: {effect.duration} gün
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

export default StatusHUD
