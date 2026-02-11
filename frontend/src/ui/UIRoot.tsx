import React, { useState, useCallback } from 'react'
import { useGameStore } from '../state/GameStore'
import { createLobby, joinLobby, startLobby, createGame, startGame } from '../net/api'
import { wsManager } from '../net/websocket'
import { audioQueue } from '../audio/AudioQueue'

import StatusHUD from './StatusHUD'
import ActionBar from './ActionBar'
import ChatLog from './ChatLog'
import RoomChatOverlay from './RoomChatOverlay'
import OmenDisplay from './OmenDisplay'
import VoteOverlay from './VoteOverlay'
import ParchmentModal from './ParchmentModal'
import CardReveal from './CardReveal'
import NotificationToast from './NotificationToast'
import ProposalPanel from './ProposalPanel'
import NightPanel from './NightPanel'
import TransitionOverlay from './TransitionOverlay'
import PixelButton from './PixelButton'

// ── Lobby UI (inline) ──
const LobbyUI: React.FC = () => {
  const lobbyCode = useGameStore((s) => s.lobbyCode)
  const gameId = useGameStore((s) => s.gameId)
  const playerId = useGameStore((s) => s.playerId)
  const connected = useGameStore((s) => s.connected)
  const players = useGameStore((s) => s.players)
  const setConnection = useGameStore((s) => s.setConnection)
  const setLobbyCode = useGameStore((s) => s.setLobbyCode)
  const setMyName = useGameStore((s) => s.setMyName)
  const setNotification = useGameStore((s) => s.setNotification)

  const [joinCode, setJoinCode] = useState('')
  const [playerName, setPlayerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [isHost, setIsHost] = useState(false)

  const handleCreateLobby = useCallback(async () => {
    const name = playerName.trim()
    if (!name) return
    try {
      setLoading(true)
      const result = await createLobby(name)
      setLobbyCode(result.lobby_code)
      setIsHost(true)
      setMyName(name)
      // Host is already P0 from create — no need to join again
      setConnection(result.lobby_code, 'P0')
    } catch (err) {
      setNotification({
        message: `Lobi olusturulamadi: ${(err as Error).message}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [playerName, setLobbyCode, setConnection, setMyName, setNotification])

  const handleJoinLobby = useCallback(async () => {
    const code = joinCode.trim().toUpperCase()
    const name = playerName.trim()
    if (!code || !name) return

    try {
      setLoading(true)
      const result = await joinLobby(code, name)
      setLobbyCode(code)
      setConnection(result.slot_id, result.slot_id)
      setMyName(name)
    } catch (err) {
      setNotification({
        message: `Lobiye katilamadi: ${(err as Error).message}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [joinCode, playerName, setLobbyCode, setConnection, setMyName, setNotification])

  const handleStartGame = useCallback(async () => {
    audioQueue.unlock()
    if (!lobbyCode) return
    const name = playerName.trim()
    if (!name) return

    try {
      setLoading(true)
      const result = await startLobby(lobbyCode, name)
      const gId = result.game_id

      // Start the game
      await startGame(gId)

      // Connect WebSocket
      if (playerId) {
        wsManager.connect(gId, playerId)
        setConnection(gId, playerId)
      }
    } catch (err) {
      setNotification({
        message: `Oyun baslatilamadi: ${(err as Error).message}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [lobbyCode, playerId, playerName, setConnection, setNotification])

  const handleAIDemo = useCallback(async () => {
    audioQueue.unlock()
    try {
      setLoading(true)
      // Create a game with all AI players (6 players, 6 AI, 3 days)
      const result = await createGame(6, 6, 3)
      const gId = result.game_id

      // Connect WS BEFORE starting game to avoid missing the first phase_change
      wsManager.connect(gId, 'spectator')
      setConnection(gId, 'spectator')
      setMyName('Seyirci')

      // Wait for WS connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Start the game (generates characters + starts game loop)
      await startGame(gId)
    } catch (err) {
      setNotification({
        message: `Demo baslatilamadi: ${(err as Error).message}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [setConnection, setMyName, setNotification])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1208 0%, #0a0804 100%)',
        }}
      />

      <div className="relative flex flex-col items-center gap-6">
        {/* Title */}
        <div className="flex flex-col items-center gap-2 mb-4">
          <h1 className="text-text-gold text-[16px] font-pixel tracking-wider">
            Ocak Yemini
          </h1>
          <p className="text-stone text-[8px] font-pixel">
            Sosyal Deduksiyon Oyunu
          </p>
        </div>

        {/* If not in a lobby yet */}
        {!lobbyCode && (
          <div className="flex flex-col items-center gap-4">
            {/* Name input */}
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Oyuncu adin..."
              className="px-4 py-2 bg-[#2a1f10] border-4 border-wood text-text-light font-pixel text-[10px] outline-none focus:border-text-gold placeholder:text-stone w-64 text-center"
            />

            {/* Create lobby */}
            <PixelButton
              label="Lobi Olustur"
              onClick={handleCreateLobby}
              variant="fire"
              size="lg"
              disabled={loading || !playerName.trim()}
            />

            {/* AI Demo */}
            <PixelButton
              label="AI Demo (Sadece Izle)"
              onClick={handleAIDemo}
              variant="stone"
              size="lg"
              disabled={loading}
            />

            {/* Divider */}
            <div className="flex items-center gap-3 w-64">
              <div className="flex-1 h-0.5 bg-wood/30" />
              <span className="text-stone text-[8px] font-pixel">veya</span>
              <div className="flex-1 h-0.5 bg-wood/30" />
            </div>

            {/* Join lobby */}
            <div className="flex gap-2">
              <input
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Lobi kodu..."
                maxLength={8}
                className="px-3 py-2 bg-[#2a1f10] border-4 border-stone text-text-light font-pixel text-[10px] outline-none focus:border-text-gold placeholder:text-stone w-40 text-center uppercase"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinLobby()
                }}
              />
              <PixelButton
                label="Katil"
                onClick={handleJoinLobby}
                variant="stone"
                disabled={loading || !joinCode.trim() || !playerName.trim()}
              />
            </div>
          </div>
        )}

        {/* If in a lobby */}
        {lobbyCode && (
          <div className="flex flex-col items-center gap-4">
            {/* Lobby code display */}
            <div className="border-4 border-wood bg-bg-dark/90 px-6 py-3 shadow-lg shadow-black/50">
              <span className="text-stone text-[8px] font-pixel block text-center mb-1">
                Lobi Kodu
              </span>
              <span className="text-text-gold text-[14px] font-pixel tracking-[0.3em]">
                {lobbyCode}
              </span>
            </div>

            {/* Player list */}
            <div className="border-4 border-stone bg-bg-dark/90 px-4 py-3 min-w-[200px] shadow-lg shadow-black/50">
              <span className="text-stone text-[8px] font-pixel block mb-2">
                Oyuncular ({players.length})
              </span>
              <div className="space-y-1">
                {players.length === 0 && (
                  <span className="text-stone/50 text-[8px] font-pixel">
                    Oyuncu bekleniyor...
                  </span>
                )}
                {players.map((p) => (
                  <div key={p.slot_id} className="flex items-center gap-2">
                    <div
                      className="w-2 h-2 rounded-full bg-green-400"
                      style={p.color ? { backgroundColor: p.color } : undefined}
                    />
                    <span className="text-text-light text-[9px] font-pixel">
                      {p.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-fire-red'}`}
              />
              <span className="text-stone text-[7px] font-pixel">
                {connected ? 'Bagli' : 'Baglanti bekleniyor'}
              </span>
            </div>

            {/* Start game button (host only) */}
            {isHost && (
              <PixelButton
                label="Oyunu Baslat"
                onClick={handleStartGame}
                variant="fire"
                size="lg"
                disabled={loading || players.length < 1}
              />
            )}
          </div>
        )}

        {/* Loading indicator */}
        {loading && (
          <div className="text-fire-orange text-[8px] font-pixel animate-pulse">
            Yukleniyor...
          </div>
        )}
      </div>
    </div>
  )
}

// ── Game Over UI (inline) ──
const GameOverUI: React.FC = () => {
  const gameOver = useGameStore((s) => s.gameOver)

  if (!gameOver) return null

  const winnerLabel = gameOver.winner === 'et_can' ? 'Et u Can' : 'Yanki Dogmus'

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative max-w-lg w-full mx-4 p-8"
        style={{
          background: 'linear-gradient(135deg, #d4b896 0%, #c4a876 50%, #d4b896 100%)',
          border: '6px double #8B5E3C',
          boxShadow: '0 0 0 2px #5C3A1E, 0 8px 32px rgba(0,0,0,0.6)',
        }}
      >
        <h1 className="text-[14px] font-pixel text-[#2a1f10] text-center mb-2">
          Oyun Sonu
        </h1>

        <h2 className="text-[12px] font-pixel text-text-gold text-center mb-6">
          Kazanan: {winnerLabel}
        </h2>

        {/* Player results */}
        <div className="space-y-2">
          {gameOver.players.map((p) => (
            <div
              key={p.name}
              className="flex items-center justify-between px-3 py-1.5 border-2 border-wood/30 bg-[#c4a876]/50"
            >
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    p.player_type === gameOver.winner ? 'bg-text-gold' : 'bg-accent-red'
                  }`}
                />
                <span className="text-[9px] font-pixel text-[#2a1f10]">
                  {p.name}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[8px] font-pixel text-[#5a4a30]">
                  {p.role_title}
                </span>
                <span
                  className={`text-[7px] font-pixel px-1.5 py-0.5 border ${
                    p.player_type === 'et_can'
                      ? 'border-green-600/50 text-green-800 bg-green-100/30'
                      : 'border-fire-red/50 text-accent-red bg-red-100/30'
                  }`}
                >
                  {p.player_type === 'et_can' ? 'Et u Can' : 'Yanki Dogmus'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
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
      {/* Always visible layers (pointer-events on individual children) */}
      <div className="pointer-events-auto">
        <StatusHUD />
      </div>

      <div className="pointer-events-auto">
        <TransitionOverlay />
      </div>

      <div className="pointer-events-auto">
        <NotificationToast />
      </div>

      {/* Phase-specific UI */}
      {phase === 'lobby' && (
        <div className="pointer-events-auto">
          <LobbyUI />
        </div>
      )}

      {phase === 'morning' && (
        <>
          {/* Parchment narrator modal */}
          {showParchment && morningText && (
            <div className="pointer-events-auto">
              <ParchmentModal
                text={morningText}
                onClose={() => setShowParchment(false)}
                showClose
              />
            </div>
          )}

          {/* Omen cards */}
          {!showParchment && (
            <div className="pointer-events-auto">
              <OmenDisplay />
            </div>
          )}

          {/* Spotlight card reveal */}
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

      {phase === 'houses' && (
        <>
          <div className="pointer-events-auto">
            <RoomChatOverlay />
          </div>
          <div className="pointer-events-auto">
            <ActionBar />
          </div>
        </>
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

      {phase === 'exile' && (
        <>{/* Canvas handles exile animation; no extra overlay needed */}</>
      )}

      {phase === 'game_over' && (
        <div className="pointer-events-auto">
          <GameOverUI />
        </div>
      )}

      {/* Proposal panel (can appear in any phase) */}
      {proposal && (
        <div className="pointer-events-auto">
          <ProposalPanel />
        </div>
      )}
    </div>
  )
}

export default UIRoot
