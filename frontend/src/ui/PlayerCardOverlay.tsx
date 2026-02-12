import React from 'react'
import { useGameStore } from '../state/GameStore'

export const PlayerCardOverlay: React.FC = () => {
  const inspectedPlayer = useGameStore((s) => s.inspectedPlayer)
  const players = useGameStore((s) => s.players)
  const setInspectedPlayer = useGameStore((s) => s.setInspectedPlayer)
  const playerLocations = useGameStore((s) => s.playerLocations)

  if (!inspectedPlayer) return null

  const player = players.find((p) => p.name === inspectedPlayer)
  if (!player) return null

  const location = playerLocations[player.name]
  const locationLabel = !location || location === 'campfire'
    ? 'Ocak Basi'
    : location === 'home'
      ? 'Evinde'
      : location.startsWith('visiting:')
        ? `${location.split(':')[1]}'in evinde`
        : location.startsWith('institution:')
          ? 'Kurumda'
          : location

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => setInspectedPlayer(null)}
      />

      {/* Card */}
      <div className="relative z-10 border-2 border-wood/60 bg-bg-dark/95 shadow-2xl shadow-black/60 w-[300px] max-h-[80vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={() => setInspectedPlayer(null)}
          className="absolute top-2 right-2 text-stone hover:text-text-light text-[14px] font-pixel z-10"
        >
          X
        </button>

        {/* Avatar header */}
        <div className="flex flex-col items-center pt-4 pb-3 border-b border-wood/30 bg-[#1a1208]/60">
          {player.avatar_url ? (
            <img
              src={player.avatar_url}
              alt={player.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-wood/50 shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-wood/20 border-2 border-wood/50 flex items-center justify-center">
              <span className="text-2xl font-pixel text-text-gold font-bold">
                {player.name.charAt(0)}
              </span>
            </div>
          )}
          <h2 className="text-text-gold text-[14px] font-pixel font-bold mt-2">
            {player.name}
          </h2>
          <p className="text-text-light text-[10px] font-pixel">
            {player.role_title}
          </p>
          {player.archetype_label && (
            <p className="text-fire-orange text-[9px] font-pixel mt-0.5">
              {player.archetype_label}
            </p>
          )}
          {player.institution_label && (
            <p className="text-stone text-[9px] font-pixel mt-0.5">
              {player.institution_label}
            </p>
          )}
        </div>

        {/* Info sections */}
        <div className="px-4 py-3 space-y-3">
          {/* Lore */}
          {player.lore && (
            <div>
              <p className="text-stone text-[8px] font-pixel mb-0.5">Gecmis</p>
              <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2 border-l-2 border-text-gold/30">
                {player.lore}
              </p>
            </div>
          )}

          {/* Status + Location row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-stone text-[9px] font-pixel">Durum</span>
              <span className={`text-[9px] font-pixel font-bold ${player.alive ? 'text-green-400' : 'text-accent-red'}`}>
                {player.alive ? 'Hayatta' : 'Olum'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone text-[9px] font-pixel">Konum</span>
              <span className="text-text-light text-[9px] font-pixel">
                {locationLabel}
              </span>
            </div>
          </div>

          {/* Public tick — speaking habit */}
          {player.public_tick && (
            <div>
              <p className="text-stone text-[8px] font-pixel mb-0.5">Konusma Aliskanligi</p>
              <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2 border-l-2 border-wood/30">
                {player.public_tick}
              </p>
            </div>
          )}

          {/* Alibi anchor — daily routine */}
          {player.alibi_anchor && (
            <div>
              <p className="text-stone text-[8px] font-pixel mb-0.5">Gunluk Rutin</p>
              <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2 border-l-2 border-wood/30">
                {player.alibi_anchor}
              </p>
            </div>
          )}

          {/* Speech color — tone */}
          {player.speech_color && (
            <div>
              <p className="text-stone text-[8px] font-pixel mb-0.5">Konusma Tarzi</p>
              <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2 border-l-2 border-wood/30">
                {player.speech_color}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default PlayerCardOverlay
