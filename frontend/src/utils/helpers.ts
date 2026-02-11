import { TILE_SCALE, TILE_SIZE } from './constants'

/** Convert tile coordinates to pixel coordinates (scaled) */
export function tileToPixel(tileX: number, tileY: number): { x: number; y: number } {
  return {
    x: tileX * TILE_SIZE * TILE_SCALE,
    y: tileY * TILE_SIZE * TILE_SCALE,
  }
}

/** Convert pixel coordinates to tile coordinates */
export function pixelToTile(px: number, py: number): { x: number; y: number } {
  const scaled = TILE_SIZE * TILE_SCALE
  return {
    x: Math.floor(px / scaled),
    y: Math.floor(py / scaled),
  }
}

/** Distance between two points */
export function distance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
}

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Linear interpolation */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Random integer between min and max (inclusive) */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/** Random float between min and max */
export function randFloat(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

/** Generate a simple ID */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

/** Color with alpha */
export function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Programmatic character colors for placeholder sprites */
export const PLAYER_COLORS = [
  '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
  '#9B59B6', '#1ABC9C', '#E67E22', '#34495E',
]

/** Get player color by index */
export function getPlayerColor(index: number): string {
  return PLAYER_COLORS[index % PLAYER_COLORS.length]
}
