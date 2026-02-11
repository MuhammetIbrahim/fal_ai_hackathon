// ── ExileScene ──
// The exiled character walks away from the campfire into thickening fog.
// Other characters watch from their campfire positions.
// After ~5 seconds the store handles the phase transition automatically.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import {
  COLORS, CHAR_SIZE, CHAR_SCALE, SCALED_TILE, BUILDING_POSITIONS, BUILDING,
} from '../utils/constants'
import { rgba, getPlayerColor, randFloat, lerp, clamp } from '../utils/helpers'
import type { Player } from '../state/types'

const CHAR_SCALED = CHAR_SIZE * CHAR_SCALE
const EXILE_WALK_SPEED = 60 // pixels per second (world space)
const EXILE_DURATION = 5 // seconds total
const SEMICIRCLE_RADIUS = 180

// ── Fire particle ──
interface FireParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
  color: string
}

const FIRE_COLORS = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, '#FFE08C']
const MAX_FIRE = 30

export class ExileScene implements Scene {
  private camera: Camera
  private time = 0

  // Campfire position
  private campfireX = 0
  private campfireY = 0

  // Exiled character state
  private exileSlotId: string | null = null
  private exileX = 0
  private exileY = 0
  private exileStartX = 0
  private exileStartY = 0
  private exileTargetX = 0
  private exileTargetY = 0
  private exileColor = '#888888'
  private exileName = ''
  private exileDir: 'up' | 'down' | 'left' | 'right' = 'down'

  // Fog
  fogAlpha = 0

  // Watcher positions (semicircle around campfire)
  private watcherPositions: { slotId: string; x: number; y: number }[] = []

  // Fire particles
  private fireParticles: FireParticle[] = []

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.fogAlpha = 0
    this.fireParticles = []

    // Campfire position
    const ocak = BUILDING_POSITIONS[BUILDING.OCAK]
    this.campfireX = (ocak.x + ocak.w / 2) * SCALED_TILE
    this.campfireY = (ocak.y + ocak.h / 2) * SCALED_TILE

    // Camera
    this.camera.setScale(0.9)
    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.snapToTarget()

    // Get exile data from store
    const state = useGameStore.getState()
    const exileResult = state.exileResult
    const players = state.players

    if (exileResult) {
      const exiledPlayer = players.find(
        (p) => p.slot_id === exileResult.exiled || p.name === exileResult.exiled,
      )
      if (exiledPlayer) {
        this.exileSlotId = exiledPlayer.slot_id
        this.exileName = exiledPlayer.name
        const idx = players.indexOf(exiledPlayer)
        this.exileColor = exiledPlayer.color ?? getPlayerColor(idx)
      }
    }

    // Start exile character at campfire area, walk downward (south) off-screen
    this.exileStartX = this.campfireX
    this.exileStartY = this.campfireY + SEMICIRCLE_RADIUS + 20
    this.exileX = this.exileStartX
    this.exileY = this.exileStartY
    this.exileTargetX = this.campfireX
    this.exileTargetY = this.campfireY + 800 // walk far south
    this.exileDir = 'down'

    // Place remaining alive characters in semicircle watching
    this.watcherPositions = []
    const watchers = players.filter(
      (p) => p.alive && p.slot_id !== this.exileSlotId,
    )
    const startAngle = Math.PI * 0.8
    const endAngle = Math.PI * 2.2
    const step = watchers.length > 1
      ? (endAngle - startAngle) / (watchers.length - 1)
      : 0

    for (let i = 0; i < watchers.length; i++) {
      const angle = watchers.length === 1 ? Math.PI * 1.5 : startAngle + step * i
      this.watcherPositions.push({
        slotId: watchers[i].slot_id,
        x: this.campfireX + Math.cos(angle) * SEMICIRCLE_RADIUS,
        y: this.campfireY + Math.sin(angle) * SEMICIRCLE_RADIUS,
      })
    }

    // Pre-fill fire
    for (let i = 0; i < MAX_FIRE; i++) {
      this.spawnFireParticle(Math.random())
    }
  }

  exit(): void {
    this.fireParticles = []
    this.watcherPositions = []
  }

  update(dt: number): void {
    this.time += dt

    // ── Move exiled character toward the edge ──
    const progress = clamp(this.time / EXILE_DURATION, 0, 1)
    this.exileX = lerp(this.exileStartX, this.exileTargetX, progress)
    this.exileY = lerp(this.exileStartY, this.exileTargetY, progress)

    // Determine walking direction
    const dx = this.exileTargetX - this.exileStartX
    const dy = this.exileTargetY - this.exileStartY
    if (Math.abs(dx) > Math.abs(dy)) {
      this.exileDir = dx > 0 ? 'right' : 'left'
    } else {
      this.exileDir = dy > 0 ? 'down' : 'up'
    }

    // ── Fog intensifies ──
    // Goes from 0 to 0.6 over the exile duration
    this.fogAlpha = clamp(progress * 0.6, 0, 0.6)

    // Camera slowly follows the exile
    const camTargetX = lerp(this.campfireX, this.exileX, progress * 0.3)
    const camTargetY = lerp(this.campfireY, this.exileY, progress * 0.3)
    this.camera.follow(camTargetX, camTargetY)
    this.camera.update()

    // ── Fire particles ──
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      if (p.life <= 0) {
        this.fireParticles.splice(i, 1)
      }
    }
    while (this.fireParticles.length < MAX_FIRE) {
      this.spawnFireParticle()
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // Sync camera viewport to actual canvas size
    this.camera.resize(w, h)

    // ── Background ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.scale(this.camera.scale, this.camera.scale)
    ctx.translate(-this.camera.x, -this.camera.y)

    // ── Simplified tile map ──
    this.drawTileMap(ctx)

    // ── Campfire glow ──
    const glowR = 120 + Math.sin(this.time * 2) * 10
    const glow = ctx.createRadialGradient(
      this.campfireX, this.campfireY, 8,
      this.campfireX, this.campfireY, glowR,
    )
    glow.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.25))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(
      this.campfireX - glowR, this.campfireY - glowR,
      glowR * 2, glowR * 2,
    )

    // ── Fire particles ──
    for (const p of this.fireParticles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Draw watchers ──
    const players = useGameStore.getState().players
    for (const wp of this.watcherPositions) {
      const player = players.find((p) => p.slot_id === wp.slotId)
      if (!player) continue

      const idx = players.indexOf(player)
      const color = player.color ?? getPlayerColor(idx)

      // Face the exile
      const ddx = this.exileX - wp.x
      const ddy = this.exileY - wp.y
      const dir: 'up' | 'down' | 'left' | 'right' =
        Math.abs(ddx) > Math.abs(ddy)
          ? ddx > 0 ? 'right' : 'left'
          : ddy > 0 ? 'down' : 'up'

      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        wp.x - CHAR_SCALED / 2,
        wp.y - CHAR_SCALED / 2,
        color,
        dir,
        0,
        player.alive,
      )
    }

    // ── Draw exiled character (walking away) ──
    const animFrame = Math.floor(this.time * 4) % 4
    SpriteSheet.drawPlaceholderCharacter(
      ctx,
      this.exileX - CHAR_SCALED / 2,
      this.exileY - CHAR_SCALED / 2,
      this.exileColor,
      this.exileDir,
      animFrame,
      true, // still drawn as alive (walking away)
    )

    // Exile name tag
    ctx.fillStyle = COLORS.ACCENT_RED
    ctx.font = 'bold 12px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.exileName, this.exileX, this.exileY + CHAR_SCALED / 2 + 4)

    ctx.restore()

    // ── Fog overlay (intensifying from edges) ──
    if (this.fogAlpha > 0) {
      // Radial fog: clear in center, dense at edges
      const fogGrad = ctx.createRadialGradient(
        w / 2, h / 2, w * 0.15,
        w / 2, h / 2, w * 0.7,
      )
      fogGrad.addColorStop(0, rgba(COLORS.FOG, this.fogAlpha * 0.1))
      fogGrad.addColorStop(0.5, rgba(COLORS.FOG, this.fogAlpha * 0.5))
      fogGrad.addColorStop(1, rgba(COLORS.FOG, this.fogAlpha))
      ctx.fillStyle = fogGrad
      ctx.fillRect(0, 0, w, h)
    }

    // ── "SURGÜN" title ──
    ctx.save()
    const titleAlpha = clamp(this.time / 1.5, 0, 0.9)
    ctx.fillStyle = rgba(COLORS.ACCENT_RED, titleAlpha)
    ctx.font = 'bold 32px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('SÜRGÜN', w / 2, 24)

    // Exiled name subtitle
    ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, titleAlpha * 0.7)
    ctx.font = '18px monospace'
    ctx.fillText(this.exileName, w / 2, 64)
    ctx.restore()
  }

  // ── Private helpers ──

  private spawnFireParticle(initialFraction?: number): void {
    const maxLife = randFloat(0.5, 1.2)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife

    this.fireParticles.push({
      x: this.campfireX + randFloat(-15, 15),
      y: this.campfireY + randFloat(-5, 5),
      vx: randFloat(-8, 8),
      vy: randFloat(-60, -20),
      life,
      maxLife,
      radius: randFloat(2, 6),
      color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
    })
  }

  private drawTileMap(ctx: CanvasRenderingContext2D): void {
    const { minCol, maxCol, minRow, maxRow } = this.camera.getVisibleTileRange()

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * SCALED_TILE
        const y = row * SCALED_TILE

        const isPath = (col >= 17 && col <= 22 && row >= 5 && row <= 25)
          || (row >= 12 && row <= 17 && col >= 5 && col <= 32)
        ctx.fillStyle = isPath ? COLORS.EARTH : COLORS.GRASS
        ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE)
      }
    }
  }
}
