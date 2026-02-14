import React, { useEffect, useState } from 'react'
import { useGameStore } from '../state/GameStore'
import { PHASE_NAMES } from '../utils/constants'

const PHASE_ICONS: Record<string, string> = {
  morning: '\u2600',   // ☀
  campfire: '\uD83D\uDD25', // 🔥
  vote: '\uD83D\uDDF3',  // 🗳
  exile: '\u2694',     // ⚔
  night: '\uD83C\uDF19',  // 🌙
  game_over: '\uD83C\uDFC6', // 🏆
}

export const StatusHUD: React.FC = () => {
  const phase = useGameStore((s) => s.phase)
  const round = useGameStore((s) => s.round)
  const dayLimit = useGameStore((s) => s.dayLimit)
  const players = useGameStore((s) => s.players)
  const inputRequired = useGameStore((s) => s.inputRequired)
  const currentSpeaker = useGameStore((s) => s.currentSpeaker)

  const [timer, setTimer] = useState<number | null>(null)

  const alivePlayers = players.filter((p) => p.alive)
  const phaseName = PHASE_NAMES[phase] ?? phase
  const phaseIcon = PHASE_ICONS[phase] ?? ''

  useEffect(() => {
    if (!inputRequired?.timeout_seconds) {
      setTimer(null)
      return
    }

    let remaining = inputRequired.timeout_seconds
    setTimer(remaining)

    const interval = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(interval)
        setTimer(0)
      } else {
        setTimer(remaining)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [inputRequired])

  if (phase === 'lobby') return null

  return (
    <div className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-5 py-2.5 bg-gradient-to-b from-[#1a1208] to-[#1a1208]/85 backdrop-blur-sm shadow-[0_4px_20px_rgba(0,0,0,0.6)]" style={{ borderBottom: '2px solid rgba(139,94,60,0.5)' }}>
      {/* Left: Day + Phase */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#2a1f10]/80" style={{ border: '1px solid rgba(218,165,32,0.3)' }}>
          <span className="text-text-gold text-[10px] font-pixel font-bold tracking-wider">
            GUN {round}
          </span>
          {dayLimit > 0 && (
            <span className="text-stone text-[8px] font-pixel">/{dayLimit}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{phaseIcon}</span>
          <span className="text-text-light text-[10px] font-pixel tracking-wide">
            {phaseName}
          </span>
        </div>
      </div>

      {/* Center: Player avatars with speaker highlight */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          {players.map((p) => {
            const isSpeaking = currentSpeaker === p.name
            const color = p.speech_color ?? p.color ?? '#DAA520'

            return (
              <div key={p.slot_id} className="relative group" title={p.name}>
                {/* Avatar circle */}
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                    className={`w-8 h-8 rounded-full object-cover transition-all duration-300 ${
                      !p.alive ? 'opacity-30 grayscale' : ''
                    }`}
                    style={{
                      border: isSpeaking ? `2px solid ${color}` : '2px solid rgba(139,94,60,0.3)',
                      boxShadow: isSpeaking ? `0 0 12px ${color}60` : 'none',
                    }}
                  />
                ) : (
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                      !p.alive ? 'opacity-30' : ''
                    }`}
                    style={{
                      backgroundColor: p.alive ? color + '20' : '#6B6B6B20',
                      border: isSpeaking ? `2px solid ${color}` : `2px solid ${color}30`,
                      boxShadow: isSpeaking ? `0 0 12px ${color}60` : 'none',
                    }}
                  >
                    <span className="text-[10px] font-pixel font-bold" style={{ color: p.alive ? color : '#6B6B6B' }}>
                      {p.name.charAt(0)}
                    </span>
                  </div>
                )}
                {/* Speaker ring animation */}
                {isSpeaking && (
                  <div
                    className="absolute inset-[-4px] rounded-full animate-ping"
                    style={{
                      border: `2px solid ${color}`,
                      opacity: 0.4,
                    }}
                  />
                )}
                {/* Name below avatar */}
                <div
                  className={`absolute -bottom-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[6px] font-pixel ${
                    isSpeaking ? 'font-bold' : 'opacity-60'
                  }`}
                  style={{ color: isSpeaking ? color : '#a0a0a0' }}
                >
                  {p.name.split(' ')[0]}
                </div>
                {/* Dead X */}
                {!p.alive && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-5 h-0.5 bg-accent-red/70 rotate-45 rounded" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <span className="text-stone text-[8px] font-pixel ml-1">
          {alivePlayers.length}/{players.length}
        </span>
      </div>

      {/* Right: Timer */}
      <div className="w-20 text-right">
        {timer !== null && timer > 0 && (
          <div className="flex items-center justify-end gap-1.5 px-2 py-0.5 rounded"
               style={{
                 border: timer <= 5 ? '1px solid rgba(220,20,60,0.5)' : '1px solid rgba(218,165,32,0.2)',
                 backgroundColor: timer <= 5 ? 'rgba(220,20,60,0.1)' : 'transparent',
               }}>
            <div className={`w-1.5 h-1.5 rounded-full ${timer <= 5 ? 'bg-fire-red animate-pulse' : 'bg-text-gold'}`} />
            <span className={`text-[10px] font-pixel font-bold tabular-nums ${timer <= 5 ? 'text-fire-red' : 'text-text-gold'}`}>
              {timer}s
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default StatusHUD
