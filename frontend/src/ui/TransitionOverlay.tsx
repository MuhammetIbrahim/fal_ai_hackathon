import React from 'react'
import { useGameStore } from '../state/GameStore'

export const TransitionOverlay: React.FC = () => {
  const transitioning = useGameStore((s) => s.transitioning)

  return (
    <div
      className="fixed inset-0 z-[100] pointer-events-none transition-opacity duration-1000 ease-in-out"
      style={{
        backgroundColor: '#708090',
        opacity: transitioning ? 0.8 : 0,
      }}
    />
  )
}

export default TransitionOverlay
