import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { ChatLog } from '../components/campfire/ChatLog'
import type { Message } from '../components/campfire/ChatLog'
import { QueuePanel } from '../components/campfire/QueuePanel'
import type { Player } from '../components/campfire/QueuePanel'
import { OmenBar } from '../components/campfire/OmenBar'

export const CampfireScene: React.FC = () => {
  const { phase, round, messages, players, worldSeed, inputRequired, sendSpeak, selfPlayerName, ocakTepki } = useGame()
  const [inputText, setInputText] = useState('')
  const [showFlash, setShowFlash] = useState(false)

  // Ocak tepki flash effect
  useEffect(() => {
    if (!ocakTepki) return
    setShowFlash(true)
    const t = setTimeout(() => setShowFlash(false), 3000)
    return () => clearTimeout(t)
  }, [ocakTepki])

  const isClosing = phase === 'campfire_close'
  const label = isClosing ? 'Kapanis Ates Basi' : 'Ates Basi'

  // Convert messages to ChatLog format
  const chatMessages: Message[] = messages.map(m => ({
    id: m.id,
    sender: m.sender,
    text: m.text,
    isSelf: m.isSelf,
    isSystem: m.isSystem,
    timestamp: m.timestamp,
  }))

  // Queue panel
  const queuePlayers: Player[] = players
    .filter(p => p.alive)
    .map(p => ({ id: p.id, name: p.name, avatarColor: p.avatarColor }))

  const lastSpeaker = messages.length > 0 ? messages[messages.length - 1].sender : null
  const currentSpeaker = lastSpeaker
    ? queuePlayers.find(p => p.name === lastSpeaker) ?? null
    : null

  const canSpeak = inputRequired?.type === 'speak'

  const handleSend = () => {
    if (!inputText.trim()) return
    sendSpeak(inputText.trim())
    setInputText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="cf-scene">
      {/* Atmosfer katmanlari */}
      <div className="cf-glow" />
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Ocak tepki flash */}
      {showFlash && <div className="ocak-flash" />}

      {/* Top bar */}
      <header className="cf-topbar">
        <div className="cf-world-brief">
          <h2 className="cf-world-title">{worldSeed?.settlementName ?? 'Koy'}</h2>
          <p className="cf-world-sub">Gun {round} — {label}</p>
        </div>
        <OmenBar />
      </header>

      {/* Main content */}
      <div className="cf-body">
        <div className="cf-center">
          <ChatLog messages={chatMessages} />

          {/* Input area */}
          <div className="cf-input-area">
            {canSpeak ? (
              <div className="flex items-center gap-2 w-full max-w-lg">
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
              <div className="px-6 py-3 rounded-full bg-white/5 border border-white/8 text-text-secondary text-sm">
                {messages.length === 0 ? 'Ates basi basliyor...' : 'Ates basini izliyorsun...'}
              </div>
            )}
          </div>
        </div>
        <QueuePanel
          queue={queuePlayers.filter(p => p.id !== currentSpeaker?.id)}
          currentSpeaker={currentSpeaker}
        />
      </div>
    </div>
  )
}
