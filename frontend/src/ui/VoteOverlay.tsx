import React, { useMemo } from 'react'
import { useGameStore } from '../state/GameStore'

export const VoteOverlay: React.FC = () => {
  const votes = useGameStore((s) => s.votes)
  const exileResult = useGameStore((s) => s.exileResult)
  const players = useGameStore((s) => s.players)
  const phase = useGameStore((s) => s.phase)

  // Tally votes by target
  const voteTally = useMemo(() => {
    const tally: Record<string, { count: number; voters: string[] }> = {}
    Object.entries(votes).forEach(([voter, target]) => {
      if (!tally[target]) tally[target] = { count: 0, voters: [] }
      tally[target].count += 1
      tally[target].voters.push(voter)
    })
    // Sort by count descending
    return Object.entries(tally).sort(([, a], [, b]) => b.count - a.count)
  }, [votes])

  const maxVotes = voteTally.length > 0 ? voteTally[0][1].count : 0
  const totalVoters = Object.keys(votes).length

  if (phase !== 'vote' && phase !== 'exile') return null
  if (Object.keys(votes).length === 0 && !exileResult) return null

  return (
    <div className="fixed inset-0 z-35 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" />

      {/* Parchment modal */}
      <div className="relative bg-[#d4b896] text-[#2a1f10] border-4 border-wood shadow-lg shadow-black/50 p-6 max-w-lg w-full mx-4">
        {/* Decorative top border */}
        <div className="absolute -top-1 left-4 right-4 h-1 bg-wood/50" />

        <h2 className="text-[12px] font-pixel text-center mb-4 text-[#2a1f10]">
          Oylama Sonuclari
        </h2>

        {/* Vote bars */}
        <div className="space-y-3 mb-4">
          {voteTally.map(([target, { count, voters }]) => {
            const barWidth = maxVotes > 0 ? (count / totalVoters) * 100 : 0
            const isExiled = exileResult?.exiled === target

            return (
              <div key={target} className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-pixel ${
                      isExiled ? 'text-accent-red font-bold' : 'text-[#2a1f10]'
                    }`}
                  >
                    {target} {isExiled && '(Surgun!)'}
                  </span>
                  <span className="text-[9px] font-pixel text-[#5a4530]">
                    {count} oy
                  </span>
                </div>

                {/* Bar */}
                <div className="w-full h-4 bg-[#c4a876] border-2 border-[#8a6a3a]">
                  <div
                    className={`h-full transition-all duration-700 ease-out ${
                      isExiled ? 'bg-accent-red' : 'bg-wood'
                    }`}
                    style={{ width: `${barWidth}%` }}
                  />
                </div>

                {/* Voter names */}
                <div className="flex flex-wrap gap-1">
                  {voters.map((voter) => (
                    <span
                      key={voter}
                      className="text-[7px] font-pixel text-[#6a5a40] bg-[#bfa87a] px-1 py-0.5 border border-[#9a8a6a]"
                    >
                      {voter}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Voter → target mapping */}
        <div className="border-t-2 border-wood/40 pt-3">
          <h3 className="text-[9px] font-pixel mb-2 text-[#5a4530]">
            Tum Oylar
          </h3>
          <div className="grid grid-cols-2 gap-1">
            {Object.entries(votes).map(([voter, target]) => (
              <div key={voter} className="text-[8px] font-pixel text-[#4a3a20]">
                {voter} &#8594; <span className="text-accent-red">{target}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Exile announcement */}
        {exileResult && (
          <div className="mt-4 text-center border-t-2 border-wood/40 pt-3">
            <span className="text-[11px] font-pixel text-accent-red">
              {exileResult.exiled} surgun edildi!
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default VoteOverlay
