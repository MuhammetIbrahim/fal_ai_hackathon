import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'
import { PHASE_NAMES } from '../utils/constants'

export const StatusHUD: React.FC = () => {
  const phase = useGameStore((s) => s.phase)
  const round = useGameStore((s) => s.round)
  const players = useGameStore((s) => s.players)
  const inputRequired = useGameStore((s) => s.inputRequired)

  const [timer, setTimer] = useState<number | null>(null)

  const alivePlayers = players.filter((p) => p.alive)
  const phaseName = PHASE_NAMES[phase] ?? phase

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
  )
}

export default StatusHUD
