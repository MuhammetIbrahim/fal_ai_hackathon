import React from 'react'
import { useGameStore } from '../state/GameStore'
import type { GameStore } from '../state/GameStore'
import './EventCard.css'

export const EventCard: React.FC = () => {
  const eventCard = useGameStore((s: GameStore) => s.eventCard)
  const setEventCard = useGameStore((s: GameStore) => s.setEventCard)

  if (!eventCard) return null

  const handleDismiss = () => {
    setEventCard(null)
  }

  const severityColors: Record<string, string> = {
    low: '#4a7c59',
    medium: '#8b6914',
    high: '#a84032',
    critical: '#7a1f1f',
  }

  const severityGlow: Record<string, string> = {
    low: 'rgba(74, 124, 89, 0.5)',
    medium: 'rgba(139, 105, 20, 0.5)',
    high: 'rgba(168, 64, 50, 0.5)',
    critical: 'rgba(122, 31, 31, 0.8)',
  }

  return (
    <div className="event-card-overlay">
      <div 
        className={`event-card event-card-${eventCard.severity}`}
        style={{
          borderColor: severityColors[eventCard.severity],
          boxShadow: `0 0 40px ${severityGlow[eventCard.severity]}, inset 0 0 20px rgba(0,0,0,0.5)`,
        }}
      >
        <div className="event-card-header">
          <span className="event-card-icon">{eventCard.icon}</span>
          <h2 className="event-card-title">{eventCard.title}</h2>
        </div>

        <div className="event-card-body">
          <p className="event-card-description">{eventCard.description}</p>
          
          {eventCard.target_player && (
            <div className="event-card-target">
              <strong>Hedef:</strong> <span className="player-name">{eventCard.target_player}</span>
            </div>
          )}

          {eventCard.consequence_text && (
            <div className="event-card-consequence">
              <div className="consequence-label">⚡ Sonuç</div>
              <p className="consequence-text">{eventCard.consequence_text}</p>
            </div>
          )}
        </div>

        <button 
          className="event-card-button"
          onClick={handleDismiss}
          style={{
            backgroundColor: severityColors[eventCard.severity],
            boxShadow: `0 4px 8px ${severityGlow[eventCard.severity]}`,
          }}
        >
          Anladım
        </button>
      </div>
    </div>
  )
}
