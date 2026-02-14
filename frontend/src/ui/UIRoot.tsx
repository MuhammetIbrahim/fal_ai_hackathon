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
import PlayerCardOverlay from './PlayerCardOverlay'
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
  const [totalPlayers, setTotalPlayers] = useState(4)
  const [aiCount, setAiCount] = useState(3)

  const handleCreateLobby = useCallback(async () => {
    const name = playerName.trim()
    if (!name) {
      setNotification({ message: 'Isim gir!', type: 'error' })
      setTimeout(() => setNotification(null), 2000)
      return
    }
    try {
      setLoading(true)
      const result = await createLobby(name, totalPlayers, aiCount) as any
      setLobbyCode(result.lobby_code)
      setIsHost(true)
      setMyName(name)
      // Host is already P0 from create — no need to join again
      setConnection(result.lobby_code, 'P0')
      // Set initial player list from lobby response so the Start button enables
      if (result.players) {
        useGameStore.getState().setPlayers(result.players)
      }
    } catch (err) {
      setNotification({
        message: `Lobi olusturulamadi: ${(err as Error).message}`,
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }, [playerName, totalPlayers, aiCount, setLobbyCode, setConnection, setMyName, setNotification])

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
      setNotification({ message: 'Lobi baslatiliyor...', type: 'info' })
      const result = await startLobby(lobbyCode, name)
      const gId = result.game_id

      // Connect WebSocket BEFORE starting game to avoid missing first events
      if (playerId) {
        wsManager.connect(gId, playerId)
        setConnection(gId, playerId)
      }

      // Wait for WS connection to establish
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Start the game (LLM character generation — can take 30-60s)
      setNotification({ message: 'Karakterler olusturuluyor... (30-60 sn)', type: 'info' })
      await startGame(gId)
      setNotification(null)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto py-8">
      {/* Backdrop — dark with subtle vignette */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, #1a1208 0%, #0d0a04 60%, #050302 100%)',
        }}
      />
      {/* Ambient fire glow at bottom center */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at bottom center, rgba(255,140,0,0.08) 0%, transparent 70%)',
        }}
      />

      {/* ── Main card ── */}
      <div className="relative w-[420px] max-w-[92vw]">
        {/* Outermost glow ring */}
        <div
          className="absolute -inset-[12px] pointer-events-none rounded-sm"
          style={{
            border: '1px solid rgba(218,165,32,0.08)',
            boxShadow: '0 0 80px rgba(255,140,0,0.06), 0 0 120px rgba(218,165,32,0.04)',
          }}
        />

        {/* Outer ornamental border — double line effect */}
        <div
          className="absolute -inset-[6px] pointer-events-none"
          style={{
            border: '2px solid #5C3A1E',
            boxShadow: '0 0 0 1px #3a2210, inset 0 0 0 1px rgba(218,165,32,0.1), 0 0 50px rgba(255,140,0,0.1)',
          }}
        />

        {/* Inner card */}
        <div
          className="relative border border-wood/60"
          style={{
            background: 'linear-gradient(180deg, #1c140a 0%, #14100a 40%, #0f0b06 70%, #1a1208 100%)',
            boxShadow: 'inset 0 1px 0 rgba(218,165,32,0.15), inset 0 -1px 0 rgba(218,165,32,0.05), 0 16px 48px rgba(0,0,0,0.8)',
          }}
        >
          {/* Top decorative bar — gold accent */}
          <div className="h-[2px] bg-gradient-to-r from-transparent via-text-gold/50 to-transparent" />
          <div className="h-px bg-gradient-to-r from-transparent via-wood/30 to-transparent" />

          {/* Corner ornaments — larger L-shaped */}
          <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-text-gold/40" />
          <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-text-gold/40" />
          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-text-gold/40" />
          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-text-gold/40" />

          {/* Corner diamond accents */}
          <div className="absolute top-2 left-2 w-1.5 h-1.5 rotate-45 bg-text-gold/20" />
          <div className="absolute top-2 right-2 w-1.5 h-1.5 rotate-45 bg-text-gold/20" />
          <div className="absolute bottom-2 left-2 w-1.5 h-1.5 rotate-45 bg-text-gold/20" />
          <div className="absolute bottom-2 right-2 w-1.5 h-1.5 rotate-45 bg-text-gold/20" />

          {/* Content */}
          <div className="px-10 py-8 flex flex-col items-center">
            {/* ── Title section ── */}
            <div className="flex flex-col items-center gap-3 mb-8">
              {/* Fire emoji as logo */}
              <div className="text-[32px] mb-1" style={{ textShadow: '0 0 20px rgba(255,140,0,0.5)' }}>
                🔥
              </div>
              <h1
                className="text-text-gold text-[20px] font-pixel tracking-[0.15em]"
                style={{ textShadow: '0 0 12px rgba(218,165,32,0.3)' }}
              >
                Ocak Yemini
              </h1>
              <p className="text-stone text-[9px] font-pixel tracking-wider">
                Sosyal Deduksiyon Oyunu
              </p>
              {/* Decorative divider under title */}
              <div className="flex items-center gap-3 w-full mt-2">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wood/40" />
                <div className="w-1.5 h-1.5 rotate-45 border border-text-gold/40" />
                <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wood/40" />
              </div>
            </div>

            {/* ── Not in lobby yet ── */}
            {!lobbyCode && (
              <div className="flex flex-col items-center gap-5 w-full">
                {/* Name input */}
                <div className="w-full max-w-[280px]">
                  <label className="block text-stone text-[8px] font-pixel mb-2 text-center tracking-wider uppercase">
                    Karakter Adin
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Isim gir..."
                    className="w-full px-5 py-3 bg-[#0f0b06] border-2 border-wood/50 text-text-light font-pixel text-[11px] outline-none focus:border-text-gold/80 placeholder:text-stone/40 text-center transition-colors"
                    style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}
                  />
                </div>

                {/* Player/AI count config */}
                <div className="w-full max-w-[280px] flex gap-4">
                  <div className="flex-1">
                    <label className="block text-stone text-[7px] font-pixel mb-1.5 text-center tracking-wider uppercase">
                      Toplam Oyuncu
                    </label>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => { const v = Math.max(3, totalPlayers - 1); setTotalPlayers(v); setAiCount(Math.min(aiCount, v - 1)) }}
                        className="px-2 py-1 border border-wood/50 text-stone text-[10px] font-pixel hover:border-text-gold"
                      >-</button>
                      <span className="text-text-gold text-[12px] font-pixel w-6 text-center">{totalPlayers}</span>
                      <button
                        onClick={() => setTotalPlayers(Math.min(10, totalPlayers + 1))}
                        className="px-2 py-1 border border-wood/50 text-stone text-[10px] font-pixel hover:border-text-gold"
                      >+</button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="block text-stone text-[7px] font-pixel mb-1.5 text-center tracking-wider uppercase">
                      AI Sayisi
                    </label>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => setAiCount(Math.max(1, aiCount - 1))}
                        className="px-2 py-1 border border-wood/50 text-stone text-[10px] font-pixel hover:border-text-gold"
                      >-</button>
                      <span className="text-text-gold text-[12px] font-pixel w-6 text-center">{aiCount}</span>
                      <button
                        onClick={() => setAiCount(Math.min(totalPlayers - 1, aiCount + 1))}
                        className="px-2 py-1 border border-wood/50 text-stone text-[10px] font-pixel hover:border-text-gold"
                      >+</button>
                    </div>
                  </div>
                </div>
                <span className="text-stone/50 text-[7px] font-pixel">
                  {totalPlayers - aiCount} insan + {aiCount} AI = {totalPlayers} oyuncu
                </span>

                {/* Action buttons */}
                <div className="flex flex-col items-center gap-3 w-full max-w-[280px]">
                  <PixelButton
                    label="Lobi Olustur"
                    onClick={handleCreateLobby}
                    variant="fire"
                    size="lg"
                    disabled={loading || !playerName.trim()}
                  />

                  <PixelButton
                    label="AI Demo (Sadece Izle)"
                    onClick={handleAIDemo}
                    variant="stone"
                    size="lg"
                    disabled={loading}
                  />
                </div>

                {/* Divider */}
                <div className="flex items-center gap-4 w-full max-w-[280px] my-1">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wood/30" />
                  <span className="text-stone/60 text-[8px] font-pixel uppercase tracking-widest">veya</span>
                  <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wood/30" />
                </div>

                {/* Join lobby */}
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="block text-stone text-[7px] font-pixel mb-1.5 text-center tracking-wider uppercase">
                      Lobi Kodu
                    </label>
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="ABCDEF"
                      maxLength={8}
                      className="px-4 py-3 bg-[#0f0b06] border-2 border-stone/40 text-text-light font-pixel text-[11px] outline-none focus:border-text-gold/80 placeholder:text-stone/30 w-[160px] text-center uppercase tracking-[0.2em] transition-colors"
                      style={{ boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.4)' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleJoinLobby()
                      }}
                    />
                  </div>
                  <PixelButton
                    label="Katil"
                    onClick={handleJoinLobby}
                    variant="wood"
                    disabled={loading || !joinCode.trim() || !playerName.trim()}
                  />
                </div>
              </div>
            )}

            {/* ── In a lobby ── */}
            {lobbyCode && (
              <div className="flex flex-col items-center gap-5 w-full">
                {/* Lobby code display */}
                <div
                  className="border-2 border-text-gold/30 px-8 py-4 text-center"
                  style={{
                    background: 'linear-gradient(180deg, rgba(218,165,32,0.06) 0%, transparent 100%)',
                    boxShadow: '0 0 20px rgba(218,165,32,0.05)',
                  }}
                >
                  <span className="text-stone text-[8px] font-pixel block mb-2 tracking-wider uppercase">
                    Lobi Kodu
                  </span>
                  <span
                    className="text-text-gold text-[18px] font-pixel tracking-[0.4em]"
                    style={{ textShadow: '0 0 8px rgba(218,165,32,0.3)' }}
                  >
                    {lobbyCode}
                  </span>
                </div>

                {/* Player list */}
                <div className="w-full max-w-[280px] border-2 border-wood/30 bg-[#0f0b06]/60 px-5 py-4">
                  <span className="text-stone text-[8px] font-pixel block mb-3 tracking-wider uppercase">
                    Oyuncular ({players.length})
                  </span>
                  <div className="space-y-2">
                    {players.length === 0 && (
                      <span className="text-stone/40 text-[9px] font-pixel">
                        Oyuncu bekleniyor...
                      </span>
                    )}
                    {players.map((p, idx) => (
                      <div key={p.slot_id} className="flex items-center gap-3 py-1 border-b border-wood/10 last:border-0">
                        <span className="text-stone/40 text-[8px] font-pixel w-4">{idx + 1}.</span>
                        <div className="w-2 h-2 rounded-full bg-green-400/80" />
                        <span className="text-text-light text-[10px] font-pixel">
                          {p.name}
                        </span>
                        {p.role_title && p.role_title !== 'Villager' && (
                          <span className="text-stone/50 text-[8px] font-pixel ml-auto">
                            {p.role_title}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connection status */}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-fire-red animate-pulse'}`}
                  />
                  <span className="text-stone text-[8px] font-pixel">
                    {connected ? 'Baglanti kuruldu' : 'Baglanti bekleniyor...'}
                  </span>
                </div>

                {/* Start game button (host only) */}
                {isHost && (
                  <div className="mt-2">
                    <PixelButton
                      label="Oyunu Baslat"
                      onClick={handleStartGame}
                      variant="fire"
                      size="lg"
                      disabled={loading || players.length < 1}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="mt-4 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-fire-orange animate-pulse" />
                <span className="text-fire-orange text-[9px] font-pixel animate-pulse">
                  Yukleniyor...
                </span>
              </div>
            )}
          </div>

          {/* Bottom decorative bar */}
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
      {/* Floating button — top-left */}
      <button
        onClick={() => setShowMyCharacter(!showMyCharacter)}
        className="fixed top-3 left-3 z-40 flex items-center gap-2 px-3 py-2 border border-text-gold/40 hover:border-text-gold/70 transition-all"
        style={{
          background: 'linear-gradient(180deg, rgba(26,18,8,0.95) 0%, rgba(15,11,6,0.95) 100%)',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        }}
      >
        <span className="text-text-gold text-[10px] font-pixel">
          {myCharacterInfo.name}
        </span>
        <span className="text-stone/50 text-[8px] font-pixel">
          {showMyCharacter ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown panel */}
      {showMyCharacter && (
        <div
          className="fixed top-12 left-3 z-40 w-[280px] border border-text-gold/40"
          style={{
            background: 'linear-gradient(180deg, rgba(26,18,8,0.98) 0%, rgba(15,11,6,0.98) 100%)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
          }}
        >
          <div className="h-px bg-gradient-to-r from-transparent via-text-gold/40 to-transparent" />
          <div className="px-4 py-3 flex flex-col gap-2">
            {myCharacterInfo.avatar_url && (
              <img
                src={myCharacterInfo.avatar_url}
                alt={myCharacterInfo.name}
                className="w-16 h-16 border border-wood/40 self-center"
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
            {myCharacterInfo.archetype_label && (
              <span className="text-wood text-[8px] font-pixel text-center">
                {myCharacterInfo.archetype_label}
              </span>
            )}
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
      <div className="absolute inset-0 bg-black/80" />
      <div
        className="relative max-w-sm w-full mx-4 border-2 border-text-gold/60"
        style={{
          background: 'linear-gradient(180deg, #1a1208 0%, #14100a 50%, #1a1208 100%)',
          boxShadow: '0 0 60px rgba(218,165,32,0.15), 0 12px 40px rgba(0,0,0,0.7)',
        }}
      >
        <div className="h-[3px] bg-gradient-to-r from-transparent via-text-gold/40 to-transparent" />
        <div className="px-8 py-6 flex flex-col items-center gap-4">
          {/* Avatar */}
          {characterCard.avatar_url && (
            <img
              src={characterCard.avatar_url}
              alt={characterCard.name}
              className="w-24 h-24 border-2 border-wood/50"
              style={{ imageRendering: 'pixelated' }}
            />
          )}

          {/* Name */}
          <h2
            className="text-text-gold text-[16px] font-pixel tracking-wider"
            style={{ textShadow: '0 0 12px rgba(218,165,32,0.3)' }}
          >
            {characterCard.name}
          </h2>

          {/* Role */}
          <span className="text-stone text-[10px] font-pixel">
            {characterCard.role_title}
          </span>

          {/* Side */}
          <span className={`text-[10px] font-pixel ${sideColor}`}>
            {sideLabel}
          </span>

          {/* Archetype */}
          {characterCard.archetype_label && (
            <span className="text-wood text-[9px] font-pixel">
              {characterCard.archetype_label}
            </span>
          )}

          {/* Lore */}
          {characterCard.lore && (
            <p className="text-text-light/70 text-[9px] font-pixel text-center leading-relaxed max-h-[120px] overflow-y-auto">
              {characterCard.lore}
            </p>
          )}

          {/* Divider */}
          <div className="flex items-center gap-3 w-full mt-2">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent to-wood/40" />
            <div className="w-1.5 h-1.5 rotate-45 border border-text-gold/40" />
            <div className="flex-1 h-px bg-gradient-to-l from-transparent to-wood/40" />
          </div>

          {/* Close button */}
          <button
            onClick={() => setCharacterCard(null)}
            className="px-6 py-2 border-2 border-text-gold/50 text-text-gold text-[10px] font-pixel tracking-wider hover:bg-text-gold/10 transition-colors"
          >
            Anladim
          </button>
        </div>
        <div className="h-[3px] bg-gradient-to-r from-transparent via-wood/30 to-transparent" />
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

      {/* Character info button — visible during gameplay (not lobby) */}
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

      {/* Player card overlay (character inspection on map click) */}
      <div className="pointer-events-auto">
        <PlayerCardOverlay />
      </div>

      {/* Character reveal modal (shown once at game start) */}
      <div className="pointer-events-auto">
        <CharacterRevealModal />
      </div>
    </div>
  )
}

export default UIRoot
