import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'

export const GameOverScene: React.FC = () => {
  const { winner, players, allPlayersReveal } = useGame()
  const [showTitle, setShowTitle] = useState(false)
  const [showTable, setShowTable] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setShowTitle(true), 500)
    const t2 = setTimeout(() => setShowTable(true), 2000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  const isEtCan = winner === 'et_can'
  const winnerLabel = isEtCan ? 'ET-CANLAR KAZANDI!' : 'YANKI-DOGMUSLAR KAZANDI!'
  const displayPlayers = allPlayersReveal ?? players

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-noise" />
      <div className="cf-vignette" />

      {/* Winner glow */}
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[140%] h-[80%] pointer-events-none z-0"
           style={{
             background: isEtCan
               ? 'radial-gradient(ellipse at center bottom, rgba(255,191,0,0.1) 0%, rgba(180,80,0,0.05) 35%, transparent 70%)'
               : 'radial-gradient(ellipse at center bottom, rgba(211,47,47,0.1) 0%, rgba(139,0,0,0.05) 35%, transparent 70%)',
             animation: 'glowPulse 5s ease-in-out infinite',
           }} />

      <div className="relative z-10 text-center px-6 max-w-2xl w-full">
        {/* Trophy icon */}
        <div className={`mb-4 transition-all duration-1000 ${showTitle ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full"
               style={{
                 background: isEtCan ? 'rgba(255,191,0,0.08)' : 'rgba(211,47,47,0.08)',
                 border: `1px solid ${isEtCan ? 'rgba(255,191,0,0.2)' : 'rgba(211,47,47,0.2)'}`,
                 boxShadow: isEtCan ? '0 0 40px rgba(255,191,0,0.15)' : '0 0 40px rgba(211,47,47,0.15)',
               }}>
            <span className="text-3xl">&#9813;</span>
          </div>
        </div>

        {/* Title */}
        <div className={`transition-all duration-1000 ${showTitle ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-xs uppercase tracking-[4px] text-text-secondary/30 mb-3">Oyun Bitti</p>
          <h1 className="text-4xl font-bold mb-10"
              style={{
                color: isEtCan ? '#FFBF00' : '#D32F2F',
                textShadow: isEtCan
                  ? '0 0 30px rgba(255,191,0,0.4), 0 0 80px rgba(255,191,0,0.15)'
                  : '0 0 30px rgba(211,47,47,0.4), 0 0 80px rgba(211,47,47,0.15)',
              }}>
            {winnerLabel}
          </h1>
        </div>

        {/* Score Table */}
        {showTable && (
          <div className="animate-fade-in rounded-xl overflow-hidden"
               style={{
                 background: 'rgba(255,255,255,0.02)',
                 border: '1px solid rgba(255,255,255,0.06)',
               }}>
            <table className="w-full text-left">
              <thead>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <th className="py-3 px-4 text-[10px] uppercase tracking-[2px] text-text-secondary/40 font-semibold">Tip</th>
                  <th className="py-3 px-4 text-[10px] uppercase tracking-[2px] text-text-secondary/40 font-semibold">Isim</th>
                  <th className="py-3 px-4 text-[10px] uppercase tracking-[2px] text-text-secondary/40 font-semibold">Rol</th>
                  <th className="py-3 px-4 text-[10px] uppercase tracking-[2px] text-text-secondary/40 font-semibold text-right">Durum</th>
                </tr>
              </thead>
              <tbody>
                {displayPlayers.map((p, i) => {
                  const isYanki = p.playerType === 'yanki_dogmus'
                  const typeLabel = isYanki ? 'YANKI' : 'ET-CAN'
                  const status = p.alive ? 'HAYATTA' : `SURGUN (Gun ${p.exiledRound ?? '?'})`
                  return (
                    <tr key={p.id}
                        className="transition-all duration-300"
                        style={{
                          borderBottom: '1px solid rgba(255,255,255,0.03)',
                          animationDelay: `${i * 100}ms`,
                        }}>
                      <td className="py-3 px-4">
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
                              style={{
                                background: isYanki ? 'rgba(211,47,47,0.1)' : 'rgba(255,191,0,0.1)',
                                color: isYanki ? '#D32F2F' : '#FFBF00',
                                border: `1px solid ${isYanki ? 'rgba(211,47,47,0.2)' : 'rgba(255,191,0,0.2)'}`,
                              }}>
                          {typeLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full shrink-0"
                               style={{
                                 backgroundColor: p.avatarColor,
                                 border: '1px solid rgba(255,255,255,0.1)',
                               }} />
                          <span className="text-sm text-text-primary font-medium">{p.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm text-text-secondary/60">{p.roleTitle}</td>
                      <td className="py-3 px-4 text-right">
                        <span className={`text-xs font-semibold ${p.alive ? 'text-success' : 'text-text-secondary/30'}`}>
                          {status}
                        </span>
                      </td>
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
