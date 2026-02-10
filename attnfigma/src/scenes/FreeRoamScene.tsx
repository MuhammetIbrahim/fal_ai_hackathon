import React, { useState } from 'react'
import { useGame } from '../context/GameContext'

export const FreeRoamScene: React.FC = () => {
  const { locationDecisions, inputRequired, sendLocationChoice, players } = useGame()
  const [selectedTarget, setSelectedTarget] = useState('')

  const canChoose = inputRequired?.type === 'location_choice'
  const alivePlayers = players.filter(p => p.alive)
  const decisions = locationDecisions

  const campfirePlayers = decisions.filter(d => d.choice === 'CAMPFIRE')
  const homePlayers = decisions.filter(d => d.choice === 'HOME')
  const visitors = decisions.filter(d => d.choice.startsWith('VISIT'))

  const handleChoice = (choice: string) => {
    sendLocationChoice(choice)
  }

  return (
    <div className="relative flex flex-col h-screen bg-[#050302] overflow-hidden">
      <div className="cf-glow" />
      <div className="cf-vignette" />

      {/* Header */}
      <div className="relative z-10 pt-8 pb-4 text-center">
        <p className="text-xs uppercase tracking-[3px] text-accent/70 mb-2">Serbest Dolasim</p>
        <p className="text-sm text-text-secondary">
          {canChoose ? 'Nereye gitmek istiyorsun?' : 'Herkes konumunu seciyor...'}
        </p>
      </div>

      {/* Location Choice UI */}
      {canChoose && (
        <div className="relative z-10 px-8 pb-4">
          <div className="max-w-md mx-auto space-y-3">
            <button
              onClick={() => handleChoice('CAMPFIRE')}
              className="w-full px-4 py-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm font-semibold hover:bg-accent/20 transition-all"
            >
              Ates Basinda Kal
            </button>
            <button
              onClick={() => handleChoice('HOME')}
              className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-text-primary text-sm hover:bg-white/10 transition-all"
            >
              Evine Cekil
            </button>
            <div className="flex items-center gap-2">
              <select
                value={selectedTarget}
                onChange={(e) => setSelectedTarget(e.target.value)}
                className="flex-1 px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-text-primary text-sm focus:outline-none focus:border-accent/30"
              >
                <option value="">Ziyaret edilecek kisi...</option>
                {alivePlayers
                  .filter(p => p.id !== 'P0')
                  .map(p => (
                    <option key={p.id} value={p.name}>{p.name}</option>
                  ))
                }
              </select>
              <button
                onClick={() => selectedTarget && handleChoice(`VISIT|${selectedTarget}`)}
                disabled={!selectedTarget}
                className="px-4 py-3 rounded-lg bg-accent/10 border border-accent/20 text-accent text-sm font-semibold hover:bg-accent/20 transition-all disabled:opacity-30"
              >
                Ziyaret Et
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decisions Grid */}
      {decisions.length > 0 && (
        <div className="relative z-10 flex-1 grid grid-cols-3 gap-6 px-8 pb-8 max-w-4xl mx-auto w-full">
          {/* Ates Basi */}
          <div className="flex flex-col items-center">
            <div className="mb-4 text-center">
              <span className="text-accent text-lg">&#128293;</span>
              <p className="text-sm font-semibold text-accent mt-1">Ates Basi</p>
            </div>
            <div className="space-y-2 w-full">
              {campfirePlayers.map(d => (
                <div key={d.playerName} className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm text-text-primary text-center animate-fade-in">
                  {d.playerName}
                </div>
              ))}
            </div>
          </div>

          {/* Hareket Duyurulari */}
          <div className="flex flex-col items-center justify-center">
            <div className="space-y-3 w-full">
              {decisions.map(d => (
                <p key={d.playerName} className="text-xs text-text-secondary/80 text-center italic animate-fade-in">
                  {d.displayText}
                </p>
              ))}
            </div>
          </div>

          {/* Evler */}
          <div className="flex flex-col items-center">
            <div className="mb-4 text-center">
              <span className="text-text-secondary text-lg">&#127968;</span>
              <p className="text-sm font-semibold text-text-secondary mt-1">Evler</p>
            </div>
            <div className="space-y-2 w-full">
              {homePlayers.map(d => (
                <div key={d.playerName} className="px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm text-text-primary text-center animate-fade-in">
                  {d.playerName} <span className="text-text-secondary text-xs">(evde)</span>
                </div>
              ))}
              {visitors.map(d => {
                const target = d.choice.replace('VISIT|', '')
                return (
                  <div key={d.playerName} className="px-3 py-2 rounded-lg bg-accent/10 border border-accent/20 text-sm text-accent text-center animate-fade-in">
                    {d.playerName} &rarr; {target}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Waiting */}
      {decisions.length === 0 && !canChoose && (
        <div className="relative z-10 flex-1 flex items-center justify-center">
          <p className="text-sm text-text-secondary/50 animate-pulse">Kararlar bekleniyor...</p>
        </div>
      )}
    </div>
  )
}
