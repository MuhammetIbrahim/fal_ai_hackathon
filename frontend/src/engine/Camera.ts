// ── Camera ──
// Manages the 2D camera: position, zoom, viewport, coordinate conversion.

import { TILE_SCALE, MAP_COLS, MAP_ROWS, SCALED_TILE } from '../utils/constants'
import { lerp, clamp } from '../utils/helpers'

const LERP_SPEED = 0.08

export class Camera {
  /** Camera world position (top-left corner, in world pixels) */
  x = 0
  y = 0

  /** Viewport size (canvas pixel dimensions) */
  width = 800
  height = 600

  /** Zoom level */
  scale = 1 // Note: tiles are already pre-scaled by TILE_SCALE, so default camera scale is 1

  /** Internal: the target position the camera is lerping towards */
  private targetX = 0
  private targetY = 0

  /** World bounds (in world pixels) */
  private worldWidth = MAP_COLS * SCALED_TILE
  private worldHeight = MAP_ROWS * SCALED_TILE

  constructor(viewportWidth = 800, viewportHeight = 600) {
    this.width = viewportWidth
    this.height = viewportHeight
  }

  /**
   * Set the camera to follow a target (world pixel position).
   * The camera will center on the target.
   */
  follow(targetX: number, targetY: number): void {
    // We want the target at the center of the viewport
    this.targetX = targetX - this.width / (2 * this.scale)
    this.targetY = targetY - this.height / (2 * this.scale)
  }

  /**
   * Update the camera position — lerp towards target for smooth movement.
   * Call once per frame.
   */
  update(): void {
    // Lerp towards the target
    this.x = lerp(this.x, this.targetX, LERP_SPEED)
    this.y = lerp(this.y, this.targetY, LERP_SPEED)

    // Clamp to world bounds so the camera doesn't show out-of-world area
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - this.width / this.scale))
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - this.height / this.scale))
  }

  /**
   * Snap the camera immediately to the target (no lerp).
   */
  snapToTarget(): void {
    this.x = this.targetX
    this.y = this.targetY
    this.x = clamp(this.x, 0, Math.max(0, this.worldWidth - this.width / this.scale))
    this.y = clamp(this.y, 0, Math.max(0, this.worldHeight - this.height / this.scale))
  }

  /**
   * Convert world coordinates to screen (canvas) coordinates.
   */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.scale,
      y: (wy - this.y) * this.scale,
    }
  }

  /**
   * Convert screen (canvas) coordinates to world coordinates.
   */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.scale + this.x,
      y: sy / this.scale + this.y,
    }
  }

  /**
   * Check if a world-space rectangle is visible within the camera viewport.
   * x, y, w, h are in world pixels.
   */
  isVisible(x: number, y: number, w: number, h: number): boolean {
    const viewLeft = this.x
    const viewTop = this.y
    const viewRight = this.x + this.width / this.scale
    const viewBottom = this.y + this.height / this.scale

    return x + w > viewLeft && x < viewRight && y + h > viewTop && y < viewBottom
  }

  /**
   * Resize the viewport dimensions (e.g. on window resize).
   */
  resize(w: number, h: number): void {
    this.width = w
    this.height = h
  }

  /**
   * Set the zoom scale.
   */
  setScale(s: number): void {
    this.scale = clamp(s, 0.25, 4)
  }

  /**
   * Get visible tile range (for efficient tile rendering).
   * Returns the min/max tile column/row that are visible.
   */
  getVisibleTileRange(): { minCol: number; maxCol: number; minRow: number; maxRow: number } {
    const minCol = Math.max(0, Math.floor(this.x / SCALED_TILE))
    const minRow = Math.max(0, Math.floor(this.y / SCALED_TILE))
    const maxCol = Math.min(MAP_COLS - 1, Math.ceil((this.x + this.width / this.scale) / SCALED_TILE))
    const maxRow = Math.min(MAP_ROWS - 1, Math.ceil((this.y + this.height / this.scale) / SCALED_TILE))
    return { minCol, maxCol, minRow, maxRow }
  }
}
