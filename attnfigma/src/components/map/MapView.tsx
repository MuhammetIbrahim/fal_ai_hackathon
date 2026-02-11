import React from 'react'
import { useGame } from '../../context/GameContext'

const LOCATIONS = [
  { id: 'campfire', label: 'Ocak Meydani', icon: '🔥', x: 50, y: 50 },
  { id: 'kiler', label: 'Kiler', icon: '🗝️', x: 20, y: 30 },
  { id: 'gecit_kulesi', label: 'Gecit Kulesi', icon: '🏰', x: 80, y: 20 },
  { id: 'kul_tapinagi', label: 'Kul Tapinagi', icon: '🕯️', x: 30, y: 75 },
  { id: 'sifahane', label: 'Sifahane', icon: '⚕️', x: 70, y: 75 },
  { id: 'demirhane', label: 'Demirhane', icon: '⚒️', x: 15, y: 55 },
  { id: 'gezgin_hani', label: 'Gezgin Hani', icon: '🍺', x: 85, y: 50 },
  { id: 'sis_hatti', label: 'Sis Hatti', icon: '🌫️', x: 50, y: 10 },
]

interface MapViewProps {
  activeLocations?: string[]
  playerLocations?: Record<string, string>
  compact?: boolean
}

export const MapView: React.FC<MapViewProps> = ({
  activeLocations = ['campfire'],
  playerLocations = {},
  compact = false,
}) => {
  const { players } = useGame()

  // Group players by location
  const locationPlayers: Record<string, string[]> = {}
  for (const [name, loc] of Object.entries(playerLocations)) {
    const locId = loc.startsWith('institution:') ? loc.replace('institution:', '') : loc
    if (!locationPlayers[locId]) locationPlayers[locId] = []
    locationPlayers[locId].push(name)
  }

  const size = compact ? 'w-64 h-48' : 'w-full max-w-2xl h-80'

  return (
    <div className={`relative ${size} mx-auto rounded-xl overflow-hidden`}
         style={{
           background: 'rgba(5,3,2,0.8)',
           border: '1px solid rgba(255,255,255,0.06)',
         }}>
      {/* Grid lines */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        {/* Connection lines from campfire to all locations */}
        {LOCATIONS.filter(l => l.id !== 'campfire').map(loc => (
          <line key={loc.id}
            x1="50" y1="50" x2={loc.x} y2={loc.y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="0.3"
            strokeDasharray="2,2"
          />
        ))}
      </svg>

      {/* Locations */}
      {LOCATIONS.map(loc => {
        const isActive = activeLocations.includes(loc.id)
        const playersHere = locationPlayers[loc.id] ?? []
        const hasPlayers = playersHere.length > 0

        return (
          <div key={loc.id}
               className="absolute flex flex-col items-center transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
               style={{
                 left: `${loc.x}%`,
                 top: `${loc.y}%`,
                 opacity: isActive || hasPlayers ? 1 : 0.3,
                 filter: isActive ? 'none' : 'grayscale(0.8)',
               }}>
            <span className={`${compact ? 'text-sm' : 'text-lg'} transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                  style={{
                    filter: isActive ? 'drop-shadow(0 0 4px rgba(255,191,0,0.4))' : 'none',
                  }}>
              {loc.icon}
            </span>
            <span className={`${compact ? 'text-[7px]' : 'text-[9px]'} text-text-secondary/50 mt-0.5 whitespace-nowrap font-medium`}>
              {loc.label}
            </span>
            {/* Player dots */}
            {hasPlayers && (
              <div className="flex gap-0.5 mt-0.5">
                {playersHere.slice(0, 4).map(name => {
                  const player = players.find(p => p.name === name)
                  return (
                    <div key={name}
                         className="w-2 h-2 rounded-full"
                         style={{
                           backgroundColor: player?.avatarColor ?? '#666',
                           boxShadow: `0 0 3px ${player?.avatarColor ?? '#666'}55`,
                         }}
                         title={name}
                    />
                  )
                })}
                {playersHere.length > 4 && (
                  <span className="text-[7px] text-text-secondary/40">+{playersHere.length - 4}</span>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Label */}
      <div className="absolute bottom-1 right-2">
        <span className="text-[8px] text-text-secondary/20 uppercase tracking-wider">Harita</span>
      </div>
    </div>
  )
}
