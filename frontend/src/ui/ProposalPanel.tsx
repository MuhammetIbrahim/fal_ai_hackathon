import React from 'react'
import { useGameStore } from '../state/GameStore'
import { wsManager } from '../net/websocket'
import PixelButton from './PixelButton'

export const ProposalPanel: React.FC = () => {
  const proposal = useGameStore((s) => s.proposal)

  const handleChoice = (optionId: string) => {
    wsManager.send('proposal_choice', { proposal_id: proposal?.id, choice: optionId })
    useGameStore.getState().setProposal(null)
  }

  if (!proposal) return null

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative max-w-md w-full mx-4 p-7 rounded-lg"
        style={{
          background: 'linear-gradient(135deg, #d8bc96 0%, #c8a878 50%, #d4b890 100%)',
          border: '1px solid rgba(139,94,60,0.5)',
          boxShadow: '0 0 0 1px rgba(92,58,30,0.2), 0 16px 48px rgba(0,0,0,0.5)',
        }}
      >
        {/* Top accent */}
        <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-[#8B5E3C]/40 to-transparent" />

        {/* Title */}
        <h2 className="text-[12px] font-pixel text-[#2a1f10] text-center mb-2 tracking-wider">
          {proposal.title}
        </h2>

        {/* Description */}
        <p className="text-[9px] font-pixel text-[#4a3a20] text-center leading-relaxed mb-6">
          {proposal.description}
        </p>

        {/* Divider */}
        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#8B5E3C]/40 to-transparent mb-5" />

        {/* Options */}
        <div className="flex gap-4 justify-center">
          {proposal.options.map((option) => (
            <div
              key={option.id}
              className="flex flex-col items-center gap-2.5 flex-1"
            >
              <PixelButton
                label={option.label}
                onClick={() => handleChoice(option.id)}
                variant="stone"
                size="lg"
              />
              <p className="text-[8px] font-pixel text-[#5a4a30] text-center leading-relaxed">
                {option.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ProposalPanel
