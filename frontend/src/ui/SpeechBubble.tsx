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
      <div className="text-text-gold text-[8px] font-pixel text-center mb-1">
        {speaker}
      </div>

      {/* Bubble body */}
      <div className="relative bg-white border-2 border-black px-3 py-2 max-w-[250px]">
        <p className="text-[#1a1208] text-[9px] font-pixel leading-relaxed break-words">
          {content}
        </p>

        {/* Triangle pointer */}
        <div
          className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '8px solid black',
          }}
        />
        <div
          className="absolute left-1/2 -bottom-[5px] -translate-x-1/2 w-0 h-0"
          style={{
            borderLeft: '4px solid transparent',
            borderRight: '4px solid transparent',
            borderTop: '6px solid white',
          }}
        />
      </div>
    </div>
  )
}

export default SpeechBubble
