import React, { useEffect, useState } from 'react'

interface SpeechBubbleProps {
  speaker: string
  content: string
  x: number
  y: number
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({
  speaker,
  content,
  x,
  y,
}) => {
  const [visible, setVisible] = useState(true)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      setFading(true)
    }, 4000)

    const removeTimer = setTimeout(() => {
      setVisible(false)
    }, 5000)

    return () => {
      clearTimeout(fadeTimer)
      clearTimeout(removeTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className={`
        absolute z-30 pointer-events-none
        transition-all duration-700 ease-out
        ${fading ? 'opacity-0 -translate-y-2' : 'opacity-100 translate-y-0'}
      `}
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      {/* Speaker name */}
      <div
        className="text-text-gold text-[8px] font-pixel text-center mb-1"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
      >
        {speaker}
      </div>

      {/* Bubble body */}
      <div
        className="relative px-3 py-2 max-w-[250px] rounded-lg"
        style={{
          backgroundColor: 'rgba(18,14,6,0.92)',
          border: '1px solid rgba(139,94,60,0.35)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <p className="text-text-light/90 text-[9px] font-pixel leading-relaxed break-words">
          {content}
        </p>

        {/* Triangle pointer */}
        <div
          className="absolute left-1/2 -bottom-[6px] -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '6px solid rgba(139,94,60,0.35)',
          }}
        />
        <div
          className="absolute left-1/2 -bottom-[4px] -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '5px solid rgba(18,14,6,0.92)',
          }}
        />
      </div>
    </div>
  )
}

export default SpeechBubble
