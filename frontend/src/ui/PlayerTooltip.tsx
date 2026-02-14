import React from 'react'
import type { Player } from '../state/types'

interface PlayerTooltipProps {
  player: Player
  x: number
  y: number
}

export const PlayerTooltip: React.FC<PlayerTooltipProps> = ({
  player,
  x,
  y,
}) => {
  return (
    <div
      className="absolute z-50 pointer-events-none"
      style={{
        left: x + 12,
        top: y - 8,
      }}
    >
      <div
        className="px-3 py-2.5 min-w-[120px] rounded-lg backdrop-blur-md"
        style={{
          backgroundColor: 'rgba(18,14,6,0.95)',
          border: '1px solid rgba(139,94,60,0.35)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        {/* Player name */}
        <div className="flex items-center gap-2 mb-1.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: player.alive
                ? (player.color ?? '#4ac850')
                : '#6B6B6B',
              boxShadow: player.alive ? `0 0 6px ${player.color ?? '#4ac850'}40` : 'none',
            }}
          />
          <span
            className="text-text-gold text-[10px] font-pixel font-bold"
            style={{ textShadow: '0 0 6px rgba(218,165,32,0.15)' }}
          >
            {player.name}
          </span>
        </div>

        {/* Role title */}
        {player.role_title && (
          <div className="text-text-light/80 text-[8px] font-pixel mb-0.5">
            {player.role_title}
          </div>
        )}

        {/* Institution */}
        {player.institution_label && (
          <div className="text-stone/50 text-[7px] font-pixel">
            {player.institution_label}
          </div>
        )}

        {/* Alive status */}
        <div className={`text-[7px] font-pixel mt-1.5 ${player.alive ? 'text-green-400/80' : 'text-red-400/80'}`}>
          {player.alive ? 'Hayatta' : 'Olum'}
        </div>
      </div>
    </div>
  )
}

export default PlayerTooltip
