import React, { createContext, useContext, useState, useCallback, useRef } from 'react'
import type { Phase, GamePlayer, ChatMessage, Transcript, VoteEntry, LocationDecision } from '../types/game'
import { PLAYERS, WORLD_SEED, DAY_SCRIPTS, SELF_PLAYER_ID } from '../data/mockData'

interface GameState {
  phase: Phase
  round: number
  players: GamePlayer[]
  messages: ChatMessage[]
  transcripts: Transcript[]
  votes: VoteEntry[]
  locationDecisions: LocationDecision[]
  exiledName: string | null
  exiledType: 'et_can' | 'yanki_dogmus' | null
  winner: 'et_can' | 'yanki_dogmus' | null
  morningText: string
  fading: boolean
}

interface GameContextValue extends GameState {
  worldSeed: typeof WORLD_SEED
  selfPlayerId: string
  advancePhase: () => void
  currentDayScript: typeof DAY_SCRIPTS[0] | null
}

const GameContext = createContext<GameContextValue | null>(null)

// Phase sırası — Day 1 full, Day 2 kısaltılmış
const DAY1_PHASES: Phase[] = [
  'morning', 'campfire_open', 'free_roam', 'house', 'campfire_close', 'vote', 'exile',
]
const DAY2_PHASES: Phase[] = [
  'morning', 'campfire_open', 'vote', 'exile', 'game_over',
]

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<GameState>({
    phase: 'morning',
    round: 1,
    players: PLAYERS.map(p => ({ ...p })),
    messages: [],
    transcripts: [],
    votes: [],
    locationDecisions: [],
    exiledName: null,
    exiledType: null,
    winner: null,
    morningText: DAY_SCRIPTS[0].morningText,
    fading: false,
  })

  const phaseIndexRef = useRef(0)

  const advancePhase = useCallback(() => {
    setState(prev => {
      const phases = prev.round === 1 ? DAY1_PHASES : DAY2_PHASES
      const nextIdx = phaseIndexRef.current + 1

      // Exile sonrası: round ilerlet veya game over
      if (nextIdx >= phases.length) {
        if (prev.round === 1) {
          // Day 2'ye geç
          phaseIndexRef.current = 0
          const day2 = DAY_SCRIPTS[1]
          const updatedPlayers = prev.players.map(p =>
            p.name === prev.exiledName ? { ...p, alive: false, exiledRound: 1 } : p
          )
          return {
            ...prev,
            fading: false,
            round: 2,
            phase: DAY2_PHASES[0],
            players: updatedPlayers,
            messages: [],
            transcripts: [],
            votes: [],
            locationDecisions: [],
            exiledName: null,
            exiledType: null,
            morningText: day2.morningText,
          }
        }
        // Day 2 bitti → game over
        phaseIndexRef.current = phases.length - 1
        const updatedPlayers = prev.players.map(p =>
          p.name === prev.exiledName ? { ...p, alive: false, exiledRound: 2 } : p
        )
        return {
          ...prev,
          fading: false,
          phase: 'game_over',
          players: updatedPlayers,
          winner: 'et_can',
          exiledName: null,
        }
      }

      phaseIndexRef.current = nextIdx
      const nextPhase = phases[nextIdx]
      const dayScript = DAY_SCRIPTS[prev.round - 1]

      // Her faz geçişinde ilgili verileri yükle
      const updates: Partial<GameState> = {
        phase: nextPhase,
        fading: false,
        messages: [],
        transcripts: [],
        votes: [],
        locationDecisions: [],
      }

      if (nextPhase === 'campfire_open') {
        // Mesajlar scene içinde trickle edilecek, boş başla
      }
      if (nextPhase === 'free_roam' && dayScript.freeRoamDecisions) {
        // Kararlar scene içinde trickle edilecek
      }
      if (nextPhase === 'house' && dayScript.houseTranscript) {
        // Transcript scene içinde trickle edilecek
      }
      if (nextPhase === 'vote') {
        // Oylar scene içinde trickle edilecek
      }
      if (nextPhase === 'exile') {
        updates.exiledName = dayScript.exiledName
        updates.exiledType = dayScript.exiledType
      }
      if (nextPhase === 'morning') {
        updates.morningText = dayScript.morningText
      }

      return { ...prev, ...updates }
    })
  }, [])

  const currentDayScript = DAY_SCRIPTS[state.round - 1] ?? null

  const value: GameContextValue = {
    ...state,
    worldSeed: WORLD_SEED,
    selfPlayerId: SELF_PLAYER_ID,
    advancePhase,
    currentDayScript,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be inside GameProvider')
  return ctx
}
