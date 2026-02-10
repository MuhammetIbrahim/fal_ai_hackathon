import React, { useState, useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { ChatLog } from '../components/campfire/ChatLog'
import type { Message } from '../components/campfire/ChatLog'
import { QueuePanel } from '../components/campfire/QueuePanel'
import type { Player } from '../components/campfire/QueuePanel'
import { OmenBar } from '../components/campfire/OmenBar'

export const CampfireScene: React.FC = () => {
  const { phase, round, currentDayScript, players, worldSeed, advancePhase } = useGame()

  const isClosing = phase === 'campfire_close'
  const allMessages = isClosing
    ? (currentDayScript?.campfireClose ?? [])
    : (currentDayScript?.campfireOpen ?? [])

  const [visibleMessages, setVisibleMessages] = useState<Message[]>([])
  const [currentSpeakerIdx, setCurrentSpeakerIdx] = useState(-1)
  const advancedRef = useRef(false)

  // Mesajlari trickle et
  useEffect(() => {
    setVisibleMessages([])
    setCurrentSpeakerIdx(-1)
    advancedRef.current = false

    let count = 0
    const iv = setInterval(() => {
      if (count < allMessages.length) {
        const msg = allMessages[count]
        setVisibleMessages(prev => [...prev, {
          id: msg.id,
          sender: msg.sender,
          text: msg.text,
          isSelf: msg.isSelf,
          isSystem: msg.isSystem,
          timestamp: msg.timestamp,
        }])
        setCurrentSpeakerIdx(count)
        count++
      } else {
        clearInterval(iv)
        // Son mesajdan 2s sonra advance
        setTimeout(() => {
          if (!advancedRef.current) {
            advancedRef.current = true
            advancePhase()
          }
        }, 2500)
      }
    }, 3000)

    return () => clearInterval(iv)
  }, [phase, round])

  // Queue panel icin player listesi
  const queuePlayers: Player[] = players
    .filter(p => p.alive)
    .map(p => ({ id: p.id, name: p.name, avatarColor: p.avatarColor }))

  const currentSpeaker = currentSpeakerIdx >= 0 && currentSpeakerIdx < allMessages.length
    ? queuePlayers.find(p => p.name === allMessages[currentSpeakerIdx].sender) ?? null
    : null

  const label = isClosing ? 'Kapanis Ates Basi' : 'Ates Basi'

  return (
    <div className="cf-scene">
      {/* Atmosfer katmanlari */}
      <div className="cf-glow" />
      <div className="cf-vignette" />
      <div className="cf-noise" />

      {/* Top bar */}
      <header className="cf-topbar">
        <div className="cf-world-brief">
          <h2 className="cf-world-title">{worldSeed.settlementName}</h2>
          <p className="cf-world-sub">Gun {round} — {label}</p>
        </div>
        <OmenBar />
      </header>

      {/* Main content */}
      <div className="cf-body">
        <div className="cf-center">
          <ChatLog messages={visibleMessages} />
          {/* Demo modunda input yok, izleme gostergesi */}
          <div className="cf-input-area">
            <div className="px-6 py-3 rounded-full bg-white/5 border border-white/8 text-text-secondary text-sm">
              Ates basini izliyorsun...
            </div>
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
