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
      <div className="cf-noise" />

      {/* Header */}
      <div className="relative z-10 pt-6 pb-4 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full mb-3"
             style={{
               background: 'rgba(255,191,0,0.06)',
               border: '1px solid rgba(255,191,0,0.12)',
             }}>
          <span className="text-xl" style={{ filter: 'drop-shadow(0 0 4px rgba(255,191,0,0.4))' }}>&#127760;</span>
        </div>
        <p className="text-xs uppercase tracking-[4px] text-accent/60 mb-2 font-semibold">Serbest Dolasim</p>
        <p className="text-sm text-text-secondary/50">
          {canChoose ? 'Nereye gitmek istiyorsun?' : 'Herkes konumunu seciyor...'}
        </p>
      </div>

      {/* Location Choice UI */}
      {canChoose && (
        <div className="relative z-10 px-6 pb-4">
          <div className="max-w-md mx-auto space-y-3">
            <button
              onClick={() => handleChoice('CAMPFIRE')}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl transition-all duration-200"
              style={{
                background: 'linear-gradient(135deg, rgba(255,191,0,0.08) 0%, rgba(180,80,0,0.06) 100%)',
                border: '1px solid rgba(255,191,0,0.15)',
              }}
            >
              <span className="text-lg" style={{ filter: 'drop-shadow(0 0 4px rgba(255,140,0,0.5))' }}>&#128293;</span>
              <div className="text-left">
                <p className="text-sm font-semibold text-accent">Ates Basinda Kal</p>
                <p className="text-xs text-text-secondary/40">Herkesin gozunun onunde tartis</p>
              </div>
            </button>

            <button
              onClick={() => handleChoice('HOME')}
              className="w-full flex items-center gap-3 px-5 py-4 rounded-xl transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <span className="text-lg opacity-60">&#127968;</span>
              <div className="text-left">
                <p className="text-sm font-medium text-text-primary/80">Evine Cekil</p>
                <p className="text-xs text-text-secondary/40">Sessizce dinlen, gozlem yap</p>
              </div>
            </button>

            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-3 px-5 py-4 rounded-xl"
                   style={{
                     background: 'rgba(255,255,255,0.03)',
                     border: '1px solid rgba(255,255,255,0.06)',
                   }}>
                <span className="text-lg opacity-60">&#128694;</span>
                <select
                  value={selectedTarget}
                  onChange={(e) => setSelectedTarget(e.target.value)}
                  className="flex-1 bg-transparent text-text-primary text-sm focus:outline-none appearance-none cursor-pointer"
                  style={{ color: selectedTarget ? undefined : 'rgba(160,160,160,0.5)' }}
                >
                  <option value="" style={{ background: '#1a1512' }}>Ziyaret edilecek kisi...</option>
                  {alivePlayers
                    .filter(p => p.id !== 'P0')
                    .map(p => (
                      <option key={p.id} value={p.name} style={{ background: '#1a1512' }}>{p.name} — {p.roleTitle}</option>
                    ))
                  }
                </select>
              </div>
              <button
                onClick={() => selectedTarget && handleChoice(`VISIT|${selectedTarget}`)}
                disabled={!selectedTarget}
                className="px-5 py-4 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-20"
                style={{
                  background: selectedTarget ? 'rgba(255,191,0,0.1)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${selectedTarget ? 'rgba(255,191,0,0.2)' : 'rgba(255,255,255,0.04)'}`,
                  color: '#FFBF00',
                }}
              >
                Git
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Decisions Grid */}
      {decisions.length > 0 && (
        <div className="relative z-10 flex-1 grid grid-cols-3 gap-4 px-6 pb-6 max-w-4xl mx-auto w-full min-h-0 overflow-y-auto">
          {/* Ates Basi */}
          <div className="flex flex-col items-center">
            <div className="mb-3 flex flex-col items-center">
              <span className="text-2xl mb-1" style={{ filter: 'drop-shadow(0 0 6px rgba(255,140,0,0.5))' }}>&#128293;</span>
              <p className="text-xs font-semibold text-accent/70 tracking-wider uppercase">Ates Basi</p>
              <p className="text-[10px] text-text-secondary/30">{campfirePlayers.length} kisi</p>
            </div>
            <div className="space-y-1.5 w-full">
              {campfirePlayers.map(d => {
                const player = players.find(p => p.name === d.playerName)
                return (
                  <div key={d.playerName} className="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in"
                       style={{ background: 'rgba(255,191,0,0.04)', border: '1px solid rgba(255,191,0,0.08)' }}>
                    {player && <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: player.avatarColor, border: '1px solid rgba(255,255,255,0.1)' }} />}
                    <span className="text-xs text-text-primary/80">{d.playerName}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Hareket Duyurulari */}
          <div className="flex flex-col items-center pt-8">
            <p className="text-[10px] uppercase tracking-[2px] text-text-secondary/30 mb-3 font-semibold">Hareketler</p>
            <div className="space-y-2 w-full">
              {decisions.map(d => (
                <p key={d.playerName} className="text-[11px] text-text-secondary/50 text-center leading-relaxed animate-fade-in">
                  {d.displayText}
                </p>
              ))}
            </div>
          </div>

          {/* Evler */}
          <div className="flex flex-col items-center">
            <div className="mb-3 flex flex-col items-center">
              <span className="text-2xl mb-1 opacity-50">&#127968;</span>
              <p className="text-xs font-semibold text-text-secondary/50 tracking-wider uppercase">Evler</p>
              <p className="text-[10px] text-text-secondary/30">{homePlayers.length + visitors.length} kisi</p>
            </div>
            <div className="space-y-1.5 w-full">
              {homePlayers.map(d => {
                const player = players.find(p => p.name === d.playerName)
                return (
                  <div key={d.playerName} className="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in"
                       style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                    {player && <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: player.avatarColor, border: '1px solid rgba(255,255,255,0.1)' }} />}
                    <span className="text-xs text-text-primary/60">{d.playerName}</span>
                    <span className="text-[10px] text-text-secondary/30 ml-auto">evde</span>
                  </div>
                )
              })}
              {visitors.map(d => {
                const target = d.choice.replace('VISIT|', '')
                const player = players.find(p => p.name === d.playerName)
                return (
                  <div key={d.playerName} className="flex items-center gap-2 px-3 py-2 rounded-lg animate-fade-in"
                       style={{ background: 'rgba(255,191,0,0.03)', border: '1px solid rgba(255,191,0,0.08)' }}>
                    {player && <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: player.avatarColor, border: '1px solid rgba(255,255,255,0.1)' }} />}
                    <span className="text-xs text-accent/70">{d.playerName}</span>
                    <span className="text-[10px] text-text-secondary/30 mx-1">&#8594;</span>
                    <span className="text-xs text-accent/50">{target}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Waiting */}
      {decisions.length === 0 && !canChoose && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-4">
          <div className="w-6 h-6 border-2 border-accent/20 border-t-accent/50 rounded-full animate-spin" />
          <p className="text-sm text-text-secondary/40">Kararlar bekleniyor...</p>
        </div>
      )}
    </div>
  )
}
