import React, { useState, useEffect, useMemo } from 'react'
import { useGame } from '../context/GameContext'

export const VoteScene: React.FC = () => {
  const { currentDayScript, players, advancePhase } = useGame()
  const allVotes = currentDayScript?.votes ?? []
  const [visibleCount, setVisibleCount] = useState(0)

  // Oylar birer birer acilir
  useEffect(() => {
    if (visibleCount < allVotes.length) {
      const t = setTimeout(() => setVisibleCount(c => c + 1), 1500)
      return () => clearTimeout(t)
    }
  }, [visibleCount, allVotes.length])

  // Auto-advance: tum oylar acildiktan 3s sonra
  useEffect(() => {
    if (visibleCount >= allVotes.length && allVotes.length > 0) {
      const t = setTimeout(() => advancePhase(), 3000)
      return () => clearTimeout(t)
    }
  }, [visibleCount, allVotes.length, advancePhase])

  // Oy sayimi
  const tally = useMemo(() => {
    const counts: Record<string, number> = {}
    allVotes.slice(0, visibleCount).forEach(v => {
      counts[v.target] = (counts[v.target] || 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [allVotes, visibleCount])

  const maxVote = tally.length > 0 ? tally[0][1] : 0
  const allDone = visibleCount >= allVotes.length

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-glow" />
      <div className="cf-vignette" />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="text-xs uppercase tracking-[3px] text-warden-alert/70 mb-2">Oylama</p>
          <p className="text-sm text-text-secondary">Herkes birini surgun icin seciyor...</p>
        </div>

        {/* Oylar */}
        <div className="space-y-3 mb-8">
          {allVotes.slice(0, visibleCount).map((vote, i) => {
            const voterPlayer = players.find(p => p.name === vote.voter)
            return (
              <div key={i} className="flex items-center gap-3 animate-fade-in">
                <div
                  className="w-8 h-8 rounded-full shrink-0 border-2 border-white/10"
                  style={{ backgroundColor: voterPlayer?.avatarColor ?? '#555' }}
                />
                <span className="text-sm text-text-primary w-24 shrink-0">{vote.voter}</span>
                <span className="text-text-secondary text-xs">→</span>
                <span className="text-sm text-warden-alert font-semibold">{vote.target}</span>
              </div>
            )
          })}
        </div>

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
                    style={{ width: `${(count / allVotes.length) * 100}%` }}
                  />
                </div>
                <span className="text-sm text-text-secondary w-6 text-right">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
