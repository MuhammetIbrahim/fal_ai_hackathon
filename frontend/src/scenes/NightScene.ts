// ── NightScene ──
// Dark settlement map with very limited visibility.
// Faint campfire glow, twinkling stars, occasional owl silhouettes.
// Night action cards and choices are handled by the React UI overlay.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { useGameStore } from '../state/GameStore'
import { COLORS, SCALED_TILE, BUILDING_POSITIONS, BUILDING, MAP_COLS, MAP_ROWS } from '../utils/constants'
import { rgba, randFloat, randInt, clamp } from '../utils/helpers'

// ── Star ──
interface Star {
  x: number // screen-space fraction (0..1)
  y: number // screen-space fraction (0..1)
  baseAlpha: number
  twinkleSpeed: number
  twinkleOffset: number
  radius: number
}

// ── Owl silhouette ──
interface OwlParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  wingPhase: number
  size: number
}

// ── Faint fire particle ──
interface EmberParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
}

const NUM_STARS = 80
const MAX_OWLS = 2
const MAX_EMBERS = 15
const DARK_OVERLAY_ALPHA = 0.7

export class NightScene implements Scene {
  private camera: Camera
  private time = 0
  private stars: Star[] = []
  private owls: OwlParticle[] = []
  private embers: EmberParticle[] = []
  private owlSpawnTimer = 0

  // Campfire world position
  private campfireX = 0
  private campfireY = 0

  // Avatar images
  private avatarImages = new Map<string, HTMLImageElement>()
  private avatarLoadingSet = new Set<string>()

  // Background image
  private backgroundImage: HTMLImageElement | null = null
  private backgroundLoading = false

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.owlSpawnTimer = randFloat(3, 8)

    // Campfire position
    const ocak = BUILDING_POSITIONS[BUILDING.OCAK]
    this.campfireX = (ocak.x + ocak.w / 2) * SCALED_TILE
    this.campfireY = (ocak.y + ocak.h / 2) * SCALED_TILE

    // Camera centered on campfire, slight zoom out
    this.camera.setScale(0.8)
    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.snapToTarget()

    // Load background and avatars
    const state = useGameStore.getState()
    const bgUrl = state.sceneBackgrounds?.night
    if (bgUrl && !this.backgroundLoading) {
      this.loadBackground(bgUrl)
    }

    for (const player of state.players) {
      if (player.avatar_url) {
        this.loadAvatar(player.name, player.avatar_url)
      }
    }

    // Generate stars
    this.stars = []
    for (let i = 0; i < NUM_STARS; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.6, // only upper portion of sky
        baseAlpha: randFloat(0.3, 0.9),
        twinkleSpeed: randFloat(1.5, 4),
        twinkleOffset: randFloat(0, Math.PI * 2),
        radius: randFloat(0.8, 2.5),
      })
    }

    // Initialize some embers
    this.embers = []
    this.owls = []

    for (let i = 0; i < MAX_EMBERS; i++) {
      this.spawnEmber(Math.random())
    }
  }

  exit(): void {
    this.stars = []
    this.owls = []
    this.embers = []
  }

  update(dt: number): void {
    this.time += dt

    this.camera.follow(this.campfireX, this.campfireY)
    this.camera.update()

    // ── Update embers ──
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i]
      e.x += e.vx * dt
      e.y += e.vy * dt
      e.life -= dt
      e.vx += Math.sin(this.time * 2 + i) * 0.3 * dt

      if (e.life <= 0) {
        this.embers.splice(i, 1)
      }
    }
    while (this.embers.length < MAX_EMBERS) {
      this.spawnEmber()
    }

    // ── Owl spawning ──
    this.owlSpawnTimer -= dt
    if (this.owlSpawnTimer <= 0 && this.owls.length < MAX_OWLS) {
      this.spawnOwl()
      this.owlSpawnTimer = randFloat(6, 15)
    }

    // ── Update owls ──
    for (let i = this.owls.length - 1; i >= 0; i--) {
      const owl = this.owls[i]
      owl.x += owl.vx * dt
      owl.y += owl.vy * dt
      owl.life -= dt
      owl.wingPhase += dt * 4

      if (owl.life <= 0) {
        this.owls.splice(i, 1)
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // Sync camera viewport to actual canvas size
    this.camera.resize(w, h)

    // ── Night sky background ──
    ctx.fillStyle = COLORS.NIGHT_BLUE
    ctx.fillRect(0, 0, w, h)

    // ── Stars (screen space, behind everything) ──
    for (const star of this.stars) {
      const alpha = star.baseAlpha *
        (0.5 + 0.5 * Math.sin(this.time * star.twinkleSpeed + star.twinkleOffset))
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(star.x * w, star.y * h, star.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Owl silhouettes (screen space) ──
    for (const owl of this.owls) {
      const alpha = Math.max(0, Math.min(1, owl.life / owl.maxLife))
      ctx.save()
      ctx.globalAlpha = alpha * 0.6
      ctx.fillStyle = '#1A1A2E'
      this.drawOwlSilhouette(ctx, owl.x, owl.y, owl.size, owl.wingPhase)
      ctx.restore()
    }

    // ── World layer (map + buildings + campfire glow) ──
    ctx.save()
    ctx.scale(this.camera.scale, this.camera.scale)
    ctx.translate(-this.camera.x, -this.camera.y)

    // Draw background or dark tile map
    if (this.backgroundImage) {
      this.drawBackground(ctx)
    } else {
      this.drawDarkTileMap(ctx)
      this.drawDarkBuildings(ctx)
    }

    // ── Faint campfire glow ──
    const glowR = 100 + Math.sin(this.time * 1.5) * 15
    const glow = ctx.createRadialGradient(
      this.campfireX, this.campfireY, 5,
      this.campfireX, this.campfireY, glowR,
    )
    glow.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.15))
    glow.addColorStop(0.6, rgba(COLORS.FIRE_ORANGE, 0.05))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(
      this.campfireX - glowR,
      this.campfireY - glowR,
      glowR * 2,
      glowR * 2,
    )

    // Small fire embers
    for (const e of this.embers) {
      const alpha = Math.max(0, e.life / e.maxLife) * 0.7
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = COLORS.FIRE_ORANGE
      ctx.beginPath()
      ctx.arc(e.x, e.y, e.radius * alpha, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    ctx.restore()

    // ── Dark blue overlay (high alpha) ──
    ctx.save()
    ctx.fillStyle = rgba(COLORS.NIGHT_BLUE, DARK_OVERLAY_ALPHA)
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // ── Campfire light punch-through (lighter circle in center of screen) ──
    // The campfire glow should partially show through the dark overlay
    const screenCampfire = this.camera.worldToScreen(this.campfireX, this.campfireY)
    const punchR = 80
    const punch = ctx.createRadialGradient(
      screenCampfire.x * this.camera.scale,
      screenCampfire.y * this.camera.scale,
      5,
      screenCampfire.x * this.camera.scale,
      screenCampfire.y * this.camera.scale,
      punchR,
    )
    punch.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.08))
    punch.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = punch
    ctx.fillRect(0, 0, w, h)

    // ── Vignette and grain ──
    this.drawPostEffects(ctx, w, h)

    // ── "GECE" title (subtle) ──
    ctx.save()
    ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, 0.3)
    ctx.font = 'bold 20px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('GECE', w / 2, 20)
    ctx.restore()
  }

  // ── Private helpers ──

  private spawnEmber(initialFraction?: number): void {
    const maxLife = randFloat(0.8, 2)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife

    this.embers.push({
      x: this.campfireX + randFloat(-15, 15),
      y: this.campfireY + randFloat(-5, 5),
      vx: randFloat(-8, 8),
      vy: randFloat(-40, -15),
      life,
      maxLife,
      radius: randFloat(1.5, 4),
    })
  }

  private spawnOwl(): void {
    const w = typeof document !== 'undefined' ? (document.querySelector('canvas')?.width ?? 800) : 800
    const h = typeof document !== 'undefined' ? (document.querySelector('canvas')?.height ?? 600) : 600

    const fromLeft = Math.random() > 0.5
    const maxLife = randFloat(4, 8)

    this.owls.push({
      x: fromLeft ? -30 : w + 30,
      y: randFloat(h * 0.05, h * 0.35),
      vx: fromLeft ? randFloat(30, 70) : randFloat(-70, -30),
      vy: randFloat(-5, 5),
      life: maxLife,
      maxLife,
      wingPhase: 0,
      size: randFloat(12, 22),
    })
  }

  /** Draw a simple owl silhouette with flapping wings */
  private drawOwlSilhouette(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    wingPhase: number,
  ): void {
    const wingOffset = Math.sin(wingPhase) * size * 0.5

    // Body (oval)
    ctx.beginPath()
    ctx.ellipse(x, y, size * 0.4, size * 0.6, 0, 0, Math.PI * 2)
    ctx.fill()

    // Left wing
    ctx.beginPath()
    ctx.moveTo(x - size * 0.3, y)
    ctx.quadraticCurveTo(x - size, y - wingOffset, x - size * 0.8, y + size * 0.3)
    ctx.fill()

    // Right wing
    ctx.beginPath()
    ctx.moveTo(x + size * 0.3, y)
    ctx.quadraticCurveTo(x + size, y - wingOffset, x + size * 0.8, y + size * 0.3)
    ctx.fill()
  }

  private drawDarkTileMap(ctx: CanvasRenderingContext2D): void {
    const { minCol, maxCol, minRow, maxRow } = this.camera.getVisibleTileRange()

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * SCALED_TILE
        const y = row * SCALED_TILE

        // Everything is very dark at night
        const isPath = (col >= 17 && col <= 22 && row >= 5 && row <= 25)
          || (row >= 12 && row <= 17 && col >= 5 && col <= 32)
        ctx.fillStyle = isPath ? '#0F1520' : '#0A1018'
        ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE)
      }
    }
  }

  private drawDarkBuildings(ctx: CanvasRenderingContext2D): void {
    for (const [_id, b] of Object.entries(BUILDING_POSITIONS)) {
      const bx = b.x * SCALED_TILE
      const by = b.y * SCALED_TILE
      const bw = b.w * SCALED_TILE
      const bh = b.h * SCALED_TILE

      // Dark building silhouette
      ctx.fillStyle = '#0D0D15'
      ctx.fillRect(bx, by, bw, bh)
      ctx.strokeStyle = rgba('#000000', 0.4)
      ctx.lineWidth = 2
      ctx.strokeRect(bx, by, bw, bh)
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D): void {
    if (!this.backgroundImage) return
    const imgW = this.backgroundImage.width
    const imgH = this.backgroundImage.height
    const tilePixels = SCALED_TILE
    const worldW = 40 * tilePixels
    const worldH = 30 * tilePixels
    const scale = Math.max(worldW / imgW, worldH / imgH)
    const drawW = imgW * scale
    const drawH = imgH * scale
    ctx.drawImage(this.backgroundImage, 0, 0, drawW, drawH)
  }

  private loadAvatar(name: string, url?: string): void {
    if (!url || this.avatarLoadingSet.has(name)) return
    this.avatarLoadingSet.add(name)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.avatarImages.set(name, img)
    }
    img.onerror = () => {
      this.avatarLoadingSet.delete(name)
    }
    img.src = url
  }

  private loadBackground(url: string): void {
    this.backgroundLoading = true
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.backgroundImage = img
      this.backgroundLoading = false
    }
    img.onerror = () => {
      this.backgroundLoading = false
    }
    img.src = url
  }

  /** Post-processing: vignette and film grain for night atmosphere */
  private drawPostEffects(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Strong vignette for night mystery
    const vignette = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.15,
      w / 2, h / 2, Math.max(w, h) * 0.6
    )
    vignette.addColorStop(0, 'rgba(0,0,0,0)')
    vignette.addColorStop(0.6, rgba(COLORS.NIGHT_BLUE, 0.3))
    vignette.addColorStop(1, rgba(COLORS.NIGHT_BLUE, 0.7))
    ctx.fillStyle = vignette
    ctx.fillRect(0, 0, w, h)

    // Film grain
    const imageData = ctx.getImageData(0, 0, w, h)
    const data = imageData.data
    const grainIntensity = 0.035
    
    for (let i = 0; i < data.length; i += 16) {
      const noise = (Math.random() - 0.5) * 255 * grainIntensity
      data[i] += noise
      data[i + 1] += noise
      data[i + 2] += noise
    }
    
    ctx.putImageData(imageData, 0, 0)
  }
}
