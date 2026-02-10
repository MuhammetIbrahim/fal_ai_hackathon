import React, { useState, useEffect, useMemo } from 'react'
import { useGame } from '../context/GameContext'

export const VoteScene: React.FC = () => {
  const { votes, players, inputRequired, sendVote } = useGame()

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
      <div className="cf-glow" />
      <div className="cf-vignette" />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[3px] text-warden-alert/70 mb-2">Oylama</p>
          <p className="text-sm text-text-secondary">
            {canVote ? 'Kimi surgun etmek istiyorsun?' : 'Herkes birini surgun icin seciyor...'}
          </p>
        </div>

        {/* Vote UI */}
        {canVote && (
          <div className="mb-8 space-y-2">
            {alivePlayers
              .filter(p => p.name !== selfName)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => sendVote(p.name)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:border-warden-alert/30 hover:bg-warden-alert/5 transition-all"
                >
                  <div
                    className="w-8 h-8 rounded-full shrink-0 border-2 border-white/10"
                    style={{ backgroundColor: p.avatarColor }}
                  />
                  <span className="text-sm text-text-primary">{p.name}</span>
                  <span className="text-xs text-text-secondary ml-auto">{p.roleTitle}</span>
                </button>
              ))
            }
          </div>
        )}

        {/* Votes display */}
        {votes.length > 0 && (
          <div className="space-y-3 mb-8">
            {votes.slice(0, visibleCount).map((vote, i) => {
              const voterPlayer = players.find(p => p.name === vote.voter)
              return (
                <div key={i} className="flex items-center gap-3 animate-fade-in">
                  <div
                    className="w-8 h-8 rounded-full shrink-0 border-2 border-white/10"
                    style={{ backgroundColor: voterPlayer?.avatarColor ?? '#555' }}
                  />
                  <span className="text-sm text-text-primary w-24 shrink-0">{vote.voter}</span>
                  <span className="text-text-secondary text-xs">&rarr;</span>
                  <span className="text-sm text-warden-alert font-semibold">{vote.target}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* Tally */}
        {tally.length > 0 && (
          <div className="border-t border-white/8 pt-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-text-secondary mb-3">Sonuc</p>
            {tally.map(([name, count]) => (
              <div key={name} className="flex items-center gap-3">
                <span className={`text-sm w-24 shrink-0 ${allDone && count === maxVote ? 'text-warden-alert font-bold' : 'text-text-primary'}`}>
                  {name}
                </span>
                <div className="flex-1 h-6 bg-white/5 rounded overflow-hidden">
                  <div
                    className={`h-full rounded transition-all duration-500 ${allDone && count === maxVote ? 'bg-warden-alert/60' : 'bg-white/15'}`}
                    style={{ width: `${(count / votes.length) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-text-secondary w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}

        {/* Waiting */}
        {votes.length === 0 && !canVote && (
          <div className="text-center">
            <p className="text-sm text-text-secondary/50 animate-pulse">Oylar bekleniyor...</p>
          </div>
        )}
      </div>
    </div>
  )
}
