import React, { useState } from 'react'
import { useGame } from '../context/GameContext'

export const LobbyScene: React.FC = () => {
  const { status, gameId, worldBrief, worldSeed, connectionStatus, createGame, startGame } = useGame()
  const [loading, setLoading] = useState(false)

  const handleCreate = async () => {
    setLoading(true)
    try {
      await createGame(6, 5)
    } catch (err) {
      console.error('Failed to create game:', err)
    }
    setLoading(false)
  }

  const handleStart = async () => {
    setLoading(true)
    try {
      await startGame()
    } catch (err) {
      console.error('Failed to start game:', err)
    }
    setLoading(false)
  }

  return (
    <div className="relative flex flex-col items-center justify-center h-screen bg-[#050302] overflow-hidden">
      <div className="cf-glow" />
      <div className="cf-vignette" />

      <div className="relative z-10 text-center px-6 max-w-md w-full">
        {/* Title */}
        <p className="text-xs uppercase tracking-[4px] text-text-secondary/60 mb-2">AI vs Insan</p>
        <h1 className="text-3xl font-bold text-accent mb-2">Ocak Yemini</h1>
        <p className="text-sm text-text-secondary/60 mb-12">Sesli AI Turing Testi</p>

        {/* Step 1: Create Game */}
        {!gameId && (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="w-full px-6 py-4 rounded-xl bg-accent/20 border border-accent/30 text-accent font-semibold text-lg hover:bg-accent/30 transition-all disabled:opacity-50"
          >
            {loading ? 'Olusturuluyor...' : 'Yeni Oyun Olustur'}
          </button>
        )}

        {/* Step 2: World Info + Start */}
        {gameId && status === 'waiting' && (
          <div className="space-y-6 animate-fade-in">
            {/* World brief */}
            <div className="px-4 py-3 rounded-lg bg-white/5 border border-white/10">
              <p className="text-xs uppercase tracking-widest text-text-secondary/60 mb-2">Dunya</p>
              <p className="text-sm text-text-primary">{worldBrief}</p>
              {worldSeed && (
                <p className="text-xs text-accent/70 mt-2">{worldSeed.settlementName}</p>
              )}
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={loading}
              className="w-full px-6 py-4 rounded-xl bg-accent/20 border border-accent/30 text-accent font-semibold text-lg hover:bg-accent/30 transition-all disabled:opacity-50"
            >
              {loading ? 'Karakterler Uretiliyor...' : 'Oyunu Baslat'}
            </button>

            {loading && (
              <p className="text-xs text-text-secondary/50 animate-pulse">
                AI karakterler olusturuluyor, bu 30-60 saniye surebilir...
              </p>
            )}
          </div>
        )}

        {/* Step 3: Connecting */}
        {status === 'running' && connectionStatus !== 'connected' && (
          <div className="animate-fade-in">
            <p className="text-sm text-text-secondary animate-pulse">Baglaniyor...</p>
          </div>
        )}

        {/* Step 4: Connected, waiting for first event */}
        {status === 'running' && connectionStatus === 'connected' && (
          <div className="animate-fade-in">
            <p className="text-sm text-accent animate-pulse">Oyun basliyor...</p>
          </div>
        )}
      </div>

      {/* Game ID footer */}
      {gameId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <p className="text-xs text-text-secondary/30 font-mono">{gameId}</p>
        </div>
      )}
    </div>
  )
}
