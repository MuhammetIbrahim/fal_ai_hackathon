import React, { useMemo } from 'react'
import { useGameStore } from '../state/GameStore'

export const VoteOverlay: React.FC = () => {
  const votes = useGameStore((s) => s.votes)
  const exileResult = useGameStore((s) => s.exileResult)
  const players = useGameStore((s) => s.players)
  const phase = useGameStore((s) => s.phase)

  const voteTally = useMemo(() => {
    const tally: Record<string, { count: number; voters: string[] }> = {}
    Object.entries(votes).forEach(([voter, target]) => {
      if (!tally[target]) tally[target] = { count: 0, voters: [] }
      tally[target].count += 1
      tally[target].voters.push(voter)
    })
    return Object.entries(tally).sort(([, a], [, b]) => b.count - a.count)
  }, [votes])

  const maxVotes = voteTally.length > 0 ? voteTally[0][1].count : 0
  const totalVoters = Object.keys(votes).length

  if (phase !== 'vote' && phase !== 'exile') return null
  if (Object.keys(votes).length === 0 && !exileResult) return null

  return (
    <div className="fixed inset-0 z-35 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative max-w-lg w-full mx-4 rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #d8bc96 0%, #c8a878 40%, #d4b890 100%)',
          border: '1px solid rgba(139,94,60,0.5)',
          boxShadow: '0 0 0 1px rgba(92,58,30,0.3), 0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Top accent */}
        <div className="h-[2px] bg-gradient-to-r from-transparent via-[#8B5E3C]/60 to-transparent" />

        <div className="p-6">
          <h2 className="text-[12px] font-pixel text-[#2a1f10] text-center mb-5 tracking-wider">
            Oylama Sonuclari
          </h2>

          {/* Vote bars */}
          <div className="space-y-3.5 mb-5">
            {voteTally.map(([target, { count, voters }]) => {
              const barWidth = maxVotes > 0 ? (count / totalVoters) * 100 : 0
              const isExiled = exileResult?.exiled === target

              return (
                <div key={target} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-pixel ${
                        isExiled ? 'text-[#8B0000] font-bold' : 'text-[#2a1f10]'
                      }`}
                    >
                      {target} {isExiled && '(Surgun!)'}
                    </span>
                    <span className="text-[9px] font-pixel text-[#6a5a40]">
                      {count} oy
                    </span>
                  </div>

                  {/* Bar */}
                  <div
                    className="w-full h-3.5 rounded-full overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(160,130,90,0.3)',
                      border: '1px solid rgba(138,106,58,0.4)',
                    }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${barWidth}%`,
                        background: isExiled
                          ? 'linear-gradient(90deg, #8B0000, #DC143C)'
                          : 'linear-gradient(90deg, #8B5E3C, #A0784A)',
                      }}
                    />
                  </div>

                  {/* Voter chips */}
                  <div className="flex flex-wrap gap-1">
                    {voters.map((voter) => (
                      <span
                        key={voter}
                        className="text-[7px] font-pixel text-[#5a4a30] px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: 'rgba(180,155,115,0.4)',
                          border: '1px solid rgba(160,140,100,0.3)',
                        }}
                      >
                        {voter}
                      </span>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Vote mapping */}
          <div
            className="pt-3.5"
            style={{ borderTop: '1px solid rgba(139,94,60,0.3)' }}
          >
            <h3 className="text-[9px] font-pixel mb-2 text-[#6a5a40] tracking-wider">
              Tum Oylar
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {Object.entries(votes).map(([voter, target]) => (
                <div key={voter} className="text-[8px] font-pixel text-[#4a3a20]">
                  {voter} &#8594; <span className="text-[#8B0000] font-bold">{target}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Exile announcement */}
          {exileResult && (
            <div
              className="mt-5 text-center pt-3.5"
              style={{ borderTop: '1px solid rgba(139,94,60,0.3)' }}
            >
              <span className="text-[12px] font-pixel text-[#8B0000] font-bold">
                {exileResult.exiled} surgun edildi!
              </span>
            </div>
          )}
        </div>

        {/* Bottom accent */}
        <div className="h-px bg-gradient-to-r from-transparent via-[#8B5E3C]/40 to-transparent" />
      </div>
    </div>
  )
}

export default VoteOverlay
