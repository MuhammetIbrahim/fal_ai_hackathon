// ── TileMap ──
// Hardcoded settlement map (40x30 tiles) for the "Ocak Yemini" game.
// Draws tiles, buildings, paths, and water features.

import {
  SCALED_TILE,
  MAP_COLS,
  MAP_ROWS,
  TILE,
  COLORS,
  BUILDING,
  BUILDING_POSITIONS,
  HOUSE_POSITIONS,
} from '../utils/constants'
import { SpriteSheet } from './SpriteSheet'
import type { Camera } from './Camera'

// ── Tile color mapping ──
const TILE_COLORS: Record<number, string> = {
  [TILE.GRASS]: COLORS.GRASS,
  [TILE.EARTH]: COLORS.EARTH,
  [TILE.STONE]: COLORS.STONE,
  [TILE.WATER]: COLORS.WATER,
  [TILE.SAND]: COLORS.SAND,
  [TILE.DARK_GRASS]: '#3A5A1A',
  [TILE.WOOD_FLOOR]: COLORS.WOOD,
  [TILE.STONE_FLOOR]: '#888888',
}

// ── Building color mapping ──
const BUILDING_COLORS: Record<string, string> = {
  [BUILDING.OCAK]: COLORS.FIRE_ORANGE,
  [BUILDING.GECIT_KULESI]: COLORS.STONE,
  [BUILDING.DEMIRHANE]: COLORS.METAL,
  [BUILDING.SIFHANE]: '#4A8060',
  [BUILDING.KILER]: COLORS.WOOD,
  [BUILDING.KUL_TAPINAGI]: '#6A4A7A',
  [BUILDING.GEZGIN_HANI]: COLORS.DARK_WOOD,
}

/**
 * Generate the hardcoded 40x30 tile map.
 * Layout:
 *   - Base: grass everywhere
 *   - Center: Ocak (large fire area) at (18,13) 4x4
 *   - North: Gecit Kulesi at (18,3) 3x3
 *   - East: Demirhane (28,10) 3x3, Sifhane (28,16) 3x3
 *   - West: Kiler (8,16) 3x3, Kul Tapinagi (8,10) 3x3
 *   - South: Gezgin Hani (18,24) 3x3
 *   - Houses in a row at y=21
 *   - Earth paths connecting buildings
 *   - Water features (pond near east)
 */
function generateMap(): number[][] {
  // Initialize all grass
  const map: number[][] = []
  for (let row = 0; row < MAP_ROWS; row++) {
    map[row] = []
    for (let col = 0; col < MAP_COLS; col++) {
      map[row][col] = TILE.GRASS
    }
  }

  // ── Dark grass border (edges of the map) ──
  for (let col = 0; col < MAP_COLS; col++) {
    map[0][col] = TILE.DARK_GRASS
    map[1][col] = TILE.DARK_GRASS
    map[MAP_ROWS - 1][col] = TILE.DARK_GRASS
    map[MAP_ROWS - 2][col] = TILE.DARK_GRASS
  }
  for (let row = 0; row < MAP_ROWS; row++) {
    map[row][0] = TILE.DARK_GRASS
    map[row][1] = TILE.DARK_GRASS
    map[row][MAP_COLS - 1] = TILE.DARK_GRASS
    map[row][MAP_COLS - 2] = TILE.DARK_GRASS
  }

  // ── Earth paths (main roads) ──
  // Vertical main road: col 19-20, from row 3 to row 26
  for (let row = 3; row <= 26; row++) {
    map[row][19] = TILE.EARTH
    map[row][20] = TILE.EARTH
  }

  // Horizontal main road: row 14-15, from col 8 to col 30
  for (let col = 8; col <= 30; col++) {
    map[14][col] = TILE.EARTH
    map[15][col] = TILE.EARTH
  }

  // Path from Gecit Kulesi south to center
  for (let row = 6; row <= 13; row++) {
    map[row][19] = TILE.EARTH
    map[row][20] = TILE.EARTH
  }

  // Path east to Demirhane / Sifhane
  for (let col = 22; col <= 28; col++) {
    map[11][col] = TILE.EARTH
    map[17][col] = TILE.EARTH
  }

  // Path west to Kiler / Kul Tapinagi
  for (let col = 11; col <= 18; col++) {
    map[11][col] = TILE.EARTH
    map[17][col] = TILE.EARTH
  }

  // Path south to houses and Gezgin Hani
  for (let row = 17; row <= 24; row++) {
    map[row][19] = TILE.EARTH
    map[row][20] = TILE.EARTH
  }

  // Horizontal path connecting houses at row 22
  for (let col = 10; col <= 28; col++) {
    map[22][col] = TILE.EARTH
  }

  // ── Sand around the Ocak (fire pit area) ──
  for (let row = 12; row <= 17; row++) {
    for (let col = 17; col <= 22; col++) {
      if (map[row][col] !== TILE.EARTH) {
        map[row][col] = TILE.SAND
      }
    }
  }

  // ── Stone floor around Gecit Kulesi ──
  for (let row = 2; row <= 6; row++) {
    for (let col = 17; col <= 21; col++) {
      if (map[row][col] !== TILE.EARTH) {
        map[row][col] = TILE.STONE_FLOOR
      }
    }
  }

  // ── Building interiors: stone floor ──
  for (const [, pos] of Object.entries(BUILDING_POSITIONS)) {
    for (let row = pos.y; row < pos.y + pos.h; row++) {
      for (let col = pos.x; col < pos.x + pos.w; col++) {
        if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) {
          map[row][col] = TILE.STONE_FLOOR
        }
      }
    }
  }

  // ── House interiors: wood floor ──
  for (const house of HOUSE_POSITIONS) {
    for (let row = house.y; row < house.y + 2; row++) {
      for (let col = house.x; col < house.x + 2; col++) {
        if (row >= 0 && row < MAP_ROWS && col >= 0 && col < MAP_COLS) {
          map[row][col] = TILE.WOOD_FLOOR
        }
      }
    }
  }

  // ── Water: small pond east-side (col 33-36, row 12-14) ──
  for (let row = 12; row <= 14; row++) {
    for (let col = 33; col <= 36; col++) {
      map[row][col] = TILE.WATER
    }
  }
  // Smooth pond edges with sand
  for (let row = 11; row <= 15; row++) {
    for (let col = 32; col <= 37; col++) {
      if (map[row][col] !== TILE.WATER) {
        map[row][col] = TILE.SAND
      }
    }
  }

  // ── Small stream from pond going south ──
  for (let row = 15; row <= 20; row++) {
    map[row][34] = TILE.WATER
    if (row > 15) {
      map[row][35] = TILE.SAND
      map[row][33] = TILE.SAND
    }
  }

  return map
}

// ── Non-walkable tile types ──
const NON_WALKABLE: Set<number> = new Set([TILE.WATER])

export class TileMap {
  private tiles: number[][]
  private buildingRects: { id: string; x: number; y: number; w: number; h: number; label: string }[]

  constructor() {
    this.tiles = generateMap()

    // Pre-compute building rectangles in pixel space
    this.buildingRects = Object.entries(BUILDING_POSITIONS).map(([id, pos]) => ({
      id,
      x: pos.x,
      y: pos.y,
      w: pos.w,
      h: pos.h,
      label: pos.label,
    }))
  }

  /** Get tile type at tile coordinates. Returns -1 if out of bounds. */
  getTile(tileX: number, tileY: number): number {
    if (tileX < 0 || tileX >= MAP_COLS || tileY < 0 || tileY >= MAP_ROWS) {
      return -1
    }
    return this.tiles[tileY][tileX]
  }

  /** Check if a tile is walkable. */
  isWalkable(tileX: number, tileY: number): boolean {
    const tile = this.getTile(tileX, tileY)
    if (tile === -1) return false
    if (NON_WALKABLE.has(tile)) return false
    return true
  }

  /**
   * Return building ID if the given tile coords are within or adjacent to a building.
   * Checks a 1-tile proximity around each building.
   */
  getBuildingAt(tileX: number, tileY: number): string | null {
    for (const bldg of this.buildingRects) {
      if (
        tileX >= bldg.x - 1 &&
        tileX <= bldg.x + bldg.w &&
        tileY >= bldg.y - 1 &&
        tileY <= bldg.y + bldg.h
      ) {
        return bldg.id
      }
    }

    // Check houses
    for (let i = 0; i < HOUSE_POSITIONS.length; i++) {
      const house = HOUSE_POSITIONS[i]
      if (
        tileX >= house.x - 1 &&
        tileX <= house.x + 2 &&
        tileY >= house.y - 1 &&
        tileY <= house.y + 2
      ) {
        return `house_${i}`
      }
    }

    return null
  }

  /**
   * Draw the tile map. Only draws tiles visible within the camera viewport.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const { minCol, maxCol, minRow, maxRow } = camera.getVisibleTileRange()

    // ── Draw tiles ──
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const tile = this.tiles[row][col]
        const worldX = col * SCALED_TILE
        const worldY = row * SCALED_TILE
        const screen = camera.worldToScreen(worldX, worldY)
        const drawSize = SCALED_TILE * camera.scale

        ctx.fillStyle = TILE_COLORS[tile] ?? COLORS.GRASS
        ctx.fillRect(screen.x, screen.y, drawSize + 1, drawSize + 1) // +1 to avoid seams

        // Subtle tile grid lines (very faint)
        ctx.strokeStyle = 'rgba(0,0,0,0.05)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(screen.x, screen.y, drawSize, drawSize)
      }
    }

    // ── Draw buildings ──
    for (const [id, pos] of Object.entries(BUILDING_POSITIONS)) {
      const worldX = pos.x * SCALED_TILE
      const worldY = pos.y * SCALED_TILE
      const worldW = pos.w * SCALED_TILE
      const worldH = pos.h * SCALED_TILE

      if (!camera.isVisible(worldX, worldY, worldW, worldH)) continue

      const screen = camera.worldToScreen(worldX, worldY)
      const drawW = worldW * camera.scale
      const drawH = worldH * camera.scale

      SpriteSheet.drawPlaceholderBuilding(
        ctx,
        screen.x,
        screen.y,
        drawW,
        drawH,
        pos.label,
        BUILDING_COLORS[id] ?? COLORS.STONE,
      )
    }

    // ── Draw houses ──
    for (const house of HOUSE_POSITIONS) {
      const worldX = house.x * SCALED_TILE
      const worldY = house.y * SCALED_TILE
      const worldW = 2 * SCALED_TILE
      const worldH = 2 * SCALED_TILE

      if (!camera.isVisible(worldX, worldY, worldW, worldH)) continue

      const screen = camera.worldToScreen(worldX, worldY)
      const drawW = worldW * camera.scale
      const drawH = worldH * camera.scale

      SpriteSheet.drawPlaceholderBuilding(
        ctx,
        screen.x,
        screen.y,
        drawW,
        drawH,
        house.label,
        COLORS.WOOD,
      )
    }

    // ── Draw water shimmer effect ──
    this.drawWaterEffect(ctx, camera, minCol, maxCol, minRow, maxRow)
  }

  /** Subtle animated water shimmer on water tiles. */
  private drawWaterEffect(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    minCol: number,
    maxCol: number,
    minRow: number,
    maxRow: number,
  ): void {
    const time = Date.now() / 1000
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        if (this.tiles[row][col] !== TILE.WATER) continue

        const worldX = col * SCALED_TILE
        const worldY = row * SCALED_TILE
        const screen = camera.worldToScreen(worldX, worldY)
        const drawSize = SCALED_TILE * camera.scale

        // Shimmering highlight
        const shimmer = Math.sin(time * 2 + col * 0.5 + row * 0.3) * 0.15 + 0.1
        ctx.fillStyle = `rgba(255,255,255,${shimmer})`
        ctx.fillRect(
          screen.x + drawSize * 0.2,
          screen.y + drawSize * 0.3,
          drawSize * 0.3,
          drawSize * 0.1,
        )
        ctx.fillRect(
          screen.x + drawSize * 0.5,
          screen.y + drawSize * 0.6,
          drawSize * 0.25,
          drawSize * 0.08,
        )
      }
    }
  }
}
