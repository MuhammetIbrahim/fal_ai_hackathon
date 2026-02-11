// ── CampfireScene ──
// Characters sit in a semicircle around the campfire during the debate phase.
// Fire reacts to ocakTepki events (color changes + spark bursts).
// Speech bubbles and UI overlays are rendered by React.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import {
  COLORS, SCALED_TILE, BUILDING_POSITIONS, BUILDING,
  CHAR_SIZE, CHAR_SCALE, MAP_COLS, MAP_ROWS,
} from '../utils/constants'
import { rgba, randFloat, tileToPixel, getPlayerColor, clamp } from '../utils/helpers'
import type { Player, OcakTepki } from '../state/types'

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

// ── Spark particle (for ocak tepki) ──
interface SparkParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
  color: string
}

const FIRE_COLORS_NORMAL = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, '#FFE08C']
const FIRE_COLORS_RAGE = [COLORS.FIRE_RED, '#FF2200', '#FF4444']
const FIRE_COLORS_APPROVAL = ['#22CC44', '#66FF66', COLORS.FIRE_YELLOW]

const MAX_FIRE = 45
const SEMICIRCLE_RADIUS = 200 // pixels from campfire center

export class CampfireScene implements Scene {
  private camera: Camera
  private fireParticles: FireParticle[] = []
  private sparkParticles: SparkParticle[] = []
  private time = 0

  // Campfire world position
  private campfireX = 0
  private campfireY = 0

  // Character seat positions (world coords)
  private seatPositions: { x: number; y: number }[] = []

  // Current fire color set (changes on tepki)
  private currentFireColors: string[] = FIRE_COLORS_NORMAL
  private tepkiTimer = 0 // seconds remaining in tepki color mode
  private lastTepkiId: string | null = null

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.fireParticles = []
    this.sparkParticles = []
    this.currentFireColors = FIRE_COLORS_NORMAL
    this.tepkiTimer = 0
    this.lastTepkiId = null

    // Campfire position
    const ocak = BUILDING_POSITIONS[BUILDING.OCAK]
    this.campfireX = (ocak.x + ocak.w / 2) * SCALED_TILE
    this.campfireY = (ocak.y + ocak.h / 2) * SCALED_TILE

    // Camera
    this.camera.setScale(1)
    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.snapToTarget()

    // Calculate semicircle seat positions for alive players
    this.recalcSeats()

    // Pre-fill fire particles
    for (let i = 0; i < MAX_FIRE; i++) {
      this.spawnFireParticle(Math.random())
    }
  }

  exit(): void {
    this.fireParticles = []
    this.sparkParticles = []
  }

  update(dt: number): void {
    this.time += dt

    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.update()

    // ── Check for ocak tepki from the store ──
    const tepki = useGameStore.getState().ocakTepki
    if (tepki) {
      const tepkiKey = `${tepki.type}-${tepki.message}`
      if (tepkiKey !== this.lastTepkiId) {
        this.lastTepkiId = tepkiKey
        this.triggerTepki(tepki)
      }
    }

    // Tepki color timer
    if (this.tepkiTimer > 0) {
      this.tepkiTimer -= dt
      if (this.tepkiTimer <= 0) {
        this.currentFireColors = FIRE_COLORS_NORMAL
        this.tepkiTimer = 0
      }
    }

    // ── Update fire particles ──
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      p.vx += Math.sin(this.time * 3 + i * 0.5) * 0.4 * dt

      if (p.life <= 0) {
        this.fireParticles.splice(i, 1)
      }
    }
    while (this.fireParticles.length < MAX_FIRE) {
      this.spawnFireParticle()
    }

    // ── Update spark particles ──
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 120 * dt // gravity
      p.life -= dt

      if (p.life <= 0) {
        this.sparkParticles.splice(i, 1)
      }
    }

    // Recalculate seats if player count changed
    this.recalcSeats()
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // Sync camera viewport to actual canvas size
    this.camera.resize(w, h)

    // ── Clear ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.scale(this.camera.scale, this.camera.scale)
    ctx.translate(-this.camera.x, -this.camera.y)

    // ── Draw tile map (zoomed into campfire area) ──
    this.drawTileMap(ctx)

    // ── Fire glow ──
    const glowR = 180 + Math.sin(this.time * 2.5) * 25
    const glow = ctx.createRadialGradient(
      this.campfireX, this.campfireY, 10,
      this.campfireX, this.campfireY, glowR,
    )
    const primaryColor = this.currentFireColors[0]
    glow.addColorStop(0, rgba(primaryColor, 0.35))
    glow.addColorStop(0.5, rgba(primaryColor, 0.1))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(
      this.campfireX - glowR,
      this.campfireY - glowR,
      glowR * 2,
      glowR * 2,
    )

    // ── Campfire base ──
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(this.campfireX - 30, this.campfireY + 8, 60, 10)
    ctx.fillStyle = COLORS.WOOD
    ctx.fillRect(this.campfireX - 22, this.campfireY + 2, 44, 8)

    // ── Fire particles ──
    for (const p of this.fireParticles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius * (0.4 + alpha * 0.6), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Spark particles ──
    for (const sp of this.sparkParticles) {
      const alpha = Math.max(0, sp.life / sp.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = sp.color
      ctx.fillRect(sp.x - sp.radius / 2, sp.y - sp.radius / 2, sp.radius, sp.radius)
      ctx.restore()
    }

    // ── Draw characters in semicircle ──
    const players = useGameStore.getState().players
    const alivePlayers = players.filter((p) => p.alive)

    for (let i = 0; i < alivePlayers.length; i++) {
      const seat = this.seatPositions[i]
      if (!seat) continue
      const player = alivePlayers[i]

      // Determine direction: face the campfire
      const dx = this.campfireX - seat.x
      const dy = this.campfireY - seat.y
      const dir: 'up' | 'down' | 'left' | 'right' =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? 'right' : 'left'
          : dy > 0 ? 'down' : 'up'

      const charSize = CHAR_SIZE * CHAR_SCALE
      const color = player.color ?? getPlayerColor(i)

      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        seat.x - charSize / 2,
        seat.y - charSize / 2,
        color,
        dir,
        Math.floor(this.time * 2) % 2,
        player.alive,
      )

      // Name tag
      ctx.fillStyle = COLORS.TEXT_LIGHT
      ctx.font = 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(player.name, seat.x, seat.y + charSize / 2 + 4)
    }

    ctx.restore()
  }

  // ── Private helpers ──

  private recalcSeats(): void {
    const players = useGameStore.getState().players
    const alivePlayers = players.filter((p) => p.alive)
    const count = alivePlayers.length

    if (count === 0) {
      this.seatPositions = []
      return
    }

    // Semicircle: bottom half (PI to 2PI), distributed evenly
    this.seatPositions = []
    const startAngle = Math.PI * 0.8
    const endAngle = Math.PI * 2.2
    const step = (endAngle - startAngle) / Math.max(1, count - 1)

    for (let i = 0; i < count; i++) {
      const angle = count === 1 ? Math.PI * 1.5 : startAngle + step * i
      this.seatPositions.push({
        x: this.campfireX + Math.cos(angle) * SEMICIRCLE_RADIUS,
        y: this.campfireY + Math.sin(angle) * SEMICIRCLE_RADIUS,
      })
    }
  }

  private triggerTepki(tepki: OcakTepki): void {
    // Change fire color based on tepki type
    switch (tepki.type) {
      case 'rage':
        this.currentFireColors = FIRE_COLORS_RAGE
        break
      case 'approval':
        this.currentFireColors = FIRE_COLORS_APPROVAL
        break
      default:
        this.currentFireColors = FIRE_COLORS_NORMAL
    }
    this.tepkiTimer = 4 // seconds

    // Burst of sparks
    for (let i = 0; i < 25; i++) {
      this.sparkParticles.push({
        x: this.campfireX + randFloat(-10, 10),
        y: this.campfireY + randFloat(-10, 0),
        vx: randFloat(-150, 150),
        vy: randFloat(-200, -50),
        life: randFloat(0.5, 1.2),
        maxLife: 1.2,
        radius: randFloat(2, 5),
        color: this.currentFireColors[Math.floor(Math.random() * this.currentFireColors.length)],
      })
    }
  }

  private spawnFireParticle(initialFraction?: number): void {
    const maxLife = randFloat(0.5, 1.2)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife
    const colors = this.currentFireColors

    this.fireParticles.push({
      x: this.campfireX + randFloat(-18, 18),
      y: this.campfireY + randFloat(-5, 5),
      vx: randFloat(-10, 10),
      vy: randFloat(-80, -30),
      life,
      maxLife,
      radius: randFloat(3, 9),
      color: colors[Math.floor(Math.random() * colors.length)],
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

        ctx.strokeStyle = rgba('#000000', 0.04)
        ctx.strokeRect(x, y, SCALED_TILE, SCALED_TILE)
      }
    }
  }
}
