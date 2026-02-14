import React, { useState, useCallback, useEffect } from 'react'
import { useGameStore } from '../state/GameStore'
import { createGame, startGame } from '../net/api'
import { wsManager } from '../net/websocket'
import { audioQueue } from '../audio/AudioQueue'

import StatusHUD from './StatusHUD'
import ActionBar from './ActionBar'
import RoomChatOverlay from './RoomChatOverlay'
import OmenDisplay from './OmenDisplay'
import VoteOverlay from './VoteOverlay'
import ParchmentModal from './ParchmentModal'
import CardReveal from './CardReveal'
import NotificationToast from './NotificationToast'
import ProposalPanel from './ProposalPanel'
import NightPanel from './NightPanel'
import TransitionOverlay from './TransitionOverlay'
import PlayerCardOverlay from './PlayerCardOverlay'
import PixelButton from './PixelButton'
import PipelineMetrics from './PipelineMetrics'

// ── Loading messages that cycle during character generation ──
const LOADING_STEPS = [
  'Köy kuruluyor...',
  'Karakterler şekilleniyor...',
  'Hikâyeler yazılıyor...',
  'Roller dağıtılıyor...',
  'Sesler atanıyor...',
  'Son hazırlıklar yapılıyor...',
]

// ── Atmospheric Loading Screen ──
const LoadingScreen: React.FC = () => {
  const [stepIndex, setStepIndex] = useState(0)
  const [dots, setDots] = useState('')

  // Cycle through loading steps
  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((prev) => (prev + 1) % LOADING_STEPS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // Animated dots
  useEffect(() => {
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Deep dark background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1208 0%, #0d0a04 50%, #030201 100%)',
        }}
      />

      {/* Animated fire glow — pulsing */}
      <div
        className="absolute bottom-[30%] left-1/2 -translate-x-1/2 w-[400px] h-[400px] pointer-events-none animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(255,140,0,0.12) 0%, rgba(255,80,0,0.06) 40%, transparent 70%)',
          animationDuration: '3s',
        }}
      />

      {/* Floating embers (CSS particles) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: i % 3 === 0 ? '3px' : '2px',
              height: i % 3 === 0 ? '3px' : '2px',
              backgroundColor: `rgba(255,${140 + (i % 4) * 20},0,${0.3 + (i % 3) * 0.2})`,
              left: `${30 + (i * 3.7) % 40}%`,
              bottom: `${10 + (i * 7) % 30}%`,
              animation: `float-up ${4 + (i % 3) * 2}s ease-out infinite`,
              animationDelay: `${i * 0.6}s`,
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative flex flex-col items-center gap-8">
        {/* Fire icon with glow */}
        <div
          className="text-[48px] animate-pulse"
          style={{
            filter: 'drop-shadow(0 0 30px rgba(255,140,0,0.5))',
            animationDuration: '2s',
          }}
        >
          🔥
        </div>

        {/* Title */}
        <h1
          className="text-text-gold text-[18px] font-pixel tracking-[0.2em]"
          style={{ textShadow: '0 0 16px rgba(218,165,32,0.4)' }}
        >
          Ocak Yemini
        </h1>

        {/* Loading message */}
        <div className="flex flex-col items-center gap-4">
          <p className="text-text-light/80 text-[10px] font-pixel tracking-wider transition-all duration-500">
            {LOADING_STEPS[stepIndex]}{dots}
          </p>

          {/* Progress bar */}
          <div
            className="w-[200px] h-[3px] rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(139,94,60,0.2)' }}
          >
            <div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg, rgba(218,165,32,0.6), rgba(255,140,0,0.8))',
                animation: 'loading-bar 3s ease-in-out infinite',
              }}
            />
          </div>

          {/* 3 character slots */}
          <div className="flex gap-6 mt-4">
            {['alloy', 'zeynep', 'ali'].map((voice, i) => (
              <div
                key={voice}
                className="flex flex-col items-center gap-2 animate-pulse"
                style={{ animationDelay: `${i * 0.5}s`, animationDuration: '2.5s' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center"
                  style={{
                    border: '1px solid rgba(218,165,32,0.3)',
                    backgroundColor: 'rgba(218,165,32,0.05)',
                    boxShadow: '0 0 16px rgba(218,165,32,0.08)',
                  }}
                >
                  <span className="text-text-gold/40 text-[16px] font-pixel">?</span>
                </div>
                <span className="text-stone/30 text-[7px] font-pixel">
                  {voice === 'alloy' ? 'Ses 1' : voice === 'zeynep' ? 'Ses 2' : 'Ses 3'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes float-up {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 0.5; }
          100% { transform: translateY(-200px) scale(0.3); opacity: 0; }
        }
        @keyframes loading-bar {
          0% { width: 0%; }
          50% { width: 80%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  )
}

// ── Landing / Demo Start Screen ──
const LandingUI: React.FC = () => {
  const setConnection = useGameStore((s) => s.setConnection)
  const setMyName = useGameStore((s) => s.setMyName)
  const setNotification = useGameStore((s) => s.setNotification)

  const [loading, setLoading] = useState(false)

  const handleStartDemo = useCallback(async () => {
    audioQueue.unlock()
    try {
      setLoading(true)
      // 3 AI players, 3 AI, 1 day — short demo
      const result = await createGame(3, 3, 1)
      const gId = result.game_id

      // Connect WS as spectator
      wsManager.connect(gId, 'spectator')
      setConnection(gId, 'spectator')
      setMyName('Seyirci')

      // Wait for WS connection
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Start the game (character generation + game loop)
      await startGame(gId)
    } catch (err) {
      setNotification({
        message: `Demo baslatilamadi: ${(err as Error).message}`,
        type: 'error',
      })
      setLoading(false)
    }
  }, [setConnection, setMyName, setNotification])

  // Show loading screen when loading
  if (loading) return <LoadingScreen />

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1208 0%, #0d0a04 60%, #050302 100%)',
        }}
      />

      {/* Fire glow */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at bottom center, rgba(255,140,0,0.1) 0%, transparent 70%)',
        }}
      />

      {/* Card */}
      <div className="relative w-[420px] max-w-[92vw]">
        {/* Outer glow */}
        <div
          className="absolute -inset-[6px] pointer-events-none"
          style={{
            border: '1px solid rgba(92,58,30,0.4)',
            boxShadow: '0 0 60px rgba(255,140,0,0.08)',
          }}
        />

        <div
          className="relative"
          style={{
            background: 'linear-gradient(180deg, #1c140a 0%, #14100a 40%, #0f0b06 70%, #1a1208 100%)',
            border: '1px solid rgba(139,94,60,0.5)',
            boxShadow: 'inset 0 1px 0 rgba(218,165,32,0.15), 0 16px 48px rgba(0,0,0,0.8)',
          }}
        >
          {/* Top accent */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-text-gold/50 to-transparent" />

          {/* Corner ornaments */}
          <div className="absolute top-0 left-0 w-5 h-5 border-t border-l border-text-gold/30" />
          <div className="absolute top-0 right-0 w-5 h-5 border-t border-r border-text-gold/30" />
          <div className="absolute bottom-0 left-0 w-5 h-5 border-b border-l border-text-gold/30" />
          <div className="absolute bottom-0 right-0 w-5 h-5 border-b border-r border-text-gold/30" />

          {/* Content */}
          <div className="px-10 py-10 flex flex-col items-center">
            {/* Logo */}
            <div
              className="text-[40px] mb-4"
              style={{ textShadow: '0 0 24px rgba(255,140,0,0.5)' }}
            >
              🔥
            </div>

            {/* Title */}
            <h1
              className="text-text-gold text-[22px] font-pixel tracking-[0.15em] mb-2"
              style={{ textShadow: '0 0 14px rgba(218,165,32,0.3)' }}
            >
              Ocak Yemini
            </h1>

            <p className="text-stone/70 text-[9px] font-pixel tracking-wider mb-2">
              AI Sosyal Dedüksiyon Oyunu
            </p>

            {/* Subtitle */}
            <p className="text-text-light/50 text-[8px] font-pixel text-center leading-relaxed max-w-[260px] mb-8">
              3 AI karakter, benzersiz sesler ve kişilikler.
              Kim sahtekar, kim masum? İzle ve keşfet.
            </p>

            {/* Divider */}
            <div className="flex items-center gap-3 w-full max-w-[260px] mb-8">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wood/40" />
              <div className="w-1.5 h-1.5 rotate-45 border border-text-gold/30" />
              <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wood/40" />
            </div>

            {/* Start button */}
            <PixelButton
              label="Demoyu Başlat"
              onClick={handleStartDemo}
              variant="fire"
              size="lg"
              disabled={loading}
            />

            {/* Tech badges */}
            <div className="flex items-center gap-3 mt-8">
              <span className="text-stone/30 text-[7px] font-pixel tracking-wider">
                fal.ai TTS
              </span>
              <div className="w-0.5 h-0.5 rounded-full bg-stone/20" />
              <span className="text-stone/30 text-[7px] font-pixel tracking-wider">
                Gemini LLM
              </span>
              <div className="w-0.5 h-0.5 rounded-full bg-stone/20" />
              <span className="text-stone/30 text-[7px] font-pixel tracking-wider">
                Real-time WS
              </span>
            </div>
          </div>

          {/* Bottom accent */}
          <div className="h-px bg-gradient-to-r from-transparent via-wood/30 to-transparent" />
          <div className="h-[2px] bg-gradient-to-r from-transparent via-text-gold/30 to-transparent" />
        </div>
      </div>
    </div>
  )
}

// ── Character Info Button (floating, during gameplay) ──
const CharacterInfoButton: React.FC = () => {
  const myCharacterInfo = useGameStore((s) => s.myCharacterInfo)
  const showMyCharacter = useGameStore((s) => s.showMyCharacter)
  const setShowMyCharacter = useGameStore((s) => s.setShowMyCharacter)

  if (!myCharacterInfo) return null

  return (
    <>
      <button
        onClick={() => setShowMyCharacter(!showMyCharacter)}
        className="fixed top-3 left-3 z-40 flex items-center gap-2 px-3 py-2 rounded transition-all"
        style={{
          background: 'linear-gradient(180deg, rgba(26,18,8,0.95) 0%, rgba(15,11,6,0.95) 100%)',
          border: '1px solid rgba(218,165,32,0.3)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <span className="text-text-gold text-[10px] font-pixel">
          {myCharacterInfo.name}
        </span>
        <span className="text-stone/50 text-[8px] font-pixel">
          {showMyCharacter ? '\u25B2' : '\u25BC'}
        </span>
      </button>

      {showMyCharacter && (
        <div
          className="fixed top-12 left-3 z-40 w-[280px] rounded-lg overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(26,18,8,0.98) 0%, rgba(15,11,6,0.98) 100%)',
            border: '1px solid rgba(218,165,32,0.3)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          <div className="h-px bg-gradient-to-r from-transparent via-text-gold/40 to-transparent" />
          <div className="px-4 py-3 flex flex-col gap-2">
            {myCharacterInfo.avatar_url && (
              <img
                src={myCharacterInfo.avatar_url}
                alt={myCharacterInfo.name}
                className="w-16 h-16 rounded border border-wood/40 self-center"
                style={{ imageRendering: 'pixelated' }}
              />
            )}
            <h3
              className="text-text-gold text-[12px] font-pixel text-center"
              style={{ textShadow: '0 0 8px rgba(218,165,32,0.3)' }}
            >
              {myCharacterInfo.name}
            </h3>
            <span className="text-stone text-[9px] font-pixel text-center">
              {myCharacterInfo.role_title}
            </span>
            <span className={`text-[8px] font-pixel text-center ${myCharacterInfo.player_type === 'et_can' ? 'text-green-400' : 'text-red-400'}`}>
              {myCharacterInfo.player_type === 'et_can' ? 'Et u Can (Koylu)' : 'Yanki Dogmus (Sahtekar)'}
            </span>
            {myCharacterInfo.lore && (
              <p className="text-text-light/60 text-[8px] font-pixel text-center leading-relaxed mt-1">
                {myCharacterInfo.lore}
              </p>
            )}
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-wood/20 to-transparent" />
        </div>
      )}
    </>
  )
}

// ── Character Reveal Modal ──
const CharacterRevealModal: React.FC = () => {
  const characterCard = useGameStore((s) => s.characterCard)
  const setCharacterCard = useGameStore((s) => s.setCharacterCard)

  if (!characterCard) return null

  const sideLabel = characterCard.player_type === 'et_can' ? 'Et u Can (Koylu)' : 'Yanki Dogmus (Sahtekar)'
  const sideColor = characterCard.player_type === 'et_can' ? 'text-green-400' : 'text-red-400'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative max-w-sm w-full mx-4 rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a1208 0%, #14100a 50%, #1a1208 100%)',
          border: '1px solid rgba(218,165,32,0.4)',
          boxShadow: '0 0 60px rgba(218,165,32,0.15), 0 12px 40px rgba(0,0,0,0.7)',
        }}
      >
        <div className="h-[3px] bg-gradient-to-r from-transparent via-text-gold/40 to-transparent" />
        <div className="px-8 py-6 flex flex-col items-center gap-4">
          {characterCard.avatar_url && (
            <img
              src={characterCard.avatar_url}
              alt={characterCard.name}
              className="w-24 h-24 rounded-lg border border-wood/40"
              style={{ imageRendering: 'pixelated' }}
            />
          )}

          <h2
            className="text-text-gold text-[16px] font-pixel tracking-wider"
            style={{ textShadow: '0 0 12px rgba(218,165,32,0.3)' }}
          >
            {characterCard.name}
          </h2>

          <span className="text-stone text-[10px] font-pixel">
            {characterCard.role_title}
          </span>

          <span className={`text-[10px] font-pixel ${sideColor}`}>
            {sideLabel}
          </span>

          {characterCard.lore && (
            <p className="text-text-light/70 text-[9px] font-pixel text-center leading-relaxed max-h-[120px] overflow-y-auto">
              {characterCard.lore}
            </p>
          )}

          <div className="flex items-center gap-3 w-full mt-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wood/40" />
            <div className="w-1.5 h-1.5 rotate-45 border border-text-gold/40" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wood/40" />
          </div>

          <button
            onClick={() => setCharacterCard(null)}
            className="px-6 py-2 rounded text-text-gold text-[10px] font-pixel tracking-wider hover:bg-text-gold/10 transition-colors"
            style={{ border: '1px solid rgba(218,165,32,0.4)' }}
          >
            Anladim
          </button>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-transparent via-wood/30 to-transparent" />
      </div>
    </div>
  )
}

// ── Game Over UI ──
const GameOverUI: React.FC = () => {
  const gameOver = useGameStore((s) => s.gameOver)

  if (!gameOver) return null

  const winnerLabel = gameOver.winner === 'et_can' ? 'Et u Can' : 'Yanki Dogmus'
  const winnerColor = gameOver.winner === 'et_can' ? '#4ac850' : '#DC143C'

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Sparkle particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: '2px',
              height: '2px',
              backgroundColor: i % 2 === 0 ? 'rgba(218,165,32,0.8)' : 'rgba(255,255,255,0.6)',
              left: `${(i * 5.3 + 10) % 100}%`,
              top: `${(i * 7.1 + 5) % 100}%`,
              animation: `sparkle ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
      </div>

      <div
        className="relative max-w-lg w-full mx-4 rounded-lg overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #1a1208 0%, #14100a 50%, #0f0b06 100%)',
          border: '1px solid rgba(218,165,32,0.4)',
          boxShadow: '0 0 60px rgba(218,165,32,0.1), 0 16px 48px rgba(0,0,0,0.7)',
        }}
      >
        {/* Winner banner */}
        <div
          className="py-4 text-center"
          style={{
            background: `linear-gradient(180deg, ${winnerColor}15 0%, transparent 100%)`,
            borderBottom: `1px solid ${winnerColor}30`,
          }}
        >
          <div className="text-[24px] mb-2">🏆</div>
          <h1 className="text-[14px] font-pixel text-text-light tracking-wider mb-1">
            Oyun Sonu
          </h1>
          <h2
            className="text-[12px] font-pixel font-bold tracking-wider"
            style={{ color: winnerColor, textShadow: `0 0 12px ${winnerColor}40` }}
          >
            Kazanan: {winnerLabel}
          </h2>
        </div>

        {/* Character cards */}
        <div className="px-6 py-5">
          <div className="flex gap-5 justify-center flex-wrap">
            {gameOver.players.map((p) => {
              const isWinner = p.player_type === gameOver.winner
              const sideColor = p.player_type === 'et_can' ? '#4ac850' : '#DC143C'

              return (
                <div
                  key={p.name}
                  className="flex flex-col items-center gap-3 px-5 py-4 rounded-lg"
                  style={{
                    minWidth: '140px',
                    border: `1px solid ${isWinner ? sideColor + '50' : 'rgba(107,107,107,0.2)'}`,
                    backgroundColor: isWinner ? sideColor + '0a' : 'rgba(30,30,30,0.3)',
                    boxShadow: isWinner ? `0 0 24px ${sideColor}15, inset 0 0 20px ${sideColor}08` : 'none',
                  }}
                >
                  {/* Avatar */}
                  {p.avatar_url ? (
                    <img
                      src={p.avatar_url}
                      alt={p.name}
                      className="w-20 h-20 rounded-full object-cover"
                      style={{
                        border: `3px solid ${sideColor}50`,
                        boxShadow: isWinner ? `0 0 20px ${sideColor}30` : 'none',
                      }}
                    />
                  ) : (
                    <div
                      className="w-20 h-20 rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: sideColor + '15',
                        border: `3px solid ${sideColor}40`,
                      }}
                    >
                      <span className="text-[24px] font-pixel font-bold" style={{ color: sideColor }}>
                        {p.name.charAt(0)}
                      </span>
                    </div>
                  )}

                  <span className="text-text-light text-[11px] font-pixel font-bold text-center">
                    {p.name}
                  </span>

                  <span className="text-stone/70 text-[9px] font-pixel text-center">
                    {p.role_title}
                  </span>

                  <span
                    className="text-[8px] font-pixel px-3 py-1 rounded-full"
                    style={{
                      color: sideColor,
                      border: `1px solid ${sideColor}40`,
                      backgroundColor: sideColor + '10',
                    }}
                  >
                    {p.player_type === 'et_can' ? 'Et u Can' : 'Yanki Dogmus'}
                  </span>

                  {isWinner && (
                    <span className="text-[8px] font-pixel text-text-gold font-bold">★ Kazanan</span>
                  )}
                  {!p.alive && (
                    <span className="text-[7px] font-pixel text-accent-red/60">Sürgün</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Replay button */}
        <div
          className="flex justify-center py-4"
          style={{ borderTop: '1px solid rgba(139,94,60,0.2)' }}
        >
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded text-text-gold text-[10px] font-pixel tracking-wider hover:bg-text-gold/10 transition-colors"
            style={{ border: '1px solid rgba(218,165,32,0.3)' }}
          >
            Tekrar İzle
          </button>
        </div>
      </div>

      <style>{`
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1.5); }
        }
      `}</style>
    </div>
  )
}

// ── Main UIRoot ──
export const UIRoot: React.FC = () => {
  const phase = useGameStore((s) => s.phase)
  const morningText = useGameStore((s) => s.morningText)
  const showParchment = useGameStore((s) => s.showParchment)
  const spotlightCards = useGameStore((s) => s.spotlightCards)
  const proposal = useGameStore((s) => s.proposal)
  const setShowParchment = useGameStore((s) => s.setShowParchment)

  return (
    <div className="fixed inset-0 pointer-events-none z-20">
      {/* Always visible layers */}
      <div className="pointer-events-auto">
        <StatusHUD />
      </div>

      {phase !== 'lobby' && (
        <div className="pointer-events-auto">
          <CharacterInfoButton />
        </div>
      )}

      <div className="pointer-events-auto">
        <TransitionOverlay />
      </div>

      <div className="pointer-events-auto">
        <NotificationToast />
      </div>

      {/* Live pipeline metrics overlay */}
      {phase !== 'lobby' && (
        <div className="pointer-events-auto">
          <PipelineMetrics />
        </div>
      )}

      {/* Lobby — now just the landing page */}
      {phase === 'lobby' && (
        <div className="pointer-events-auto">
          <LandingUI />
        </div>
      )}

      {phase === 'morning' && (
        <>
          {showParchment && morningText && (
            <div className="pointer-events-auto">
              <ParchmentModal
                text={morningText}
                onClose={() => setShowParchment(false)}
                showClose
              />
            </div>
          )}

          {!showParchment && (
            <div className="pointer-events-auto">
              <OmenDisplay />
            </div>
          )}

          {!showParchment && spotlightCards.length > 0 && (
            <div className="pointer-events-auto">
              <CardReveal cards={spotlightCards} />
            </div>
          )}
        </>
      )}

      {phase === 'campfire' && (
        <>
          <div className="pointer-events-auto">
            <RoomChatOverlay />
          </div>
          <div className="pointer-events-auto">
            <ActionBar />
          </div>
        </>
      )}

      {phase === 'day' && (
        <div className="pointer-events-auto">
          <ActionBar />
        </div>
      )}

      {phase === 'vote' && (
        <>
          <div className="pointer-events-auto">
            <VoteOverlay />
          </div>
          <div className="pointer-events-auto">
            <ActionBar />
          </div>
        </>
      )}

      {phase === 'night' && (
        <div className="pointer-events-auto">
          <NightPanel />
        </div>
      )}

      {phase === 'game_over' && (
        <div className="pointer-events-auto">
          <GameOverUI />
        </div>
      )}

      {proposal && (
        <div className="pointer-events-auto">
          <ProposalPanel />
        </div>
      )}

      <div className="pointer-events-auto">
        <PlayerCardOverlay />
      </div>

      <div className="pointer-events-auto">
        <CharacterRevealModal />
      </div>
    </div>
  )
}

export default UIRoot
