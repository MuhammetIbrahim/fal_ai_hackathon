// ── Phase type ──
export type Phase =
  | 'lobby'
  | 'morning'
  | 'campfire'
  | 'day'
  | 'houses'
  | 'vote'
  | 'night'
  | 'exile'
  | 'game_over'

// ── Player ──
export interface Player {
  slot_id: string
  name: string
  role_title: string
  institution?: string
  institution_label?: string
  alive: boolean
  public_tick?: string
  speech_color?: string
  alibi_anchor?: string
  player_type?: 'et_can' | 'yanki_dogmus'
  // Client-side rendering
  x?: number
  y?: number
  color?: string
}

// ── Omen (kehanet) ──
export interface Omen {
  id: string
  text: string
  type: 'warning' | 'hint' | 'neutral'
  revealed?: boolean
}

// ── Speech (campfire / house) ──
export interface Speech {
  speaker: string
  content: string
  audio_url?: string
  timestamp?: number
}

// ── Location decision ──
export interface LocationDecision {
  player: string   // player name (backend sends "player" not "player_id")
  choice: string
}

// ── House visit ──
export interface HouseVisit {
  host: string
  visitor: string
  speeches: Speech[]
  turn: number
}

// ── Exile result ──
export interface ExileResult {
  exiled: string
  active_players: string[]
}

// ── Night result ──
export interface NightResult {
  summary: string
}

// ── Spotlight card ──
export interface SpotlightCard {
  id: string
  title: string
  description: string
  target?: string
  type: 'spotlight' | 'sinama' | 'kriz'
}

// ── Sinama (trial) ──
export interface Sinama {
  target: string
  description: string
  options: { id: string; label: string }[]
}

// ── Ocak tepki (fireplace reaction) ──
export interface OcakTepki {
  type: 'warning' | 'approval' | 'rage'
  message: string
  target?: string
}

// ── Proposal ──
export interface Proposal {
  id: string
  title: string
  description: string
  options: { id: string; label: string; description: string }[]
}

// ── Söz borcu ──
export interface SozBorcu {
  debtor: string
  creditor: string
  description: string
}

// ── UI Object (generic canvas object) ──
export interface UIObject {
  id: string
  type: string
  x: number
  y: number
  data: Record<string, unknown>
}

// ── Input action (what the player needs to do) ──
export interface InputAction {
  type: 'speak' | 'vote' | 'location_choice' | 'night_action' | 'proposal_choice' | 'visit_speak'
  timeout_seconds?: number
  data?: Record<string, unknown>
}

// ── Vote result ──
export interface VoteResult {
  votes: Record<string, string>
  exiled: string | null
  tie: boolean
}

// ── Game over data ──
export interface GameOverData {
  winner: 'et_can' | 'yanki_dogmus'
  players: (Player & { player_type: 'et_can' | 'yanki_dogmus' })[]
}

// ── Night move option ──
export interface NightMove {
  id: string
  label: string
  description: string
  icon?: string
}

// ── WS Event ──
export interface WSEvent {
  event: string
  data: Record<string, unknown>
}
