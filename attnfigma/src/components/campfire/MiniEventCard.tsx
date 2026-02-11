import React from 'react'
import type { MiniEvent } from '../../types/game'

interface MiniEventCardProps {
  event: MiniEvent
}

export const MiniEventCard: React.FC<MiniEventCardProps> = ({ event }) => {
  return (
    <div className="mini-event-card animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="text-lg shrink-0 mt-0.5" style={{ filter: 'drop-shadow(0 0 4px rgba(255,191,0,0.3))' }}>
          &#128065;
        </span>
        <div>
          <p className="text-[10px] uppercase tracking-[2px] text-accent/50 font-semibold mb-1">
            Mini Olay
          </p>
          <p className="text-sm text-text-primary/80 leading-relaxed">
            {event.content}
          </p>
        </div>
      </div>
    </div>
  )
}
