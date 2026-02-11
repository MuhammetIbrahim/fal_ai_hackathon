import React, { useEffect, useState, useCallback } from 'react'
import PixelButton from './PixelButton'

interface ParchmentModalProps {
  text: string
  onClose?: () => void
  showClose?: boolean
}

export const ParchmentModal: React.FC<ParchmentModalProps> = ({
  text,
  onClose,
  showClose = true,
}) => {
  const [displayedText, setDisplayedText] = useState('')
  const [typewriterDone, setTypewriterDone] = useState(false)

  // Typewriter effect
  useEffect(() => {
    if (!text) return

    setDisplayedText('')
    setTypewriterDone(false)
    let index = 0

    const interval = setInterval(() => {
      index++
      if (index >= text.length) {
        setDisplayedText(text)
        setTypewriterDone(true)
        clearInterval(interval)
      } else {
        setDisplayedText(text.slice(0, index))
      }
    }, 30)

    return () => clearInterval(interval)
  }, [text])

  // Skip typewriter on click
  const handleSkip = useCallback(() => {
    if (!typewriterDone) {
      setDisplayedText(text)
      setTypewriterDone(true)
    }
  }, [typewriterDone, text])

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70" onClick={handleSkip} />

      {/* Parchment scroll */}
      <div
        className="relative max-w-xl w-full mx-4 p-8"
        onClick={handleSkip}
        style={{
          background: 'linear-gradient(135deg, #d4b896 0%, #c4a876 30%, #d4b896 60%, #bfa87a 100%)',
          border: '6px double #8B5E3C',
          boxShadow: '0 0 0 2px #5C3A1E, 0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        {/* Ornamental corners */}
        <div className="absolute top-1 left-1 text-[#8B5E3C] text-lg leading-none select-none">&#9484;</div>
        <div className="absolute top-1 right-1 text-[#8B5E3C] text-lg leading-none select-none">&#9488;</div>
        <div className="absolute bottom-1 left-1 text-[#8B5E3C] text-lg leading-none select-none">&#9492;</div>
        <div className="absolute bottom-1 right-1 text-[#8B5E3C] text-lg leading-none select-none">&#9496;</div>

        {/* Text content */}
        <div className="min-h-[120px] mb-4">
          <p className="text-[#2a1f10] text-[10px] font-pixel leading-loose whitespace-pre-wrap">
            {displayedText}
            {!typewriterDone && (
              <span className="inline-block w-2 h-3 bg-[#2a1f10] ml-0.5 animate-pulse" />
            )}
          </p>
        </div>

        {/* Continue button */}
        {showClose && typewriterDone && onClose && (
          <div className="flex justify-center mt-4">
            <PixelButton
              label="Devam"
              onClick={onClose}
              variant="stone"
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default ParchmentModal
