import React, { useState } from 'react'
import { useGame } from '../context/GameContext'
import { AvatarFrame } from '../components/house/AvatarFrame'
import { TranscriptPanel } from '../components/house/TranscriptPanel'

export const HouseScene: React.FC = () => {
  const { houseVisit, inputRequired, sendVisitSpeak, selfPlayerName } = useGame()
  const [inputText, setInputText] = useState('')

  const visitor = houseVisit?.visitor ?? 'Misafir'
  const host = houseVisit?.host ?? 'Ev Sahibi'
  const exchanges = houseVisit?.exchanges ?? []
  const maxExchanges = houseVisit?.maxExchanges ?? 4

  // Am I the visitor or host?
  const iAmVisitor = selfPlayerName === visitor
  const iAmHost = selfPlayerName === host
  const iAmInvolved = iAmVisitor || iAmHost

  // Convert exchanges to transcript format
  const transcripts = exchanges.map((ex, i) => ({
    id: `visit-${i}`,
    speaker: (ex.speaker === selfPlayerName ? 'me' : 'opponent') as 'me' | 'opponent',
    text: ex.content,
  }))

  const lastSpeaker = exchanges.length > 0 ? exchanges[exchanges.length - 1].speaker : null
  const currentSpeaker: 'me' | 'opponent' = lastSpeaker === selfPlayerName ? 'me' : 'opponent'

  const canSpeak = inputRequired?.type === 'visit_speak'

  const handleSend = () => {
    if (!inputText.trim()) return
    sendVisitSpeak(inputText.trim())
    setInputText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // If I'm not involved in this visit (shouldn't happen, but fallback)
  if (!iAmInvolved && !houseVisit) {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
        <div className="cf-vignette" />
        <p className="text-sm text-text-secondary/50 animate-pulse">Oda gorusmesi devam ediyor...</p>
      </div>
    )
  }

  return (
    <div className="house-layout bg-black-20">
      {/* Header */}
      <div className="house-header">
        <div className="turn-badge">Tur: {exchanges.length} / {maxExchanges}</div>
        <div className="status-text">
          {canSpeak ? 'Konusma siran!' : (exchanges.length === 0 ? 'Gorusme basliyor...' : 'Dinliyorsun...')}
        </div>
      </div>

      {/* Avatars */}
      <AvatarFrame name={host} align="left" isActive={currentSpeaker === 'opponent' && !iAmHost || currentSpeaker === 'me' && iAmHost} />
      <AvatarFrame name={visitor} align="right" isActive={currentSpeaker === 'me' && iAmVisitor || currentSpeaker === 'opponent' && !iAmVisitor} />

      {/* Center Visual */}
      <div className="center-visual">
        <div style={{
          width: '100%', height: '100%', borderRadius: '50%',
          background: `radial-gradient(circle, rgba(255,165,0,${currentSpeaker === 'opponent' ? 0.4 : 0.2}) 0%, transparent 70%)`,
          transition: 'background 0.5s'
        }} />
      </div>

      {/* Transcript */}
      <TranscriptPanel transcripts={transcripts} />

      {/* Input or status */}
      <div className="ptt-container">
        {canSpeak ? (
          <div className="flex items-center gap-2 w-[350px]">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Konusmak icin yaz..."
              autoFocus
              className="flex-1 px-4 py-3 rounded-full bg-white/10 border border-accent/30 text-text-primary text-sm placeholder:text-text-secondary/50 focus:outline-none focus:border-accent/60"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="px-4 py-3 rounded-full bg-accent/20 border border-accent/30 text-accent text-sm font-semibold hover:bg-accent/30 transition-all disabled:opacity-30"
            >
              Gonder
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center w-[280px] h-[80px] rounded-full bg-white/5 border border-white/10 text-text-secondary text-sm">
            {exchanges.length === 0 ? 'Gorusme basliyor...' : 'Ozel gorusme devam ediyor...'}
          </div>
        )}
      </div>
    </div>
  )
}
