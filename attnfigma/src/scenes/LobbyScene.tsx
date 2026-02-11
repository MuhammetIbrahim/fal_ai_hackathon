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
      <div className="cf-noise" />

      <div className="relative z-10 text-center px-6 max-w-md w-full">
        {/* Ates ikonu */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border border-accent/20 bg-accent/5 mb-4"
               style={{ boxShadow: '0 0 40px rgba(255,191,0,0.15), inset 0 0 20px rgba(255,191,0,0.05)' }}>
            <span className="text-4xl" style={{ filter: 'drop-shadow(0 0 8px rgba(255,140,0,0.6))' }}>&#128293;</span>
          </div>
        </div>

        {/* Title */}
        <p className="text-xs uppercase tracking-[5px] text-text-secondary/50 mb-3 font-light">AI vs Insan</p>
        <h1 className="text-4xl font-bold text-accent mb-1"
            style={{ textShadow: '0 0 30px rgba(255,191,0,0.3), 0 0 60px rgba(255,191,0,0.1)' }}>
          Ocak Yemini
        </h1>
        <p className="text-sm text-text-secondary/40 mb-2 italic">Sesli AI Turing Testi</p>

        {/* Ornamental divider */}
        <div className="flex items-center justify-center gap-3 my-8">
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-accent/30" />
          <span className="text-accent/40 text-xs">&#9670;</span>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-accent/30" />
        </div>

        {/* Step 1: Create Game */}
        {!gameId && (
          <button
            onClick={handleCreate}
            disabled={loading}
            className="group w-full px-6 py-4 rounded-2xl text-lg font-semibold transition-all duration-300 disabled:opacity-40"
            style={{
              background: 'linear-gradient(135deg, rgba(255,191,0,0.15) 0%, rgba(180,80,0,0.12) 100%)',
              border: '1px solid rgba(255,191,0,0.25)',
              color: '#FFBF00',
              boxShadow: '0 4px 20px rgba(255,191,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
            }}
          >
            <span className="group-hover:tracking-wider transition-all duration-300">
              {loading ? 'Olusturuluyor...' : 'Yeni Oyun Olustur'}
            </span>
          </button>
        )}

        {/* Step 2: World Info + Start */}
        {gameId && status === 'waiting' && (
          <div className="space-y-6 animate-fade-in">
            {/* World brief card */}
            <div className="relative px-5 py-4 rounded-xl overflow-hidden"
                 style={{
                   background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,191,0,0.03) 100%)',
                   border: '1px solid rgba(255,255,255,0.08)',
                   boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                 }}>
              <p className="text-[10px] uppercase tracking-[3px] text-accent/50 mb-3 font-semibold">Dunya Tohumu</p>
              <p className="text-sm text-text-primary/90 leading-relaxed">{worldBrief}</p>
              {worldSeed && (
                <div className="mt-3 pt-3 border-t border-white/5">
                  <p className="text-xs text-accent/70 font-semibold tracking-wide">{worldSeed.settlementName}</p>
                </div>
              )}
            </div>

            {/* Start button */}
            <button
              onClick={handleStart}
              disabled={loading}
              className="group w-full px-6 py-4 rounded-2xl text-lg font-semibold transition-all duration-300 disabled:opacity-40"
              style={{
                background: loading
                  ? 'rgba(255,191,0,0.05)'
                  : 'linear-gradient(135deg, rgba(139,0,0,0.4) 0%, rgba(180,60,0,0.3) 100%)',
                border: `1px solid ${loading ? 'rgba(255,191,0,0.1)' : 'rgba(255,100,0,0.3)'}`,
                color: loading ? 'rgba(255,191,0,0.5)' : '#FFBF00',
                boxShadow: loading ? 'none' : '0 4px 25px rgba(139,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  Karakterler Uretiliyor...
                </span>
              ) : (
                'Oyunu Baslat'
              )}
            </button>

            {loading && (
              <p className="text-xs text-text-secondary/40 animate-pulse">
                AI karakterler olusturuluyor, bu 30-60 saniye surebilir...
              </p>
            )}
          </div>
        )}

        {/* Step 3: Connecting */}
        {status === 'running' && connectionStatus !== 'connected' && (
          <div className="animate-fade-in flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-sm text-text-secondary/60">Baglaniyor...</p>
          </div>
        )}

        {/* Step 4: Connected */}
        {status === 'running' && connectionStatus === 'connected' && (
          <div className="animate-fade-in flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            <p className="text-sm text-accent/80">Oyun basliyor...</p>
          </div>
        )}
      </div>

      {/* Game ID footer */}
      {gameId && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10">
          <p className="text-[10px] text-text-secondary/20 font-mono tracking-wider">{gameId}</p>
        </div>
      )}
    </div>
  )
}
