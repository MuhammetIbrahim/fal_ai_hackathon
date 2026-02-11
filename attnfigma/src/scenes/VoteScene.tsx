import React, { useState, useEffect, useMemo } from 'react'
import { useGame } from '../context/GameContext'

export const VoteScene: React.FC = () => {
  const { votes, players, inputRequired, sendVote, baskisiTarget, canUseKalkan, sendKalkan } = useGame()

  const canVote = inputRequired?.type === 'vote'
  const alivePlayers = players.filter(p => p.alive)
  const selfName = players.find(p => p.id === 'P0')?.name

  // Animate votes appearing one by one
  const [visibleCount, setVisibleCount] = useState(0)

  useEffect(() => {
    setVisibleCount(0)
  }, [votes.length === 0])

  useEffect(() => {
    if (votes.length > 0 && visibleCount < votes.length) {
      const t = setTimeout(() => setVisibleCount(c => c + 1), 800)
      return () => clearTimeout(t)
    }
  }, [visibleCount, votes.length])

  // Tally
  const tally = useMemo(() => {
    const counts: Record<string, number> = {}
    votes.slice(0, visibleCount).forEach(v => {
      counts[v.target] = (counts[v.target] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [votes, visibleCount])

  const maxVote = tally.length > 0 ? tally[0][1] : 0
  const allDone = visibleCount >= votes.length && votes.length > 0

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Red glow for vote scene */}
      <div className="absolute bottom-[-20%] left-1/2 -translate-x-1/2 w-[140%] h-[80%] pointer-events-none z-0"
           style={{
             background: 'radial-gradient(ellipse at center bottom, rgba(211,47,47,0.08) 0%, rgba(139,0,0,0.04) 35%, transparent 70%)',
             animation: 'glowPulse 6s ease-in-out infinite',
           }} />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
               style={{
                 background: 'rgba(211,47,47,0.08)',
                 border: '1px solid rgba(211,47,47,0.15)',
                 boxShadow: '0 0 30px rgba(211,47,47,0.1)',
               }}>
            <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(211,47,47,0.5))' }}>&#9878;</span>
          </div>
          <p className="text-xs uppercase tracking-[4px] text-warden-alert/60 mb-2 font-semibold">Surgun Oylama</p>
          <p className="text-sm text-text-secondary/60">
            {canVote ? 'Kimi surgun etmek istiyorsun?' : 'Herkes birini surgun icin seciyor...'}
          </p>
        </div>

        {/* Baskı Badge */}
        {baskisiTarget && (
          <div className="flex items-center justify-center gap-2 mb-4 px-4 py-2 rounded-lg animate-fade-in"
               style={{
                 background: 'rgba(211,47,47,0.06)',
                 border: '1px solid rgba(211,47,47,0.15)',
               }}>
            <span className="text-xs text-warden-alert/80">&#9888;</span>
            <span className="text-xs text-warden-alert/70 font-medium">
              {baskisiTarget} uzerinde baski var — oylari 2x sayilir
            </span>
          </div>
        )}

        {/* Kalkan Button */}
        {canUseKalkan && (
          <button
            onClick={sendKalkan}
            className="w-full flex items-center justify-center gap-2 mb-4 px-4 py-3 rounded-xl transition-all duration-200"
            style={{
              background: 'linear-gradient(135deg, rgba(100,130,200,0.1) 0%, rgba(60,90,160,0.08) 100%)',
              border: '1px solid rgba(100,130,200,0.2)',
              boxShadow: '0 0 15px rgba(100,130,200,0.1)',
            }}
          >
            <span className="text-lg">🛡️</span>
            <span className="text-sm text-[#8090cc] font-semibold">Kalkan Kullan</span>
            <span className="text-[10px] text-text-secondary/40 ml-2">(tek seferlik)</span>
          </button>
        )}

        {/* Vote UI */}
        {canVote && (
          <div className="mb-8 space-y-2">
            {alivePlayers
              .filter(p => p.name !== selfName)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => sendVote(p.name)}
                  className="group w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.background = 'rgba(211,47,47,0.06)'
                    e.currentTarget.style.borderColor = 'rgba(211,47,47,0.2)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                  }}
                >
                  <div
                    className="w-9 h-9 rounded-full shrink-0 transition-all duration-200"
                    style={{
                      backgroundColor: p.avatarColor,
                      border: '2px solid rgba(255,255,255,0.1)',
                      boxShadow: `0 0 10px ${p.avatarColor}33`,
                    }}
                  />
                  <span className="text-sm text-text-primary font-medium">{p.name}</span>
                  {baskisiTarget === p.name && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-warden-alert/10 text-warden-alert/70 font-mono">x2</span>
                  )}
                  <span className="text-xs text-text-secondary/50 ml-auto">{p.roleTitle}</span>
                </button>
              ))
            }
          </div>
        )}

        {/* Votes display */}
        {votes.length > 0 && (
          <div className="space-y-2 mb-8">
            {votes.slice(0, visibleCount).map((vote, i) => {
              const voterPlayer = players.find(p => p.name === vote.voter)
              return (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg animate-fade-in"
                     style={{ background: 'rgba(255,255,255,0.02)' }}>
                  <div
                    className="w-7 h-7 rounded-full shrink-0"
                    style={{
                      backgroundColor: voterPlayer?.avatarColor ?? '#555',
                      border: '2px solid rgba(255,255,255,0.08)',
                    }}
                  />
                  <span className="text-sm text-text-primary/80 w-24 shrink-0">{vote.voter}</span>
                  <span className="text-warden-alert/40 text-xs tracking-widest">&#10230;</span>
                  <span className="text-sm text-warden-alert font-semibold">{vote.target}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Tally */}
        {tally.length > 0 && (
          <div className="pt-4 space-y-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] uppercase tracking-[3px] text-text-secondary/50 mb-3 font-semibold">Sonuc</p>
            {tally.map(([name, count]) => {
              const isLeader = allDone && count === maxVote
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className={`text-sm w-24 shrink-0 ${isLeader ? 'text-warden-alert font-bold' : 'text-text-primary/70'}`}>
                    {name}
                  </span>
                  <div className="flex-1 h-7 rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <div
                      className="h-full rounded-lg transition-all duration-700 ease-out"
                      style={{
                        width: `${(count / votes.length) * 100}%`,
                        background: isLeader
                          ? 'linear-gradient(90deg, rgba(211,47,47,0.5) 0%, rgba(211,47,47,0.3) 100%)'
                          : 'linear-gradient(90deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
                        boxShadow: isLeader ? '0 0 15px rgba(211,47,47,0.2)' : 'none',
                      }}
                    />
                  </div>
                  <span className={`text-sm w-6 text-right font-mono ${isLeader ? 'text-warden-alert' : 'text-text-secondary/50'}`}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Waiting */}
        {votes.length === 0 && !canVote && (
          <div className="text-center flex flex-col items-center gap-4">
            <div className="w-6 h-6 border-2 border-warden-alert/20 border-t-warden-alert/50 rounded-full animate-spin" />
            <p className="text-sm text-text-secondary/40">Oylar bekleniyor...</p>
          </div>
        )}
      </div>
    </div>
  )
}
