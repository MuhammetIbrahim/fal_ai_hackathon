export type Phase =
  | 'lobby'
  | 'morning'
  | 'campfire_open'
  | 'free_roam'
  | 'house'
  | 'campfire_close'
  | 'vote'
  | 'exile'
  | 'game_over'

export type PlayerType = 'et_can' | 'yanki_dogmus'

export interface GamePlayer {
  id: string
  name: string
  roleTitle: string
  playerType: PlayerType
  alive: boolean
  avatarColor: string
  exiledRound?: number
  institution?: string
  institutionLabel?: string
  publicTick?: string
  alibiAnchor?: string
  speechColor?: string
}

export interface WorldSeed {
  settlementName: string
  tone: string
  season: string
  fireColor: string
  fireColorMood: string
  exilePhrase: string
  handRaisePhrase: string
  omens: string[]
}

export interface ChatMessage {
  id: string
  sender: string
  text: string
  isSelf: boolean
  isSystem?: boolean
  timestamp: number
}

export interface Transcript {
  id: string
  speaker: 'me' | 'opponent'
  text: string
}

export interface VoteEntry {
  voter: string
  target: string
}

export type LocationChoice = 'CAMPFIRE' | 'HOME' | `VISIT|${string}`

export interface LocationDecision {
  playerName: string
  choice: LocationChoice
  displayText: string
}

export interface DayScript {
  morningText: string
  campfireOpen: ChatMessage[]
  freeRoamDecisions?: LocationDecision[]
  houseTranscript?: Transcript[]
  houseVisitor?: string
  houseHost?: string
  campfireClose?: ChatMessage[]
  votes: VoteEntry[]
  exiledName: string
  exiledType: PlayerType
}

// ── WS Event Types ──────────────────────────────────

export interface ServerEvent {
  event: string
  data: Record<string, unknown>
}

export type InputActionType = 'speak' | 'vote' | 'location_choice' | 'visit_speak'

export interface InputAction {
  type: InputActionType
  timeout: number
  alivePlayers?: string[]
  extraData?: Record<string, unknown>
}

export interface Omen {
  id: string
  label: string
  icon: string
}

export interface HouseVisitState {
  visitor: string
  host: string
  maxExchanges: number
  exchanges: {
    speaker: string
    roleTitle: string
    content: string
    turn: number
  }[]
}
