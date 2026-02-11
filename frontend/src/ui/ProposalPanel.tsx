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
      <div className="absolute inset-0 bg-black/60" />

      {/* Parchment panel */}
      <div
        className="relative max-w-md w-full mx-4 p-6"
        style={{
          background: 'linear-gradient(135deg, #d4b896 0%, #c4a876 50%, #d4b896 100%)',
          border: '4px solid #8B5E3C',
          boxShadow: '0 0 0 2px #5C3A1E, 0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Title */}
        <h2 className="text-[12px] font-pixel text-[#2a1f10] text-center mb-2">
          {proposal.title}
        </h2>

        {/* Description */}
        <p className="text-[9px] font-pixel text-[#4a3a20] text-center leading-relaxed mb-6">
          {proposal.description}
        </p>

        {/* Divider */}
        <div className="w-full h-0.5 bg-wood/40 mb-4" />

        {/* Options side by side */}
        <div className="flex gap-4 justify-center">
          {proposal.options.map((option) => (
            <div
              key={option.id}
              className="flex flex-col items-center gap-2 flex-1"
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
