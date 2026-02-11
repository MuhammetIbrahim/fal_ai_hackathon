import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type {
  Phase, GamePlayer, ChatMessage, VoteEntry, LocationDecision,
  WorldSeed, InputAction, HouseVisitState, Omen,
  SpotlightCard, SinamaEvent, SinamaType, OcakTepki,
  InstitutionVisitState, UIObject, MiniEvent,
  NightMove, NightResult,
  MorningCrisis, Proposal, ProposalResult, OmenInterpretationRound,
} from '../types/game'
import { useWebSocket, type ConnectionStatus } from '../hooks/useWebSocket'
import { useAudioQueue } from '../hooks/useAudioQueue'

// ── Avatar renk paleti (backend'den gelmez, biz atariz) ──
const AVATAR_COLORS = [
  '#D35400', '#1ABC9C', '#8E44AD', '#E67E22', '#2C3E50', '#C0392B',
  '#2980B9', '#27AE60', '#F39C12', '#7F8C8D',
]

// ── State ──────────────────────────────────────────

interface GameState {
  // Connection
  connectionStatus: ConnectionStatus
  gameId: string | null
  playerId: string | null

  // Game status
  status: 'lobby' | 'waiting' | 'running' | 'finished'
  phase: Phase
  round: number
  dayLimit: number

  // Players
  players: GamePlayer[]
  selfPlayerName: string | null

  // World
  worldSeed: WorldSeed | null
  worldBrief: string | null

  // Phase-specific (reset on phase change)
  morningText: string
  omens: Omen[]
  messages: ChatMessage[]
  locationDecisions: LocationDecision[]
  houseVisit: HouseVisitState | null
  votes: VoteEntry[]
  exiledName: string | null
  exiledType: string | null
  exiledRole: string | null
  winner: string | null
  allPlayersReveal: GamePlayer[] | null

  // Katman 1
  spotlightCards: SpotlightCard[]
  sinama: SinamaEvent | null
  ocakTepki: OcakTepki | null

  // Katman 2
  uiObjects: Record<string, UIObject>
  miniEvent: MiniEvent | null
  institutionVisit: InstitutionVisitState | null
  kulKaymasi: { speaker: string; question: string } | null

  // Katman 3
  nightMoves: NightMove[]
  omenOptions: Omen[]
  nightResult: NightResult | null
  baskisiTarget: string | null
  canUseKalkan: boolean

  // Katman 4
  morningCrisis: MorningCrisis | null
  proposal: Proposal | null
  proposalResult: ProposalResult | null
  omenInterpretation: OmenInterpretationRound | null
  sinamaEcho: string | null
  houseEntryEvent: string | null
  sozBorcu: { forcedSpeakers: string[]; damgali: string[] } | null

  // UI
  inputRequired: InputAction | null
}

interface GameContextValue extends GameState {
  // Actions
  createGame: (playerCount?: number, aiCount?: number) => Promise<void>
  startGame: () => Promise<void>
  sendSpeak: (content: string) => void
  sendVote: (target: string) => void
  sendLocationChoice: (choice: string) => void
  sendVisitSpeak: (content: string) => void
  sendNightMove: (choice: string) => void
  sendOmenChoice: (choice: string) => void
  sendKalkan: () => void
  sendProposalVote: (choice: string) => void
  clearInput: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

// ── Provider ──────────────────────────────────────

export const GameProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ws = useWebSocket()
  const audio = useAudioQueue()
  const msgCounter = useRef(0)

  const [state, setState] = useState<GameState>({
    connectionStatus: 'disconnected',
    gameId: null,
    playerId: null,
    status: 'lobby',
    phase: 'lobby',
    round: 0,
    dayLimit: 5,
    players: [],
    selfPlayerName: null,
    worldSeed: null,
    worldBrief: null,
    morningText: '',
    omens: [],
    messages: [],
    locationDecisions: [],
    houseVisit: null,
    votes: [],
    exiledName: null,
    exiledType: null,
    exiledRole: null,
    winner: null,
    allPlayersReveal: null,
    spotlightCards: [],
    sinama: null,
    ocakTepki: null,
    uiObjects: {},
    miniEvent: null,
    institutionVisit: null,
    kulKaymasi: null,
    nightMoves: [],
    omenOptions: [],
    nightResult: null,
    baskisiTarget: null,
    canUseKalkan: false,
    morningCrisis: null,
    proposal: null,
    proposalResult: null,
    omenInterpretation: null,
    sinamaEcho: null,
    houseEntryEvent: null,
    sozBorcu: null,
    inputRequired: null,
  })

  // Sync WS status
  useEffect(() => {
    setState(prev => ({ ...prev, connectionStatus: ws.status }))
  }, [ws.status])

  // ── WS Event Handlers ──────────────────────────

  useEffect(() => {
    const unsubs: (() => void)[] = []

    // phase_change → update phase, round, reset phase-specific data
    unsubs.push(ws.onEvent('phase_change', (data) => {
      const phase = mapPhase(data.phase as string)
      audio.stop() // Clear audio queue on phase change

      // Extract Katman 3 data from phase_change
      const nightMoves = (data.night_moves as NightMove[]) ?? []
      const omenOptions = (data.omen_options as Omen[]) ?? []
      const baskisiTarget = (data.baskisi_target as string) ?? null
      const canUseKalkan = (data.can_use_kalkan as boolean) ?? false

      setState(prev => ({
        ...prev,
        phase,
        round: (data.round as number) ?? prev.round,
        dayLimit: (data.day_limit as number) ?? prev.dayLimit,
        // Night phase data
        ...(phase === 'night' ? { nightMoves, omenOptions, nightResult: null } : {}),
        // Vote phase data (baskı)
        ...(phase === 'vote' ? { baskisiTarget, canUseKalkan } : {}),
        // Reset phase-specific data
        ...(phase !== prev.phase ? {
          morningText: '',
          omens: [],
          messages: [],
          locationDecisions: [],
          houseVisit: null,
          votes: [],
          exiledName: null,
          exiledType: null,
          spotlightCards: [],
          sinama: null,
          ocakTepki: null,
          miniEvent: null,
          institutionVisit: null,
          kulKaymasi: null,
          exiledRole: null,
          morningCrisis: null,
          proposal: null,
          proposalResult: null,
          omenInterpretation: null,
          sinamaEcho: null,
          houseEntryEvent: null,
          sozBorcu: null,
          inputRequired: null,
        } : {}),
      }))
    }))

    // morning → morning text + omens
    unsubs.push(ws.onEvent('morning', (data) => {
      const omens = (data.omens as Omen[]) ?? []
      setState(prev => ({
        ...prev,
        morningText: (data.content as string) ?? '',
        omens,
      }))
    }))

    // sinama → daily atmospheric test event (Katman 1)
    unsubs.push(ws.onEvent('sinama', (data) => {
      setState(prev => ({
        ...prev,
        sinama: {
          type: data.type as SinamaType,
          title: data.title as string,
          content: data.content as string,
          icon: data.icon as string,
        },
      }))
    }))

    // mini_event → mini event card (Katman 2)
    unsubs.push(ws.onEvent('mini_event', (data) => {
      setState(prev => ({
        ...prev,
        miniEvent: {
          id: data.id as string,
          content: data.content as string,
          uiObject: (data.ui_object as string) ?? '',
        },
      }))
    }))

    // spotlight_cards → spotlight cards for morning display (Katman 1)
    unsubs.push(ws.onEvent('spotlight_cards', (data) => {
      const rawCards = (data.cards as Array<{
        player_name: string; truths: string[]; agenda: string; oath: string
      }>) ?? []
      const cards: SpotlightCard[] = rawCards.map(c => ({
        playerName: c.player_name,
        truths: [c.truths[0] ?? '', c.truths[1] ?? ''] as [string, string],
        agenda: c.agenda ?? '',
        oath: c.oath ?? '',
      }))
      setState(prev => ({ ...prev, spotlightCards: cards }))
    }))

    // ocak_tepki → contradiction spark during campfire (Katman 1+2)
    unsubs.push(ws.onEvent('ocak_tepki', (data) => {
      msgCounter.current++
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          id: `ws-tepki-${msgCounter.current}`,
          sender: 'Ocak',
          text: data.message as string,
          isSelf: false,
          isSystem: true,
          timestamp: Date.now(),
        }],
        ocakTepki: {
          speaker: data.speaker as string,
          type: (data.type as 'kivilcim' | 'kul_kaymasi') ?? 'kivilcim',
          tier: data.tier as 'T1' | 'T2' | undefined,
          message: data.message as string,
          contradictionHint: data.contradiction_hint as string | undefined,
          forcedQuestion: data.forced_question as string | undefined,
        },
      }))
    }))

    // kul_kaymasi → ash shift event (Katman 2)
    unsubs.push(ws.onEvent('kul_kaymasi', (data) => {
      msgCounter.current++
      const question = data.question as string
      setState(prev => ({
        ...prev,
        kulKaymasi: {
          speaker: data.speaker as string,
          question,
        },
        messages: [...prev.messages, {
          id: `ws-kul-${msgCounter.current}`,
          sender: 'Ocak',
          text: question,
          isSelf: false,
          isSystem: true,
          timestamp: Date.now(),
        }],
      }))
    }))

    // night_result → night phase resolution (Katman 3)
    unsubs.push(ws.onEvent('night_result', (data) => {
      const chosenOmenRaw = data.chosen_omen as { id: string; label: string; icon: string } | null
      const uiUpdateRaw = data.ui_update as { object_id: string } | null
      setState(prev => ({
        ...prev,
        nightResult: {
          winningMove: (data.winning_move as string) ?? null,
          target: (data.target as string) ?? null,
          effectText: (data.effect_text as string) ?? 'Gece sessiz gecti.',
          chosenOmen: chosenOmenRaw ? {
            id: chosenOmenRaw.id,
            label: chosenOmenRaw.label,
            icon: chosenOmenRaw.icon,
          } : null,
          uiUpdate: uiUpdateRaw ? { objectId: uiUpdateRaw.object_id } : null,
        },
        inputRequired: null,
      }))
    }))

    // morning_crisis → daily crisis event (Katman 4)
    unsubs.push(ws.onEvent('morning_crisis', (data) => {
      setState(prev => ({
        ...prev,
        morningCrisis: {
          crisisText: (data.crisis_text as string) ?? '',
          activatedObjects: (data.activated_objects as string[]) ?? [],
          publicQuestion: (data.public_question as string) ?? '',
          whispers: (data.whispers as string[]) ?? [],
        },
      }))
    }))

    // proposal → campfire proposal (Katman 4)
    unsubs.push(ws.onEvent('proposal', (data) => {
      setState(prev => ({
        ...prev,
        proposal: {
          proposalText: (data.proposal_text as string) ?? '',
          optionA: (data.option_a as string) ?? 'Kabul',
          optionB: (data.option_b as string) ?? 'Reddet',
        },
      }))
    }))

    // proposal_result → proposal vote result (Katman 4)
    unsubs.push(ws.onEvent('proposal_result', (data) => {
      setState(prev => ({
        ...prev,
        proposalResult: {
          winner: (data.winner as 'a' | 'b') ?? 'a',
          winnerText: (data.winner_text as string) ?? '',
          aCount: (data.a_count as number) ?? 0,
          bCount: (data.b_count as number) ?? 0,
        },
      }))
    }))

    // omen_interpretation → campfire omen round (Katman 4)
    unsubs.push(ws.onEvent('omen_interpretation', (data) => {
      const omen = data.omen as { id: string; label: string; icon: string }
      const interpretations = (data.interpretations as Array<{ speaker: string; text: string }>) ?? []
      setState(prev => ({
        ...prev,
        omenInterpretation: {
          omen: { id: omen.id, label: omen.label, icon: omen.icon },
          interpretations,
        },
      }))
    }))

    // sinama_echo → delayed sınama echo in campfire (Katman 4)
    unsubs.push(ws.onEvent('sinama_echo', (data) => {
      msgCounter.current++
      const content = data.content as string
      setState(prev => ({
        ...prev,
        sinamaEcho: content,
        messages: [...prev.messages, {
          id: `ws-echo-${msgCounter.current}`,
          sender: 'Sinama',
          text: content,
          isSelf: false,
          isSystem: true,
          timestamp: Date.now(),
        }],
      }))
    }))

    // house_entry_event → house doorstep detail (Katman 4)
    unsubs.push(ws.onEvent('house_entry_event', (data) => {
      setState(prev => ({
        ...prev,
        houseEntryEvent: (data.content as string) ?? null,
      }))
    }))

    // soz_borcu → forced speakers + damga info (Katman 4)
    unsubs.push(ws.onEvent('soz_borcu', (data) => {
      setState(prev => ({
        ...prev,
        sozBorcu: {
          forcedSpeakers: (data.forced_speakers as string[]) ?? [],
          damgali: (data.damgali as string[]) ?? [],
        },
      }))
    }))

    // institution_visit_start → switch to institution phase (Katman 2)
    unsubs.push(ws.onEvent('institution_visit_start', (data) => {
      setState(prev => ({
        ...prev,
        phase: 'institution',
        institutionVisit: {
          player: data.player as string,
          locationId: data.location_id as string,
          narrative: null,
        },
      }))
    }))

    // institution_visit_scene → narrative arrives (Katman 2)
    unsubs.push(ws.onEvent('institution_visit_scene', (data) => {
      setState(prev => ({
        ...prev,
        institutionVisit: prev.institutionVisit
          ? { ...prev.institutionVisit, narrative: data.narrative as string }
          : null,
      }))
    }))

    // institution_visit_end → (scene handles transition)
    unsubs.push(ws.onEvent('institution_visit_end', () => {
      // Scene will naturally transition when next phase_change arrives
    }))

    // ui_object_update → update specific UI object state (Katman 2)
    unsubs.push(ws.onEvent('ui_object_update', (data) => {
      const objectId = data.object_id as string
      const newState = data.new_state as Record<string, unknown>
      if (objectId && newState) {
        setState(prev => ({
          ...prev,
          uiObjects: {
            ...prev.uiObjects,
            [objectId]: {
              ...prev.uiObjects[objectId],
              id: objectId,
              state: newState,
            } as UIObject,
          },
        }))
      }
    }))

    // campfire_speech → append to messages
    unsubs.push(ws.onEvent('campfire_speech', (data) => {
      msgCounter.current++
      const speaker = data.speaker as string
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          id: `ws-${msgCounter.current}`,
          sender: speaker,
          text: data.content as string,
          isSelf: speaker === prev.selfPlayerName,
          timestamp: Date.now(),
        }],
      }))
    }))

    // moderator_warning → append as system message
    unsubs.push(ws.onEvent('moderator_warning', (data) => {
      msgCounter.current++
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          id: `ws-mod-${msgCounter.current}`,
          sender: 'Moderator',
          text: `${data.speaker}: ${data.reason}`,
          isSelf: false,
          isSystem: true,
          timestamp: Date.now(),
        }],
      }))
    }))

    // free_roam_start → switch to free_roam phase
    unsubs.push(ws.onEvent('free_roam_start', (_data) => {
      setState(prev => ({
        ...prev,
        phase: 'free_roam',
        locationDecisions: [],
      }))
    }))

    // location_decisions → set decisions
    unsubs.push(ws.onEvent('location_decisions', (data) => {
      const decisions = (data.decisions as Array<{ player: string; choice: string }>).map(d => ({
        playerName: d.player,
        choice: d.choice as LocationDecision['choice'],
        displayText: formatLocationText(d.player, d.choice),
      }))
      setState(prev => ({
        ...prev,
        locationDecisions: decisions,
      }))
    }))

    // your_turn → set inputRequired
    unsubs.push(ws.onEvent('your_turn', (data) => {
      setState(prev => ({
        ...prev,
        inputRequired: {
          type: data.action_required as InputAction['type'],
          timeout: (data.timeout_seconds as number) ?? 30,
          alivePlayers: data.alive_players as string[] | undefined,
        },
      }))
    }))

    // house_visit_start → initialize house visit state + switch to house phase
    unsubs.push(ws.onEvent('house_visit_start', (data) => {
      setState(prev => ({
        ...prev,
        phase: 'house',
        houseVisit: {
          visitor: data.visitor as string,
          host: data.host as string,
          maxExchanges: (data.max_exchanges as number) ?? 4,
          exchanges: [],
        },
      }))
    }))

    // house_visit_exchange → append exchange
    unsubs.push(ws.onEvent('house_visit_exchange', (data) => {
      setState(prev => {
        if (!prev.houseVisit) return prev
        return {
          ...prev,
          houseVisit: {
            ...prev.houseVisit,
            exchanges: [...prev.houseVisit.exchanges, {
              speaker: data.speaker as string,
              roleTitle: data.role_title as string,
              content: data.content as string,
              turn: data.turn as number,
            }],
          },
        }
      })
    }))

    // house_visit_end → (keep house visit data, scene handles transition)
    unsubs.push(ws.onEvent('house_visit_end', () => {
      // Scene will naturally transition when next phase_change arrives
    }))

    // home_alone → show as system message
    unsubs.push(ws.onEvent('home_alone', (data) => {
      msgCounter.current++
      setState(prev => ({
        ...prev,
        messages: [...prev.messages, {
          id: `ws-home-${msgCounter.current}`,
          sender: 'Anlatici',
          text: data.message as string,
          isSelf: false,
          isSystem: true,
          timestamp: Date.now(),
        }],
      }))
    }))

    // exile → votes + exile result
    unsubs.push(ws.onEvent('exile', (data) => {
      const voteMap = (data.votes ?? {}) as Record<string, string>
      const votes: VoteEntry[] = Object.entries(voteMap).map(([voter, target]) => ({
        voter,
        target,
      }))

      setState(prev => {
        // Mark exiled player as dead
        const exiled = data.exiled as string | null
        const updatedPlayers = prev.players.map(p =>
          p.name === exiled ? { ...p, alive: false, exiledRound: prev.round } : p
        )

        return {
          ...prev,
          phase: 'exile',
          votes,
          exiledName: exiled,
          exiledType: (data.exiled_type as string) ?? null,
          exiledRole: (data.exiled_role as string) ?? null,
          players: updatedPlayers,
          inputRequired: null,
        }
      })
    }))

    // game_over → winner + reveal all players
    unsubs.push(ws.onEvent('game_over', (data) => {
      const allPlayers = (data.all_players as Array<{
        name: string; role_title: string; player_type: string; alive: boolean
      }>) ?? []

      setState(prev => {
        const revealed: GamePlayer[] = allPlayers.map((p, i) => ({
          id: `P${i}`,
          name: p.name,
          roleTitle: p.role_title,
          playerType: p.player_type as GamePlayer['playerType'],
          alive: p.alive,
          avatarColor: prev.players.find(pp => pp.name === p.name)?.avatarColor ?? AVATAR_COLORS[i % AVATAR_COLORS.length],
        }))

        return {
          ...prev,
          phase: 'game_over',
          status: 'finished',
          winner: data.winner as string,
          allPlayersReveal: revealed,
          inputRequired: null,
        }
      })
    }))

    // speech_audio → queue audio for playback
    unsubs.push(ws.onEvent('speech_audio', (data) => {
      const url = data.audio_url as string
      if (url) {
        audio.enqueue(url)
      }
    }))

    // error → log
    unsubs.push(ws.onEvent('error', (data) => {
      console.error('[Game Error]', data.code, data.message)
    }))

    // connected → (initial welcome)
    unsubs.push(ws.onEvent('connected', (data) => {
      console.log('[Game] Connected:', data.message)
    }))

    return () => unsubs.forEach(fn => fn())
  }, [ws, audio])

  // ── Actions ──────────────────────────────────────

  const createGame = useCallback(async (playerCount = 6, aiCount = 5) => {
    setState(prev => ({ ...prev, status: 'waiting' }))

    const resp = await fetch('/api/game/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_count: playerCount, ai_count: aiCount }),
    })
    const data = await resp.json()

    setState(prev => ({
      ...prev,
      gameId: data.game_id,
      worldBrief: data.world_brief,
      worldSeed: {
        settlementName: data.settlement_name,
        tone: '',
        season: '',
        fireColor: 'kehribar',
        fireColorMood: '',
        exilePhrase: 'Cember disina adim at. Atesin seni artik tanimiyor.',
        handRaisePhrase: 'Ates isterim.',
        omens: [],
      },
    }))
  }, [])

  const startGame = useCallback(async () => {
    if (!state.gameId) return

    const resp = await fetch(`/api/game/${state.gameId}/start`, { method: 'POST' })
    const data = await resp.json()

    if (data.status === 'running') {
      // Connect WS as P0 (human player)
      const playerId = 'P0'
      ws.connect(state.gameId, playerId)
      setState(prev => ({
        ...prev,
        status: 'running',
        playerId,
      }))

      // Fetch game state to get player list
      const stateResp = await fetch(`/api/game/${state.gameId}`)
      const gameState = await stateResp.json()

      if (gameState.players) {
        const players: GamePlayer[] = gameState.players.map((p: { slot_id: string; name: string; role_title: string; alive: boolean }, i: number) => ({
          id: p.slot_id,
          name: p.name,
          roleTitle: p.role_title,
          playerType: 'et_can' as const, // Hidden during game
          alive: p.alive,
          avatarColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
        }))

        // P0 is the human player
        const selfPlayer = players.find(p => p.id === 'P0')

        setState(prev => ({
          ...prev,
          players,
          selfPlayerName: selfPlayer?.name ?? null,
          dayLimit: gameState.day_limit ?? 5,
        }))
      }
    }
  }, [state.gameId, ws])

  const sendSpeak = useCallback((content: string) => {
    ws.send('speak', { content })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendVote = useCallback((target: string) => {
    ws.send('vote', { target })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendLocationChoice = useCallback((choice: string) => {
    ws.send('location_choice', { choice })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendVisitSpeak = useCallback((content: string) => {
    ws.send('visit_speak', { content })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendNightMove = useCallback((choice: string) => {
    ws.send('night_move', { choice })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendOmenChoice = useCallback((choice: string) => {
    ws.send('omen_choice', { choice })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const sendKalkan = useCallback(() => {
    ws.send('kalkan', {})
    setState(prev => ({ ...prev, canUseKalkan: false }))
  }, [ws])

  const sendProposalVote = useCallback((choice: string) => {
    ws.send('proposal_vote', { choice })
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [ws])

  const clearInput = useCallback(() => {
    setState(prev => ({ ...prev, inputRequired: null }))
  }, [])

  // ── Context Value ──────────────────────────────

  const value: GameContextValue = {
    ...state,
    createGame,
    startGame,
    sendSpeak,
    sendVote,
    sendLocationChoice,
    sendVisitSpeak,
    sendNightMove,
    sendOmenChoice,
    sendKalkan,
    sendProposalVote,
    clearInput,
  }

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be inside GameProvider')
  return ctx
}

// ── Helpers ──────────────────────────────────────

function mapPhase(backendPhase: string): Phase {
  const map: Record<string, Phase> = {
    morning: 'morning',
    campfire_open: 'campfire_open',
    campfire_close: 'campfire_close',
    campfire: 'campfire_open',
    free_roam: 'free_roam',
    house: 'house',
    institution: 'institution',
    vote: 'vote',
    exile: 'exile',
    night: 'night',
    game_over: 'game_over',
  }
  return map[backendPhase] ?? 'morning'
}

function formatLocationText(player: string, choice: string): string {
  if (choice === 'CAMPFIRE') return `${player} ates basinda kaldi.`
  if (choice === 'HOME') return `${player} evine cekildi.`
  if (choice.startsWith('VISIT|')) {
    const target = choice.split('|')[1]
    return `${player}, ${target}'in evine gitti.`
  }
  if (choice.startsWith('INSTITUTION|')) {
    const locId = choice.split('|')[1]
    return `${player}, ${locId} lokasyonuna gitti.`
  }
  return `${player} bir yer secti.`
}
