import React, { useState } from 'react'
import { useGame } from '../context/GameContext'

const MOVE_ICONS: Record<string, string> = {
  itibar_kirigi: '🗡️',
  gundem_kaydirma: '📜',
  sahte_iz: '👣',
}

export const NightScene: React.FC = () => {
  const {
    nightMoves, omenOptions, nightResult,
    players, sendNightMove, sendOmenChoice,
  } = useGame()

  const alivePlayers = players.filter(p => p.alive)
  const selfName = players.find(p => p.id === 'P0')?.name

  // Internal flow: move → target (if needed) → omen → waiting → result
  const [step, setStep] = useState<'move' | 'target' | 'omen' | 'waiting'>('move')
  const [selectedMove, setSelectedMove] = useState<string | null>(null)
  const [selectedTarget, setSelectedTarget] = useState('')

  const handleMoveSelect = (moveId: string) => {
    const move = nightMoves.find(m => m.id === moveId)
    setSelectedMove(moveId)
    if (move?.requires_target) {
      setStep('target')
    } else {
      // Send immediately with empty target
      sendNightMove(`${moveId}|`)
      setStep('omen')
    }
  }

  const handleTargetConfirm = () => {
    if (selectedMove && selectedTarget) {
      sendNightMove(`${selectedMove}|${selectedTarget}`)
      setStep('omen')
    }
  }

  const handleOmenSelect = (omenId: string) => {
    sendOmenChoice(omenId)
    setStep('waiting')
  }

  // If nightResult arrived, show result
  if (nightResult) {
    return (
      <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
        <div className="night-glow" />
        <div className="cf-vignette" />
        <div className="cf-noise" />

        <div className="relative z-10 w-full max-w-lg px-6 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
               style={{
                 background: 'rgba(100,130,200,0.1)',
                 border: '1px solid rgba(100,130,200,0.2)',
                 boxShadow: '0 0 30px rgba(100,130,200,0.15)',
               }}>
            <span className="text-3xl" style={{ filter: 'drop-shadow(0 0 8px rgba(100,130,200,0.5))' }}>
              {nightResult.winningMove ? (MOVE_ICONS[nightResult.winningMove] ?? '🌙') : '🌙'}
            </span>
          </div>

          <p className="text-xs uppercase tracking-[4px] text-[#8090cc]/60 mb-3 font-semibold">Gece Sonucu</p>

          <p className="text-lg text-text-primary/90 leading-relaxed mb-6 font-light">
            {nightResult.effectText}
          </p>

          {nightResult.chosenOmen && (
            <div className="mt-6 px-4 py-3 rounded-xl animate-fade-in"
                 style={{
                   background: 'rgba(255,191,0,0.04)',
                   border: '1px solid rgba(255,191,0,0.1)',
                 }}>
              <p className="text-[10px] uppercase tracking-[3px] text-accent/40 mb-2 font-semibold">Yarinin Alameti</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-xl">{nightResult.chosenOmen.icon}</span>
                <span className="text-sm text-accent/80 font-medium">{nightResult.chosenOmen.label}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="night-glow" />
      <div className="cf-vignette" />
      <div className="cf-noise" />

      <div className="relative z-10 w-full max-w-lg px-6">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full mb-4"
               style={{
                 background: 'rgba(100,130,200,0.08)',
                 border: '1px solid rgba(100,130,200,0.15)',
                 boxShadow: '0 0 30px rgba(100,130,200,0.1)',
               }}>
            <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 6px rgba(100,130,200,0.5))' }}>🌙</span>
          </div>
          <p className="text-xs uppercase tracking-[4px] text-[#8090cc]/60 mb-2 font-semibold">Sis Hatti</p>
          <p className="text-sm text-text-secondary/60">
            {step === 'move' && 'Gece hamlenizi secin.'}
            {step === 'target' && 'Hedef secin.'}
            {step === 'omen' && 'Yarinin alametini secin.'}
            {step === 'waiting' && 'Gece cozuluyor...'}
          </p>
        </div>

        {/* Step 1: Move Selection */}
        {step === 'move' && (
          <div className="space-y-3 mb-8 animate-fade-in">
            {nightMoves.map(move => (
              <button
                key={move.id}
                onClick={() => handleMoveSelect(move.id)}
                className="group w-full flex items-start gap-4 px-5 py-4 rounded-xl transition-all duration-200"
                style={{
                  background: 'rgba(100,130,200,0.04)',
                  border: '1px solid rgba(100,130,200,0.1)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(100,130,200,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(100,130,200,0.2)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(100,130,200,0.04)'
                  e.currentTarget.style.borderColor = 'rgba(100,130,200,0.1)'
                }}
              >
                <span className="text-2xl mt-0.5" style={{ filter: 'drop-shadow(0 0 4px rgba(100,130,200,0.4))' }}>
                  {move.icon}
                </span>
                <div className="text-left flex-1">
                  <p className="text-sm font-semibold text-[#8090cc]">{move.label}</p>
                  <p className="text-xs text-text-secondary/50 mt-1 leading-relaxed">{move.description}</p>
                </div>
                {move.requires_target && (
                  <span className="text-[10px] text-text-secondary/30 mt-1 shrink-0">Hedef gerekli</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Step 2: Target Selection (for moves that require it) */}
        {step === 'target' && (
          <div className="space-y-2 mb-8 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[3px] text-text-secondary/50 mb-3 font-semibold text-center">
              {nightMoves.find(m => m.id === selectedMove)?.label} — Hedef Sec
            </p>
            {alivePlayers
              .filter(p => p.name !== selfName)
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedTarget(p.name)
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                    selectedTarget === p.name ? 'ring-1 ring-[#8090cc]/40' : ''
                  }`}
                  style={{
                    background: selectedTarget === p.name
                      ? 'rgba(100,130,200,0.08)'
                      : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${selectedTarget === p.name
                      ? 'rgba(100,130,200,0.2)'
                      : 'rgba(255,255,255,0.06)'}`,
                  }}
                >
                  <div
                    className="w-8 h-8 rounded-full shrink-0"
                    style={{
                      backgroundColor: p.avatarColor,
                      border: '2px solid rgba(255,255,255,0.1)',
                    }}
                  />
                  <span className="text-sm text-text-primary font-medium">{p.name}</span>
                  <span className="text-xs text-text-secondary/50 ml-auto">{p.roleTitle}</span>
                </button>
              ))
            }
            <button
              onClick={handleTargetConfirm}
              disabled={!selectedTarget}
              className="w-full mt-4 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-20"
              style={{
                background: selectedTarget ? 'rgba(100,130,200,0.12)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${selectedTarget ? 'rgba(100,130,200,0.25)' : 'rgba(255,255,255,0.04)'}`,
                color: '#8090cc',
              }}
            >
              Onayla
            </button>
          </div>
        )}

        {/* Step 3: Omen Selection */}
        {step === 'omen' && omenOptions.length > 0 && (
          <div className="space-y-3 mb-8 animate-fade-in">
            <p className="text-[10px] uppercase tracking-[3px] text-text-secondary/50 mb-3 font-semibold text-center">
              Yarinin Alameti
            </p>
            {omenOptions.map(omen => (
              <button
                key={omen.id}
                onClick={() => handleOmenSelect(omen.id)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-xl transition-all duration-200"
                style={{
                  background: 'rgba(255,191,0,0.04)',
                  border: '1px solid rgba(255,191,0,0.1)',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,191,0,0.08)'
                  e.currentTarget.style.borderColor = 'rgba(255,191,0,0.2)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,191,0,0.04)'
                  e.currentTarget.style.borderColor = 'rgba(255,191,0,0.1)'
                }}
              >
                <span className="text-2xl">{omen.icon}</span>
                <span className="text-sm text-accent/80 font-medium">{omen.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Step 3 fallback: no omens */}
        {step === 'omen' && omenOptions.length === 0 && (
          <div className="text-center animate-fade-in">
            <p className="text-sm text-text-secondary/40">Alamet secenegi yok, gece sonucu bekleniyor...</p>
          </div>
        )}

        {/* Waiting */}
        {step === 'waiting' && (
          <div className="text-center flex flex-col items-center gap-4 animate-fade-in">
            <div className="w-6 h-6 border-2 border-[#8090cc]/20 border-t-[#8090cc]/50 rounded-full animate-spin" />
            <p className="text-sm text-text-secondary/40">Gece cozuluyor...</p>
          </div>
        )}
      </div>
    </div>
  )
}
