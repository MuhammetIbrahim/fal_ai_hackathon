import React, { useState, useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { AvatarFrame } from '../components/house/AvatarFrame'
import { TranscriptPanel } from '../components/house/TranscriptPanel'

interface VisibleTranscript {
  id: string
  speaker: 'me' | 'opponent'
  text: string
}

export const HouseScene: React.FC = () => {
  const { currentDayScript, advancePhase } = useGame()
  const allTranscripts = currentDayScript?.houseTranscript ?? []
  const visitor = currentDayScript?.houseVisitor ?? 'Sen'
  const host = currentDayScript?.houseHost ?? 'Rakip'

  const [visibleTranscripts, setVisibleTranscripts] = useState<VisibleTranscript[]>([])
  const [turn, setTurn] = useState(1)
  const [currentSpeaker, setCurrentSpeaker] = useState<'me' | 'opponent'>('opponent')
  const advancedRef = useRef(false)

  // Transcript'leri trickle et
  useEffect(() => {
    setVisibleTranscripts([])
    setTurn(1)
    setCurrentSpeaker('opponent')
    advancedRef.current = false

    let count = 0
    const iv = setInterval(() => {
      if (count < allTranscripts.length) {
        const t = allTranscripts[count]
        setVisibleTranscripts(prev => [...prev, t])
        setCurrentSpeaker(t.speaker)
        setTurn(count + 1)
        count++
      } else {
        clearInterval(iv)
        setTimeout(() => {
          if (!advancedRef.current) {
            advancedRef.current = true
            advancePhase()
          }
        }, 2500)
      }
    }, 3000)

    return () => clearInterval(iv)
  }, [])

  return (
    <div className="house-layout bg-black-20">
      {/* Header */}
      <div className="house-header">
        <div className="turn-badge">Tur: {turn} / {allTranscripts.length}</div>
        <div className="status-text">
          {currentSpeaker === 'me' ? 'Konusuyorsun' : 'Dinliyorsun...'}
        </div>
      </div>

      {/* Avatars */}
      <AvatarFrame name={host} align="left" isActive={currentSpeaker === 'opponent'} />
      <AvatarFrame name={visitor} align="right" isActive={currentSpeaker === 'me'} />

      {/* Center Visual */}
      <div className="center-visual">
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,165,0,${currentSpeaker === 'opponent' ? 0.4 : 0.2}) 0%, transparent 70%)`,
          transition: 'background 0.5s'
        }} />
      </div>

      {/* Transcript */}
      <TranscriptPanel transcripts={visibleTranscripts} />

      {/* Demo modunda PTT yok, durum gostergesi */}
      <div className="ptt-container">
        <div className="flex items-center justify-center w-[280px] h-[80px] rounded-full bg-white/5 border border-white/10 text-text-secondary text-sm">
          Ozel gorusme devam ediyor...
        </div>
      </div>
    </div>
  )
}
