import React, { useState } from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import type { NightMove } from '../state/types'

// Default night action cards when none are provided by server
const DEFAULT_NIGHT_MOVES: NightMove[] = [
  {
    id: 'investigate',
    label: 'Arastir',
    description: 'Bir oyuncunun kurumunu ogren.',
    icon: '\uD83D\uDD0D',
  },
  {
    id: 'protect',
    label: 'Koru',
    description: 'Bir oyuncuyu gecenin tehlikelerinden koru.',
    icon: '\uD83D\uDEE1\uFE0F',
  },
  {
    id: 'sabotage',
    label: 'Sabotaj',
    description: 'Bir oyuncunun eylemini engelle.',
    icon: '\uD83D\uDCA3',
  },
]

export const NightPanel: React.FC = () => {
  const inputRequired = useGameStore((s) => s.inputRequired)
  const players = useGameStore((s) => s.players)
  const [selectedAction, setSelectedAction] = useState<string | null>(null)
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null)

  const nightMoves: NightMove[] =
    (inputRequired?.data?.moves as NightMove[] | undefined) ?? DEFAULT_NIGHT_MOVES

  const handleSelectAction = (moveId: string) => {
    setSelectedAction(moveId)
    setSelectedTarget(null)
  }

  const handleSelectTarget = (playerName: string) => {
    setSelectedTarget(playerName)
  }

  const handleConfirm = () => {
    if (!selectedAction) return
    wsManager.send('night_action', {
      action: selectedAction,
      target: selectedTarget ?? undefined,
    })
    setSelectedAction(null)
    setSelectedTarget(null)
    useGameStore.getState().setInputRequired(null)
  }

  if (inputRequired?.type !== 'night_action') return null

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      {/* Backdrop - night sky feel */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at top, #0D1B2A 0%, #000 70%)',
          opacity: 0.9,
        }}
      />

      {/* Star decorations (CSS dots) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white/60 rounded-full animate-pulse"
            style={{
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 23 + 7) % 60}%`,
              animationDelay: `${i * 0.3}s`,
              animationDuration: `${2 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Moon */}
        <div className="text-3xl mb-2">{'\uD83C\uDF19'}</div>

        <h2 className="text-[12px] font-pixel text-text-light tracking-wider">
          Gece Eylemi
        </h2>

        {/* Action cards - tarot style */}
        <div className="flex gap-5">
          {nightMoves.map((move) => {
            const isSelected = selectedAction === move.id

            return (
              <button
                key={move.id}
                onClick={() => handleSelectAction(move.id)}
                className={`
                  w-[140px] h-[200px] flex flex-col items-center justify-center gap-3 p-3
                  border-4 cursor-pointer transition-all duration-300
                  ${isSelected
                    ? 'border-[#4a8aff] bg-[#0a1a3a]/90 shadow-[0_0_20px_rgba(74,138,255,0.4)] scale-105'
                    : 'border-stone/50 bg-[#0a0a1a]/90 hover:border-[#4a8aff]/50 hover:shadow-[0_0_12px_rgba(74,138,255,0.2)]'
                  }
                `}
              >
                {/* Icon */}
                <span className="text-3xl">{move.icon ?? '\u2728'}</span>

                {/* Title */}
                <h3 className="text-[10px] font-pixel text-text-light text-center">
                  {move.label}
                </h3>

                {/* Divider */}
                <div className="w-10 h-0.5 bg-stone/30" />

                {/* Description */}
                <p className="text-[7px] font-pixel text-stone text-center leading-relaxed">
                  {move.description}
                </p>
              </button>
            )
          })}
        </div>

        {/* Target selection (if action selected) */}
        {selectedAction && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <span className="text-[9px] font-pixel text-stone">
              Hedef sec:
            </span>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {players
                .filter((p) => p.alive)
                .map((p) => (
                  <button
                    key={p.slot_id}
                    onClick={() => handleSelectTarget(p.name)}
                    className={`px-3 py-1 text-[8px] font-pixel border-2 transition-all ${
                      selectedTarget === p.name
                        ? 'border-[#4a8aff] bg-[#1a2a4a] text-text-light'
                        : 'border-stone/40 bg-[#1a1a2a] text-stone hover:border-stone'
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            {/* Confirm button */}
            <button
              onClick={handleConfirm}
              disabled={!selectedTarget}
              className={`
                mt-2 px-6 py-2 text-[10px] font-pixel uppercase tracking-wider
                border-4 transition-all duration-200
                ${selectedTarget
                  ? 'border-[#4a8aff] bg-[#1a2a5a] text-text-light hover:bg-[#2a3a6a] cursor-pointer'
                  : 'border-stone/30 bg-[#1a1a2a] text-stone/50 cursor-not-allowed'
                }
              `}
            >
              Onayla
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default NightPanel
