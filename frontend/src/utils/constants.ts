// ── Color Palette (Stardew Valley warm tones) ──
export const COLORS = {
  BG_DARK: '#1a1208',
  EARTH: '#8B6914',
  GRASS: '#4A7023',
  STONE: '#6B6B6B',
  WOOD: '#8B5E3C',
  METAL: '#5A6672',
  FIRE_ORANGE: '#FF8C00',
  FIRE_YELLOW: '#FFD700',
  FIRE_RED: '#DC143C',
  NIGHT_BLUE: '#0D1B2A',
  FOG: '#708090',
  TEXT_LIGHT: '#F5E6C8',
  TEXT_GOLD: '#DAA520',
  ACCENT_RED: '#8B0000',
  WATER: '#2E5090',
  DARK_WOOD: '#5C3A1E',
  SAND: '#C2B280',
} as const

// ── Tile constants ──
export const TILE_SIZE = 16
export const TILE_SCALE = 4
export const SCALED_TILE = TILE_SIZE * TILE_SCALE // 64px on screen
export const MAP_COLS = 40
export const MAP_ROWS = 30

// ── Character constants ──
export const CHAR_SIZE = 16
export const CHAR_SCALE = 4
export const CHAR_SPEED = 2 // pixels per frame (scaled)
export const CHAR_ANIM_SPEED = 8 // frames per animation tick

// ── Tile types ──
export const TILE = {
  GRASS: 0,
  EARTH: 1,
  STONE: 2,
  WATER: 3,
  SAND: 4,
  DARK_GRASS: 5,
  WOOD_FLOOR: 6,
  STONE_FLOOR: 7,
} as const

// ── Building IDs ──
export const BUILDING = {
  OCAK: 'ocak',
  GECIT_KULESI: 'gecit_kulesi',
  DEMIRHANE: 'demirhane',
  SIFHANE: 'sifhane',
  KILER: 'kiler',
  KUL_TAPINAGI: 'kul_tapinagi',
  GEZGIN_HANI: 'gezgin_hani',
} as const

// ── Phase names (Turkish) ──
export const PHASE_NAMES: Record<string, string> = {
  lobby: 'Lobi',
  morning: 'Sabah',
  campfire: 'Ateş Başı',
  day: 'Serbest Dolaşım',
  houses: 'Ev Ziyareti',
  vote: 'Oylama',
  night: 'Gece',
  exile: 'Sürgün',
  game_over: 'Oyun Sonu',
}

// ── API endpoints ──
export const API_BASE = '/api'
export const WS_BASE = '/ws'

// ── Timing ──
export const TRANSITION_DURATION = 1000 // ms
export const FREE_ROAM_TIMEOUT = 30 // seconds
export const HEARTBEAT_INTERVAL = 30000 // ms
export const RECONNECT_INTERVAL = 3000 // ms

// ── Building positions on the map (tile coordinates) ──
export const BUILDING_POSITIONS: Record<string, { x: number; y: number; w: number; h: number; label: string }> = {
  [BUILDING.OCAK]: { x: 18, y: 13, w: 4, h: 4, label: 'Kül Ocağı' },
  [BUILDING.GECIT_KULESI]: { x: 18, y: 3, w: 3, h: 3, label: 'Geçit Kulesi' },
  [BUILDING.DEMIRHANE]: { x: 28, y: 10, w: 3, h: 3, label: 'Demirhane' },
  [BUILDING.SIFHANE]: { x: 28, y: 16, w: 3, h: 3, label: 'Şifahane' },
  [BUILDING.KILER]: { x: 8, y: 16, w: 3, h: 3, label: 'Kiler' },
  [BUILDING.KUL_TAPINAGI]: { x: 8, y: 10, w: 3, h: 3, label: 'Kul Tapınağı' },
  [BUILDING.GEZGIN_HANI]: { x: 18, y: 24, w: 3, h: 3, label: 'Gezgin Hanı' },
}

// ── Player house positions ──
export const HOUSE_POSITIONS = [
  { x: 10, y: 21, label: 'Ev 1' },
  { x: 14, y: 21, label: 'Ev 2' },
  { x: 18, y: 21, label: 'Ev 3' },
  { x: 22, y: 21, label: 'Ev 4' },
  { x: 26, y: 21, label: 'Ev 5' },
]
