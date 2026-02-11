// ── Character ──
// Represents a player or NPC character on the tile map.
// Handles movement, animation, and rendering (placeholder sprites).

import {
  CHAR_SIZE,
  CHAR_SCALE,
  CHAR_SPEED,
  CHAR_ANIM_SPEED,
  SCALED_TILE,
  COLORS,
} from '../utils/constants'
import { tileToPixel, pixelToTile, distance } from '../utils/helpers'
import { SpriteSheet } from './SpriteSheet'
import type { Camera } from './Camera'
import type { TileMap } from './TileMap'

export type Direction = 'up' | 'down' | 'left' | 'right'

export class Character {
  /** World pixel position (scaled) */
  x: number
  y: number

  /** Movement target (world pixel coords) */
  targetX: number
  targetY: number

  /** Movement speed in pixels per frame (scaled) */
  speed: number

  /** Facing direction */
  direction: Direction

  /** Animation frame counter */
  animFrame: number

  /** Internal tick counter for animation speed */
  private animTick: number

  /** Character display name */
  name: string

  /** Placeholder body color */
  color: string

  /** Whether the character is currently moving */
  isMoving: boolean

  /** Player slot ID */
  slotId: string

  /** Whether the character is alive */
  alive: boolean

  /** The scaled character draw size */
  private drawSize: number

  constructor(
    name: string,
    slotId: string,
    color: string,
    startTileX = 20,
    startTileY = 15,
  ) {
    const startPos = tileToPixel(startTileX, startTileY)
    this.x = startPos.x
    this.y = startPos.y
    this.targetX = this.x
    this.targetY = this.y
    this.speed = CHAR_SPEED * CHAR_SCALE // scale the speed to match pixel scale
    this.direction = 'down'
    this.animFrame = 0
    this.animTick = 0
    this.name = name
    this.color = color
    this.isMoving = false
    this.slotId = slotId
    this.alive = true
    this.drawSize = CHAR_SIZE * CHAR_SCALE
  }

  /**
   * Set movement target to a world pixel position.
   */
  moveTo(px: number, py: number): void {
    this.targetX = px
    this.targetY = py
  }

  /**
   * Set movement target from tile coordinates.
   * Converts tile coords to world pixel coords and centers within the tile.
   */
  moveToTile(tx: number, ty: number): void {
    const pos = tileToPixel(tx, ty)
    // Center the character within the tile
    this.targetX = pos.x + (SCALED_TILE - this.drawSize) / 2
    this.targetY = pos.y + (SCALED_TILE - this.drawSize) / 2
  }

  /**
   * Teleport immediately to a world pixel position.
   */
  setPosition(px: number, py: number): void {
    this.x = px
    this.y = py
    this.targetX = px
    this.targetY = py
    this.isMoving = false
  }

  /**
   * Teleport immediately to a tile position (centered).
   */
  setTilePosition(tx: number, ty: number): void {
    const pos = tileToPixel(tx, ty)
    const cx = pos.x + (SCALED_TILE - this.drawSize) / 2
    const cy = pos.y + (SCALED_TILE - this.drawSize) / 2
    this.setPosition(cx, cy)
  }

  /**
   * Update the character each frame.
   * Moves towards target, updates animation, checks walkability.
   */
  update(tileMap: TileMap): void {
    const dx = this.targetX - this.x
    const dy = this.targetY - this.y
    const dist = distance(this.x, this.y, this.targetX, this.targetY)

    if (dist > this.speed) {
      this.isMoving = true

      // Normalize direction vector
      const nx = dx / dist
      const ny = dy / dist

      // Compute next position
      const nextX = this.x + nx * this.speed
      const nextY = this.y + ny * this.speed

      // Check walkability at the center of the character
      const centerX = nextX + this.drawSize / 2
      const centerY = nextY + this.drawSize / 2
      const nextTile = pixelToTile(centerX, centerY)

      if (tileMap.isWalkable(nextTile.x, nextTile.y)) {
        this.x = nextX
        this.y = nextY
      } else {
        // Try to slide along axes
        const slideX = this.x + nx * this.speed
        const slideTileX = pixelToTile(slideX + this.drawSize / 2, this.y + this.drawSize / 2)
        if (tileMap.isWalkable(slideTileX.x, slideTileX.y) && Math.abs(nx) > 0.1) {
          this.x = slideX
        }

        const slideY = this.y + ny * this.speed
        const slideTileY = pixelToTile(this.x + this.drawSize / 2, slideY + this.drawSize / 2)
        if (tileMap.isWalkable(slideTileY.x, slideTileY.y) && Math.abs(ny) > 0.1) {
          this.y = slideY
        }

        // Stop trying to reach unreachable target
        this.targetX = this.x
        this.targetY = this.y
        this.isMoving = false
      }

      // Determine facing direction based on dominant movement axis
      if (Math.abs(dx) > Math.abs(dy)) {
        this.direction = dx > 0 ? 'right' : 'left'
      } else {
        this.direction = dy > 0 ? 'down' : 'up'
      }

      // Advance animation
      this.animTick++
      if (this.animTick >= CHAR_ANIM_SPEED) {
        this.animTick = 0
        this.animFrame = (this.animFrame + 1) % 4
      }
    } else {
      // Arrived at target
      this.x = this.targetX
      this.y = this.targetY
      this.isMoving = false
      this.animFrame = 0
      this.animTick = 0
    }
  }

  /**
   * Draw the character on the canvas using placeholder sprites.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    // Cull if not visible
    if (!camera.isVisible(this.x, this.y, this.drawSize, this.drawSize)) return

    const screen = camera.worldToScreen(this.x, this.y)

    // Scale the screen-space drawing
    const drawX = screen.x
    const drawY = screen.y

    // Use placeholder sprite drawing
    ctx.save()
    // If camera has scale, we need to account for it in the placeholder drawing
    if (camera.scale !== 1) {
      ctx.translate(drawX, drawY)
      ctx.scale(camera.scale, camera.scale)
      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        0,
        0,
        this.color,
        this.direction,
        this.animFrame,
        this.alive,
      )
      ctx.restore()
    } else {
      ctx.restore()
      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        drawX,
        drawY,
        this.color,
        this.direction,
        this.animFrame,
        this.alive,
      )
    }

    // Draw name tag
    this.drawNameTag(ctx, camera)
  }

  /**
   * Draw the character's name tag above the sprite.
   */
  drawNameTag(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const screen = camera.worldToScreen(this.x, this.y)
    const scaledSize = this.drawSize * camera.scale

    const tagX = screen.x + scaledSize / 2
    const tagY = screen.y - 8

    ctx.save()
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    // Background pill
    const metrics = ctx.measureText(this.name)
    const padding = 4
    const pillW = metrics.width + padding * 2
    const pillH = 14

    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    roundRect(ctx, tagX - pillW / 2, tagY - pillH, pillW, pillH, 3)
    ctx.fill()

    // Name text
    ctx.fillStyle = this.alive ? COLORS.TEXT_LIGHT : '#888888'
    ctx.fillText(this.name, tagX, tagY - 2)

    ctx.restore()
  }

  /**
   * Get the tile coordinates the character is currently on.
   */
  getCurrentTile(): { x: number; y: number } {
    return pixelToTile(this.x + this.drawSize / 2, this.y + this.drawSize / 2)
  }

  /**
   * Get the center world position of the character.
   */
  getCenterPosition(): { x: number; y: number } {
    return {
      x: this.x + this.drawSize / 2,
      y: this.y + this.drawSize / 2,
    }
  }
}

// ── Helper: draw a rounded rectangle (cross-browser compatible) ──
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}
