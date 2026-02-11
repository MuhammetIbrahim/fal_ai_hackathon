// ── MorningScene ──
// Camera zooms into the campfire area with golden morning light.
// Enhanced fire particles and warm ash/light specks drifting.
// Parchment modal and omen cards are handled by the React UI overlay.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { COLORS, SCALED_TILE, BUILDING_POSITIONS, BUILDING, TILE, MAP_COLS, MAP_ROWS } from '../utils/constants'
import { rgba, randFloat, tileToPixel, lerp, clamp } from '../utils/helpers'

// ── Ambient particle (ash / warm light speck) ──
interface AmbientParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
  color: string
}

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

const FIRE_COLORS = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, '#FFE08C', '#FFA500']
const MAX_FIRE = 50
const MAX_AMBIENT = 30

export class MorningScene implements Scene {
  private camera: Camera
  private fireParticles: FireParticle[] = []
  private ambientParticles: AmbientParticle[] = []
  private time = 0
  private zoomProgress = 0 // 0→1 zoom-in animation

  // Campfire world position (center of the ocak building)
  private campfireX = 0
  private campfireY = 0

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.zoomProgress = 0
    this.fireParticles = []
    this.ambientParticles = []

    // Calculate campfire world position from the building data
    const ocak = BUILDING_POSITIONS[BUILDING.OCAK]
    this.campfireX = (ocak.x + ocak.w / 2) * SCALED_TILE
    this.campfireY = (ocak.y + ocak.h / 2) * SCALED_TILE

    // Start camera zoomed out, will animate zoom-in
    this.camera.setScale(0.6)
    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.snapToTarget()

    // Pre-fill fire particles
    for (let i = 0; i < MAX_FIRE; i++) {
      this.spawnFireParticle(Math.random())
    }
  }

  exit(): void {
    this.fireParticles = []
    this.ambientParticles = []
  }

  update(dt: number): void {
    this.time += dt

    // Animate zoom-in over 2 seconds
    if (this.zoomProgress < 1) {
      this.zoomProgress = clamp(this.zoomProgress + dt / 2, 0, 1)
      // Ease-out interpolation
      const t = 1 - Math.pow(1 - this.zoomProgress, 3)
      const scale = lerp(0.6, 1.0, t)
      this.camera.setScale(scale)
    }

    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.update()

    // Update fire particles
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      p.vx += Math.sin(this.time * 3 + i * 0.7) * 0.3 * dt

      if (p.life <= 0) {
        this.fireParticles.splice(i, 1)
      }
    }
    while (this.fireParticles.length < MAX_FIRE) {
      this.spawnFireParticle()
    }

    // Update ambient particles (ash, light specks)
    for (let i = this.ambientParticles.length - 1; i >= 0; i--) {
      const p = this.ambientParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      // Gentle sway
      p.vx += Math.sin(this.time * 0.5 + i * 1.3) * 0.2 * dt

      if (p.life <= 0) {
        this.ambientParticles.splice(i, 1)
      }
    }
    while (this.ambientParticles.length < MAX_AMBIENT) {
      this.spawnAmbientParticle()
    }
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

    // ── Draw tile map (simplified placeholder grid) ──
    this.drawTileMap(ctx)

    // ── Draw buildings ──
    this.drawBuildings(ctx)

    // ── Fire glow on ground ──
    const glowR = 140 + Math.sin(this.time * 2) * 20
    const glow = ctx.createRadialGradient(
      this.campfireX, this.campfireY, 15,
      this.campfireX, this.campfireY, glowR,
    )
    glow.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.3))
    glow.addColorStop(0.5, rgba(COLORS.FIRE_YELLOW, 0.1))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(
      this.campfireX - glowR,
      this.campfireY - glowR,
      glowR * 2,
      glowR * 2,
    )

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

    // ── Ambient particles ──
    for (const p of this.ambientParticles) {
      const alpha = Math.max(0, (p.life / p.maxLife) * 0.6)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()

    // ── Golden morning light overlay (full-screen, warm yellow) ──
    ctx.save()
    ctx.fillStyle = rgba('#FFD700', 0.06 + Math.sin(this.time * 0.8) * 0.02)
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // ── Private helpers ──

  private spawnFireParticle(initialFraction?: number): void {
    const maxLife = randFloat(0.5, 1.4)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife

    this.fireParticles.push({
      x: this.campfireX + randFloat(-20, 20),
      y: this.campfireY + randFloat(-5, 5),
      vx: randFloat(-12, 12),
      vy: randFloat(-90, -35),
      life,
      maxLife,
      radius: randFloat(4, 10),
      color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
    })
  }

  private spawnAmbientParticle(): void {
    const maxLife = randFloat(2, 5)
    this.ambientParticles.push({
      x: this.campfireX + randFloat(-200, 200),
      y: this.campfireY + randFloat(-150, 100),
      vx: randFloat(-8, 8),
      vy: randFloat(-20, -5),
      life: maxLife,
      maxLife,
      radius: randFloat(1, 3),
      color: Math.random() > 0.5 ? COLORS.FIRE_YELLOW : '#CCBBAA',
    })
  }

  private drawTileMap(ctx: CanvasRenderingContext2D): void {
    const { minCol, maxCol, minRow, maxRow } = this.camera.getVisibleTileRange()

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * SCALED_TILE
        const y = row * SCALED_TILE

        // Simple tile coloring
        const isPath = (col >= 17 && col <= 22 && row >= 5 && row <= 25)
          || (row >= 12 && row <= 17 && col >= 5 && col <= 32)
        ctx.fillStyle = isPath ? COLORS.EARTH : COLORS.GRASS
        ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE)

        // Grid lines (subtle)
        ctx.strokeStyle = rgba('#000000', 0.05)
        ctx.strokeRect(x, y, SCALED_TILE, SCALED_TILE)
      }
    }
  }

  private drawBuildings(ctx: CanvasRenderingContext2D): void {
    for (const [id, b] of Object.entries(BUILDING_POSITIONS)) {
      const bx = b.x * SCALED_TILE
      const by = b.y * SCALED_TILE
      const bw = b.w * SCALED_TILE
      const bh = b.h * SCALED_TILE

      const color = id === BUILDING.OCAK ? COLORS.FIRE_ORANGE : COLORS.WOOD
      ctx.fillStyle = color
      ctx.fillRect(bx, by, bw, bh)
      ctx.strokeStyle = rgba('#000000', 0.3)
      ctx.lineWidth = 2
      ctx.strokeRect(bx, by, bw, bh)

      // Label
      ctx.fillStyle = COLORS.TEXT_LIGHT
      ctx.font = 'bold 12px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(b.label, bx + bw / 2, by - 4)
    }
  }
}
