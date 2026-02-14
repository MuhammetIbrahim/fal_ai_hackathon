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

  const handleSkip = useCallback(() => {
    if (!typewriterDone) {
      setDisplayedText(text)
      setTypewriterDone(true)
    }
  }, [typewriterDone, text])

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleSkip} />

      {/* Parchment scroll */}
      <div
        className="relative max-w-xl w-full mx-4 p-8 rounded-lg"
        onClick={handleSkip}
        style={{
          background: 'linear-gradient(135deg, #d8bc96 0%, #c8a878 30%, #d4b890 60%, #c4a070 100%)',
          border: '1px solid rgba(139,94,60,0.5)',
          boxShadow: '0 0 0 1px rgba(92,58,30,0.2), 0 16px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)',
        }}
      >
        {/* Top accent line */}
        <div className="absolute top-0 left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-[#8B5E3C]/40 to-transparent" />

        {/* Corner accents */}
        <div className="absolute top-3 left-3 w-4 h-4 border-t border-l border-[#8B5E3C]/40" />
        <div className="absolute top-3 right-3 w-4 h-4 border-t border-r border-[#8B5E3C]/40" />
        <div className="absolute bottom-3 left-3 w-4 h-4 border-b border-l border-[#8B5E3C]/40" />
        <div className="absolute bottom-3 right-3 w-4 h-4 border-b border-r border-[#8B5E3C]/40" />

        {/* Text content */}
        <div className="min-h-[120px] mb-4">
          <p className="text-[#2a1f10] text-[10px] font-pixel leading-loose whitespace-pre-wrap">
            {displayedText}
            {!typewriterDone && (
              <span className="inline-block w-1.5 h-3 bg-[#2a1f10]/80 ml-0.5 animate-pulse rounded-sm" />
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
