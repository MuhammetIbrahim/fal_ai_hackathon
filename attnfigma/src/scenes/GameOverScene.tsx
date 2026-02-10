import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const GameOverScene: React.FC = () => {
  const { winner, players, allPlayersReveal } = useGame()
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setShowTable(true), 2000)
    return () => clearTimeout(t)
  }, [])

  const winnerLabel = winner === 'et_can' ? 'ET-CANLAR KAZANDI!' : 'YANKI-DOGMUSLAR KAZANDI!'
  const winnerColor = winner === 'et_can' ? 'text-accent' : 'text-warden-alert'

  // Use revealed players (with true types) if available, fall back to game players
  const displayPlayers = allPlayersReveal ?? players

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-glow" />
      <div className="cf-vignette" />

      <div className="relative z-10 text-center px-6 max-w-2xl w-full">
        {/* Baslik */}
        <p className="text-xs uppercase tracking-[3px] text-text-secondary/40 mb-4">Oyun Bitti</p>
        <h1 className={`text-4xl font-bold mb-12 ${winnerColor} game-over-glow`}>
          {winnerLabel}
        </h1>

        {/* Skor Tablosu */}
        {showTable && (
          <div className="animate-fade-in">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="py-2 px-3 text-xs uppercase tracking-widest text-text-secondary">Tip</th>
                  <th className="py-2 px-3 text-xs uppercase tracking-widest text-text-secondary">Isim</th>
                  <th className="py-2 px-3 text-xs uppercase tracking-widest text-text-secondary">Rol</th>
                  <th className="py-2 px-3 text-xs uppercase tracking-widest text-text-secondary">Durum</th>
                </tr>
              </thead>
              <tbody>
                {displayPlayers.map(p => {
                  const typeLabel = p.playerType === 'yanki_dogmus' ? 'YANKI' : 'ET-CAN'
                  const typeColor = p.playerType === 'yanki_dogmus' ? 'text-warden-alert' : 'text-accent'
                  const status = p.alive ? 'HAYATTA' : `SURGUN (Gun ${p.exiledRound ?? '?'})`
                  const statusColor = p.alive ? 'text-success' : 'text-text-secondary/50'
                  return (
                    <tr key={p.id} className="border-b border-white/5">
                      <td className={`py-3 px-3 text-sm font-semibold ${typeColor}`}>{typeLabel}</td>
                      <td className="py-3 px-3 text-sm text-text-primary">{p.name}</td>
                      <td className="py-3 px-3 text-sm text-text-secondary">{p.roleTitle}</td>
                      <td className={`py-3 px-3 text-sm ${statusColor}`}>{status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
