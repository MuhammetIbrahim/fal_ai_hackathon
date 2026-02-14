import React, { useState } from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import type { NightMove } from '../state/types'

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
      {/* Backdrop — deep night sky */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at top, #0a1525 0%, #050a12 40%, #020508 100%)',
          opacity: 0.95,
        }}
      />

      {/* Stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full animate-pulse"
            style={{
              width: i % 3 === 0 ? '2px' : '1px',
              height: i % 3 === 0 ? '2px' : '1px',
              backgroundColor: `rgba(255,255,255,${0.3 + (i % 4) * 0.15})`,
              left: `${(i * 37 + 13) % 100}%`,
              top: `${(i * 23 + 7) % 55}%`,
              animationDelay: `${i * 0.25}s`,
              animationDuration: `${2 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Moon */}
        <div className="text-3xl mb-1" style={{ filter: 'drop-shadow(0 0 20px rgba(200,200,255,0.3))' }}>
          {'\uD83C\uDF19'}
        </div>

        <h2 className="text-[12px] font-pixel text-text-light/90 tracking-[0.2em] uppercase">
          Gece Eylemi
        </h2>

        {/* Action cards — tarot style */}
        <div className="flex gap-5">
          {nightMoves.map((move) => {
            const isSelected = selectedAction === move.id

            return (
              <button
                key={move.id}
                onClick={() => handleSelectAction(move.id)}
                className="w-[140px] h-[200px] flex flex-col items-center justify-center gap-3 p-4 cursor-pointer transition-all duration-300 rounded-lg"
                style={{
                  border: isSelected
                    ? '1px solid rgba(100,150,255,0.6)'
                    : '1px solid rgba(107,107,107,0.25)',
                  backgroundColor: isSelected
                    ? 'rgba(20,40,80,0.8)'
                    : 'rgba(10,15,30,0.8)',
                  boxShadow: isSelected
                    ? '0 0 24px rgba(100,150,255,0.2), inset 0 1px 0 rgba(100,150,255,0.1)'
                    : '0 4px 16px rgba(0,0,0,0.4)',
                  backdropFilter: 'blur(8px)',
                  transform: isSelected ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                <span className="text-3xl">{move.icon ?? '\u2728'}</span>

                <h3 className="text-[10px] font-pixel text-text-light text-center">
                  {move.label}
                </h3>

                <div className="w-10 h-px bg-gradient-to-r from-transparent via-stone/30 to-transparent" />

                <p className="text-[7px] font-pixel text-stone/80 text-center leading-relaxed">
                  {move.description}
                </p>
              </button>
            )
          })}
        </div>

        {/* Target selection */}
        {selectedAction && (
          <div className="flex flex-col items-center gap-3 mt-2">
            <span className="text-[9px] font-pixel text-stone/80 tracking-wider">
              Hedef sec:
            </span>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {players
                .filter((p) => p.alive)
                .map((p) => (
                  <button
                    key={p.slot_id}
                    onClick={() => handleSelectTarget(p.name)}
                    className="px-4 py-1.5 text-[8px] font-pixel rounded transition-all duration-200"
                    style={{
                      border: selectedTarget === p.name
                        ? '1px solid rgba(100,150,255,0.6)'
                        : '1px solid rgba(107,107,107,0.25)',
                      backgroundColor: selectedTarget === p.name
                        ? 'rgba(20,40,80,0.7)'
                        : 'rgba(20,20,40,0.6)',
                      color: selectedTarget === p.name
                        ? '#e0e8ff'
                        : 'rgba(168,168,168,0.8)',
                    }}
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            <button
              onClick={handleConfirm}
              disabled={!selectedTarget}
              className="mt-3 px-8 py-2.5 text-[10px] font-pixel uppercase tracking-wider rounded transition-all duration-200"
              style={{
                border: selectedTarget
                  ? '1px solid rgba(100,150,255,0.5)'
                  : '1px solid rgba(107,107,107,0.2)',
                backgroundColor: selectedTarget
                  ? 'rgba(20,40,80,0.7)'
                  : 'rgba(20,20,40,0.4)',
                color: selectedTarget
                  ? '#e0e8ff'
                  : 'rgba(168,168,168,0.4)',
                cursor: selectedTarget ? 'pointer' : 'not-allowed',
                boxShadow: selectedTarget
                  ? '0 0 16px rgba(100,150,255,0.15)'
                  : 'none',
              }}
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
