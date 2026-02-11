import React, { useState, useEffect } from 'react'
import { useGame } from '../context/GameContext'
import { ChatLog } from '../components/campfire/ChatLog'
import type { Message } from '../components/campfire/ChatLog'
import { QueuePanel } from '../components/campfire/QueuePanel'
import type { Player } from '../components/campfire/QueuePanel'
import { OmenBar } from '../components/campfire/OmenBar'
import { GameObjects } from '../components/campfire/GameObjects'

export const CampfireScene: React.FC = () => {
  const {
    phase, round, messages, players, worldSeed, inputRequired, sendSpeak,
    ocakTepki, kulKaymasi, uiObjects,
    proposal, proposalResult, omenInterpretation, sozBorcu, sendProposalVote,
  } = useGame()
  const [inputText, setInputText] = useState('')
  const [showFlash, setShowFlash] = useState(false)
  const [showKulFlash, setShowKulFlash] = useState(false)

  // Ocak tepki flash effect
  useEffect(() => {
    if (!ocakTepki) return
    setShowFlash(true)
    const t = setTimeout(() => setShowFlash(false), 3000)
    return () => clearTimeout(t)
  }, [ocakTepki])

  // Kul kaymasi flash effect
  useEffect(() => {
    if (!kulKaymasi) return
    setShowKulFlash(true)
    const t = setTimeout(() => setShowKulFlash(false), 5000)
    return () => clearTimeout(t)
  }, [kulKaymasi])

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
      {/* Kul kaymasi flash */}
      {showKulFlash && <div className="kul-kaymasi-flash" />}

      {/* Top bar */}
      <header className="cf-topbar">
        <div className="cf-world-brief">
          <h2 className="cf-world-title">{worldSeed?.settlementName ?? 'Koy'}</h2>
          <p className="cf-world-sub">Gun {round} — {label}</p>
        </div>
        <OmenBar />
      </header>

      {/* Soz Borcu Banner (Katman 4) */}
      {sozBorcu && sozBorcu.forcedSpeakers.length > 0 && (
        <div className="relative z-10 flex items-center justify-center gap-2 px-4 py-2"
             style={{ background: 'rgba(211,47,47,0.06)', borderBottom: '1px solid rgba(211,47,47,0.1)' }}>
          <span className="text-xs text-warden-alert/60">&#9888;</span>
          <span className="text-xs text-warden-alert/60">
            Soz Borcu: {sozBorcu.forcedSpeakers.join(', ')} konusmak zorunda
          </span>
          {sozBorcu.damgali.length > 0 && (
            <span className="text-[10px] text-warden-alert/80 ml-2 px-2 py-0.5 rounded bg-warden-alert/10 font-semibold">
              Damga: {sozBorcu.damgali.join(', ')}
            </span>
          )}
        </div>
      )}

      {/* Omen Interpretation (Katman 4) */}
      {omenInterpretation && (
        <div className="relative z-10 px-6 py-3" style={{ background: 'rgba(255,191,0,0.03)', borderBottom: '1px solid rgba(255,191,0,0.08)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{omenInterpretation.omen.icon}</span>
            <span className="text-[10px] uppercase tracking-[2px] text-accent/50 font-semibold">
              Alamet Yorumu — {omenInterpretation.omen.label}
            </span>
          </div>
          <div className="space-y-1 max-h-20 overflow-y-auto">
            {omenInterpretation.interpretations.map((interp, i) => (
              <p key={i} className="text-[11px] text-text-secondary/60">
                <span className="text-accent/50 font-medium">{interp.speaker}:</span> {interp.text}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Proposal Card (Katman 4) */}
      {proposal && !proposalResult && (
        <div className="relative z-10 px-6 py-3" style={{ background: 'rgba(100,130,200,0.04)', borderBottom: '1px solid rgba(100,130,200,0.1)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">&#9878;</span>
            <span className="text-[10px] uppercase tracking-[2px] text-[#8090cc]/60 font-semibold">Kamusal Onerge</span>
          </div>
          <p className="text-sm text-text-primary/80 mb-2">{proposal.proposalText}</p>
          {inputRequired?.type === 'proposal_vote' ? (
            <div className="flex gap-2">
              <button
                onClick={() => sendProposalVote('a')}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'rgba(67,160,71,0.1)', border: '1px solid rgba(67,160,71,0.2)', color: '#43A047' }}
              >
                A: {proposal.optionA}
              </button>
              <button
                onClick={() => sendProposalVote('b')}
                className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
                style={{ background: 'rgba(211,47,47,0.1)', border: '1px solid rgba(211,47,47,0.2)', color: '#D32F2F' }}
              >
                B: {proposal.optionB}
              </button>
            </div>
          ) : (
            <div className="flex gap-3 text-xs text-text-secondary/50">
              <span>A: {proposal.optionA}</span>
              <span>B: {proposal.optionB}</span>
            </div>
          )}
        </div>
      )}

      {/* Proposal Result (Katman 4) */}
      {proposalResult && (
        <div className="relative z-10 px-6 py-2 flex items-center justify-center gap-3"
             style={{ background: 'rgba(100,130,200,0.04)', borderBottom: '1px solid rgba(100,130,200,0.08)' }}>
          <span className="text-xs text-[#8090cc]/60">Onerge Sonucu:</span>
          <span className="text-xs text-text-primary/80 font-semibold">{proposalResult.winnerText}</span>
          <span className="text-[10px] text-text-secondary/40">({proposalResult.aCount} vs {proposalResult.bCount})</span>
        </div>
      )}

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

      {/* UI Objects HUD */}
      <GameObjects uiObjects={uiObjects} />
    </div>
  )
}
