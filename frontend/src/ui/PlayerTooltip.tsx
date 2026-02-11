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
      <div className="border-4 border-stone bg-bg-dark/95 px-3 py-2 shadow-lg shadow-black/50 min-w-[120px]">
        {/* Player name */}
        <div className="flex items-center gap-2 mb-1">
          <div
            className={`w-2 h-2 rounded-full ${player.alive ? 'bg-green-400' : 'bg-accent-red'}`}
            style={player.color ? { backgroundColor: player.alive ? player.color : undefined } : undefined}
          />
          <span className="text-text-gold text-[10px] font-pixel font-bold">
            {player.name}
          </span>
        </div>

        {/* Role title */}
        {player.role_title && (
          <div className="text-text-light text-[8px] font-pixel mb-0.5">
            {player.role_title}
          </div>
        )}

        {/* Institution */}
        {player.institution_label && (
          <div className="text-stone text-[7px] font-pixel">
            {player.institution_label}
          </div>
        )}

        {/* Alive status */}
        <div className={`text-[7px] font-pixel mt-1 ${player.alive ? 'text-green-400' : 'text-accent-red'}`}>
          {player.alive ? 'Hayatta' : 'Olum'}
        </div>
      </div>
    </div>
  )
}

export default PlayerTooltip
