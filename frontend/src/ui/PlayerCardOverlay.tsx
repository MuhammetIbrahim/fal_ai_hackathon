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
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setInspectedPlayer(null)}
      />

      {/* Card */}
      <div
        className="relative z-10 w-[300px] max-h-[80vh] overflow-y-auto rounded-lg"
        style={{
          background: 'linear-gradient(180deg, #1a1208 0%, #14100a 50%, #0f0b06 100%)',
          border: '1px solid rgba(139,94,60,0.4)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6), inset 0 1px 0 rgba(218,165,32,0.1)',
        }}
      >
        {/* Top accent */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-text-gold/40 to-transparent" />

        {/* Close button */}
        <button
          onClick={() => setInspectedPlayer(null)}
          className="absolute top-3 right-3 text-stone/60 hover:text-text-light text-[12px] font-pixel z-10 w-6 h-6 flex items-center justify-center rounded transition-colors"
          style={{ border: '1px solid rgba(107,107,107,0.2)' }}
        >
          X
        </button>

        {/* Avatar header */}
        <div
          className="flex flex-col items-center pt-5 pb-4"
          style={{ borderBottom: '1px solid rgba(139,94,60,0.2)' }}
        >
          {player.avatar_url ? (
            <img
              src={player.avatar_url}
              alt={player.name}
              className="w-20 h-20 rounded-full object-cover"
              style={{
                border: '2px solid rgba(139,94,60,0.4)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                backgroundColor: 'rgba(139,94,60,0.15)',
                border: '2px solid rgba(139,94,60,0.4)',
              }}
            >
              <span className="text-2xl font-pixel text-text-gold font-bold">
                {player.name.charAt(0)}
              </span>
            </div>
          )}
          <h2
            className="text-text-gold text-[14px] font-pixel font-bold mt-3"
            style={{ textShadow: '0 0 8px rgba(218,165,32,0.2)' }}
          >
            {player.name}
          </h2>
          <p className="text-text-light/80 text-[10px] font-pixel mt-0.5">
            {player.role_title}
          </p>
          {player.archetype_label && (
            <p className="text-fire-orange/80 text-[9px] font-pixel mt-0.5">
              {player.archetype_label}
            </p>
          )}
          {player.institution_label && (
            <p className="text-stone/60 text-[9px] font-pixel mt-0.5">
              {player.institution_label}
            </p>
          )}
        </div>

        {/* Info sections */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Lore */}
          {player.lore && (
            <div>
              <p className="text-stone/60 text-[8px] font-pixel mb-1 tracking-wider uppercase">Gecmis</p>
              <p
                className="text-text-light/80 text-[9px] font-pixel leading-relaxed pl-2.5"
                style={{ borderLeft: '2px solid rgba(218,165,32,0.2)' }}
              >
                {player.lore}
              </p>
            </div>
          )}

          {/* Status + Location */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-stone/60 text-[9px] font-pixel">Durum</span>
              <span className={`text-[9px] font-pixel font-bold ${player.alive ? 'text-green-400' : 'text-red-400'}`}>
                {player.alive ? 'Hayatta' : 'Olum'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-stone/60 text-[9px] font-pixel">Konum</span>
              <span className="text-text-light/70 text-[9px] font-pixel">
                {locationLabel}
              </span>
            </div>
          </div>

          {/* Public tick */}
          {player.public_tick && (
            <div>
              <p className="text-stone/60 text-[8px] font-pixel mb-1 tracking-wider uppercase">Konusma Aliskanligi</p>
              <p
                className="text-text-light/70 text-[9px] font-pixel leading-relaxed pl-2.5"
                style={{ borderLeft: '2px solid rgba(139,94,60,0.2)' }}
              >
                {player.public_tick}
              </p>
            </div>
          )}

          {/* Alibi anchor */}
          {player.alibi_anchor && (
            <div>
              <p className="text-stone/60 text-[8px] font-pixel mb-1 tracking-wider uppercase">Gunluk Rutin</p>
              <p
                className="text-text-light/70 text-[9px] font-pixel leading-relaxed pl-2.5"
                style={{ borderLeft: '2px solid rgba(139,94,60,0.2)' }}
              >
                {player.alibi_anchor}
              </p>
            </div>
          )}

          {/* Speech color */}
          {player.speech_color && (
            <div>
              <p className="text-stone/60 text-[8px] font-pixel mb-1 tracking-wider uppercase">Konusma Tarzi</p>
              <p
                className="text-text-light/70 text-[9px] font-pixel leading-relaxed pl-2.5"
                style={{ borderLeft: '2px solid rgba(139,94,60,0.2)' }}
              >
                {player.speech_color}
              </p>
            </div>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-px bg-gradient-to-r from-transparent via-wood/20 to-transparent" />
      </div>
    </div>
  )
}

export default PlayerCardOverlay
