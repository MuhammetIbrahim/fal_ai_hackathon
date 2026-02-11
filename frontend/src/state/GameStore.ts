import { create } from 'zustand'
import type {
  Phase, Player, Omen, Speech, LocationDecision, HouseVisit,
  ExileResult, NightResult, SpotlightCard, Sinama, OcakTepki,
  Proposal, SozBorcu, UIObject, InputAction, GameOverData,
} from './types'

export interface GameStore {
  // Connection
  gameId: string | null
  playerId: string | null
  lobbyCode: string | null
  connected: boolean

  // Game state
  phase: Phase
  round: number
  dayLimit: number
  players: Player[]
  myName: string | null

  // Phase data
  morningText: string
  omens: Omen[]
  speeches: Speech[]
  locationDecisions: LocationDecision[]
  houseVisit: HouseVisit | null
  votes: Record<string, string>
  exileResult: ExileResult | null
  nightResult: NightResult | null
  gameOver: GameOverData | null

  // Layer features
  spotlightCards: SpotlightCard[]
  sinama: Sinama | null
  ocakTepki: OcakTepki | null
  uiObjects: Record<string, UIObject>
  proposal: Proposal | null
  sozBorcu: SozBorcu | null
  baskiTarget: string | null
  canUseKalkan: boolean

  // UI control
  inputRequired: InputAction | null
  notification: { message: string; type: 'info' | 'warning' | 'error' } | null
  transitioning: boolean
  showParchment: boolean

  // Actions
  setConnection: (gameId: string, playerId: string) => void
  setLobbyCode: (code: string) => void
  setConnected: (connected: boolean) => void
  setPhase: (phase: Phase) => void
  setPlayers: (players: Player[]) => void
  setMyName: (name: string) => void
  setMorningText: (text: string) => void
  setOmens: (omens: Omen[]) => void
  addSpeech: (speech: Speech) => void
  clearSpeeches: () => void
  setHouseVisit: (visit: HouseVisit | null) => void
  addVote: (voter: string, target: string) => void
  clearVotes: () => void
  setExileResult: (result: ExileResult | null) => void
  setNightResult: (result: NightResult | null) => void
  setGameOver: (data: GameOverData | null) => void
  setSpotlightCards: (cards: SpotlightCard[]) => void
  setSinama: (sinama: Sinama | null) => void
  setOcakTepki: (tepki: OcakTepki | null) => void
  setProposal: (proposal: Proposal | null) => void
  setInputRequired: (input: InputAction | null) => void
  setNotification: (notification: { message: string; type: 'info' | 'warning' | 'error' } | null) => void
  setTransitioning: (transitioning: boolean) => void
  setShowParchment: (show: boolean) => void
  setRound: (round: number) => void

  handleEvent: (event: string, data: Record<string, unknown>) => void
  reset: () => void
}

const initialState = {
  gameId: null,
  playerId: null,
  lobbyCode: null,
  connected: false,
  phase: 'lobby' as Phase,
  round: 0,
  dayLimit: 5,
  players: [],
  myName: null,
  morningText: '',
  omens: [],
  speeches: [],
  locationDecisions: [],
  houseVisit: null,
  votes: {},
  exileResult: null,
  nightResult: null,
  gameOver: null,
  spotlightCards: [],
  sinama: null,
  ocakTepki: null,
  uiObjects: {},
  proposal: null,
  sozBorcu: null,
  baskiTarget: null,
  canUseKalkan: true,
  inputRequired: null,
  notification: null,
  transitioning: false,
  showParchment: false,
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setConnection: (gameId, playerId) => set({ gameId, playerId }),
  setLobbyCode: (code) => set({ lobbyCode: code }),
  setConnected: (connected) => set({ connected }),
  setPhase: (phase) => set({ phase }),
  setPlayers: (players) => set({ players }),
  setMyName: (name) => set({ myName: name }),
  setMorningText: (text) => set({ morningText: text }),
  setOmens: (omens) => set({ omens }),
  addSpeech: (speech) => set((s) => ({ speeches: [...s.speeches, speech] })),
  clearSpeeches: () => set({ speeches: [] }),
  setHouseVisit: (visit) => set({ houseVisit: visit }),
  addVote: (voter, target) => set((s) => ({ votes: { ...s.votes, [voter]: target } })),
  clearVotes: () => set({ votes: {} }),
  setExileResult: (result) => set({ exileResult: result }),
  setNightResult: (result) => set({ nightResult: result }),
  setGameOver: (data) => set({ gameOver: data }),
  setSpotlightCards: (cards) => set({ spotlightCards: cards }),
  setSinama: (sinama) => set({ sinama }),
  setOcakTepki: (tepki) => set({ ocakTepki: tepki }),
  setProposal: (proposal) => set({ proposal }),
  setInputRequired: (input) => set({ inputRequired: input }),
  setNotification: (notification) => set({ notification }),
  setTransitioning: (transitioning) => set({ transitioning }),
  setShowParchment: (show) => set({ showParchment: show }),
  setRound: (round) => set({ round }),

  handleEvent: (event: string, data: Record<string, unknown>) => {
    const store = get()

    switch (event) {
      case 'connected':
        set({ connected: true })
        break

      case 'player_connected':
      case 'player_disconnected':
        if (data.active_players) {
          // Update player alive status based on active players
        }
        break

      case 'phase_change': {
        const phase = data.phase as Phase
        const round = (data.round as number) ?? store.round
        set({
          phase,
          round,
          transitioning: true,
          inputRequired: null,
        })
        // Clear phase-specific data on phase change
        if (phase === 'morning') {
          set({ speeches: [], votes: {}, exileResult: null, houseVisit: null })
        }
        if (phase === 'campfire') {
          set({ showParchment: false })
        }
        if (phase === 'vote') {
          set({ votes: {} })
        }
        // Auto clear transition after delay
        setTimeout(() => set({ transitioning: false }), 2000)
        break
      }

      case 'morning':
        set({
          morningText: (data.narrator as string) ?? '',
          omens: (data.omens as Omen[]) ?? [],
          showParchment: true,
          spotlightCards: (data.spotlight_cards as SpotlightCard[]) ?? [],
        })
        break

      case 'campfire_speech':
        store.addSpeech({
          speaker: data.speaker as string,
          content: data.content as string,
          audio_url: data.audio_url as string | undefined,
        })
        break

      case 'your_turn':
        set({
          inputRequired: {
            type: data.action_required as InputAction['type'],
            timeout_seconds: data.timeout_seconds as number | undefined,
          },
        })
        break

      case 'vote_confirmed':
        store.addVote(data.voter as string, data.target as string)
        break

      case 'exile':
        set({
          exileResult: {
            exiled: data.exiled as string,
            active_players: data.active_players as string[],
          },
          phase: 'exile',
        })
        break

      case 'game_over':
        set({
          gameOver: data as unknown as GameOverData,
          phase: 'game_over',
        })
        break

      case 'speech_audio':
        // Update the matching speech with audio_url
        set((s) => ({
          speeches: s.speeches.map((sp) =>
            sp.speaker === data.speaker
              ? { ...sp, audio_url: data.audio_url as string }
              : sp
          ),
        }))
        break

      case 'ocak_tepki':
        set({
          ocakTepki: {
            type: data.type as OcakTepki['type'],
            message: data.message as string,
            target: data.target as string | undefined,
          },
        })
        setTimeout(() => set({ ocakTepki: null }), 5000)
        break

      case 'house_visit':
        set({
          houseVisit: {
            host: data.host as string,
            visitor: data.visitor as string,
            speeches: [],
            turn: 0,
          },
        })
        break

      case 'visit_speech':
        if (store.houseVisit) {
          set({
            houseVisit: {
              ...store.houseVisit,
              speeches: [
                ...store.houseVisit.speeches,
                {
                  speaker: data.speaker as string,
                  content: data.content as string,
                  audio_url: data.audio_url as string | undefined,
                },
              ],
            },
          })
        }
        break

      case 'sinama':
        set({
          sinama: data as unknown as Sinama,
        })
        break

      case 'proposal':
        set({
          proposal: data as unknown as Proposal,
        })
        break

      case 'notification':
        set({
          notification: {
            message: data.message as string,
            type: (data.type as 'info' | 'warning' | 'error') ?? 'info',
          },
        })
        setTimeout(() => set({ notification: null }), 4000)
        break

      case 'players_update':
        set({ players: data.players as Player[] })
        break

      case 'error':
        set({
          notification: {
            message: data.message as string,
            type: 'error',
          },
        })
        setTimeout(() => set({ notification: null }), 5000)
        break

      default:
        console.log('[GameStore] Unhandled event:', event, data)
    }
  },

  reset: () => set(initialState),
}))
