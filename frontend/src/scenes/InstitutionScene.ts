// ── InstitutionScene ──
// Interior view for institution visits. Similar to HouseScene but themed
// per institution type. A single character (the visitor) is shown inside.
// Institution name displayed prominently. Special ambient effects per type.

import type { Scene } from './SceneManager'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import { COLORS, CHAR_SIZE, CHAR_SCALE, BUILDING_POSITIONS, BUILDING } from '../utils/constants'
import { rgba, getPlayerColor, randFloat } from '../utils/helpers'

const PORTRAIT_SCALE = 3
const PORTRAIT_SIZE = CHAR_SIZE * CHAR_SCALE * PORTRAIT_SCALE

// ── Institution theme config ──
interface InstitutionTheme {
  wallColor: string
  floorColor: string
  accentColor: string
  ambientColor: string
  icon: string // text-based icon placeholder
}

const INSTITUTION_THEMES: Record<string, InstitutionTheme> = {
  [BUILDING.GECIT_KULESI]: {
    wallColor: '#3A3A4A',
    floorColor: '#555566',
    accentColor: '#8888CC',
    ambientColor: '#6666AA',
    icon: 'T',
  },
  [BUILDING.DEMIRHANE]: {
    wallColor: '#4A3A2A',
    floorColor: '#5A4A3A',
    accentColor: COLORS.FIRE_ORANGE,
    ambientColor: COLORS.FIRE_RED,
    icon: 'D',
  },
  [BUILDING.SIFHANE]: {
    wallColor: '#2A4A3A',
    floorColor: '#3A5A4A',
    accentColor: '#66CCAA',
    ambientColor: '#44AA88',
    icon: 'S',
  },
  [BUILDING.KILER]: {
    wallColor: '#4A4030',
    floorColor: '#5A5040',
    accentColor: COLORS.SAND,
    ambientColor: '#BBAA77',
    icon: 'K',
  },
  [BUILDING.KUL_TAPINAGI]: {
    wallColor: '#2A2040',
    floorColor: '#3A3050',
    accentColor: '#9966CC',
    ambientColor: '#7744AA',
    icon: 'R',
  },
  [BUILDING.GEZGIN_HANI]: {
    wallColor: '#4A3820',
    floorColor: '#5A4830',
    accentColor: COLORS.FIRE_YELLOW,
    ambientColor: COLORS.FIRE_ORANGE,
    icon: 'G',
  },
}

const DEFAULT_THEME: InstitutionTheme = {
  wallColor: '#4A4A4A',
  floorColor: '#5A5A5A',
  accentColor: COLORS.TEXT_GOLD,
  ambientColor: COLORS.FIRE_ORANGE,
  icon: '?',
}

// ── Ambient particle ──
interface AmbientParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  radius: number
}

const MAX_AMBIENT = 20

export class InstitutionScene implements Scene {
  private time = 0
  private visitorColor: string = COLORS.TEXT_LIGHT
  private visitorName = ''
  private institutionId = ''
  private institutionLabel = ''
  private theme: InstitutionTheme = DEFAULT_THEME
  private ambientParticles: AmbientParticle[] = []

  enter(): void {
    this.time = 0
    this.ambientParticles = []

    // Determine which institution we're visiting from the current player's data
    const state = useGameStore.getState()
    const players = state.players
    const myName = state.myName

    // Find the current player to get their institution
    const myPlayer = players.find((p) => p.name === myName)
    const institutionKey = myPlayer?.institution ?? ''

    this.institutionId = institutionKey
    this.institutionLabel = myPlayer?.institution_label
      ?? BUILDING_POSITIONS[institutionKey]?.label
      ?? 'Kurum'

    this.theme = INSTITUTION_THEMES[institutionKey] ?? DEFAULT_THEME

    // Visitor appearance
    const myIdx = myPlayer ? players.indexOf(myPlayer) : 0
    this.visitorName = myName ?? 'Ziyaretci'
    this.visitorColor = myPlayer?.color ?? getPlayerColor(myIdx)

    // Pre-fill some ambient particles
    for (let i = 0; i < MAX_AMBIENT; i++) {
      this.spawnAmbient(Math.random())
    }
  }

  exit(): void {
    this.ambientParticles = []
  }

  update(dt: number): void {
    this.time += dt

    // Update ambient particles
    for (let i = this.ambientParticles.length - 1; i >= 0; i--) {
      const p = this.ambientParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      p.vx += Math.sin(this.time + i) * 0.3 * dt

      if (p.life <= 0) {
        this.ambientParticles.splice(i, 1)
      }
    }
    while (this.ambientParticles.length < MAX_AMBIENT) {
      this.spawnAmbient()
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    const theme = this.theme

    // ── Room background ──
    // Wall
    ctx.fillStyle = theme.wallColor
    ctx.fillRect(0, 0, w, h * 0.45)

    // Accent stripe
    ctx.fillStyle = rgba(theme.accentColor, 0.25)
    ctx.fillRect(0, h * 0.45 - 6, w, 6)

    // Floor
    ctx.fillStyle = theme.floorColor
    ctx.fillRect(0, h * 0.45, w, h * 0.55)

    // Floor pattern (tiles)
    ctx.strokeStyle = rgba('#000000', 0.08)
    ctx.lineWidth = 1
    const tileSize = 64
    for (let ty = h * 0.45; ty < h; ty += tileSize) {
      for (let tx = 0; tx < w; tx += tileSize) {
        ctx.strokeRect(tx, ty, tileSize, tileSize)
      }
    }

    // ── Institution emblem on back wall ──
    const emblemX = w / 2
    const emblemY = h * 0.15
    const emblemR = 50

    // Circle background
    ctx.save()
    ctx.fillStyle = rgba(theme.accentColor, 0.2)
    ctx.beginPath()
    ctx.arc(emblemX, emblemY, emblemR, 0, Math.PI * 2)
    ctx.fill()

    ctx.strokeStyle = rgba(theme.accentColor, 0.5)
    ctx.lineWidth = 3
    ctx.stroke()

    // Icon letter
    ctx.fillStyle = theme.accentColor
    ctx.font = 'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(theme.icon, emblemX, emblemY)
    ctx.restore()

    // ── Institution name ──
    ctx.save()
    // Shadow
    ctx.fillStyle = rgba('#000000', 0.5)
    ctx.font = 'bold 32px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(this.institutionLabel, emblemX + 2, h * 0.3 + 2)

    // Text
    ctx.fillStyle = theme.accentColor
    ctx.fillText(this.institutionLabel, emblemX, h * 0.3)
    ctx.restore()

    // ── Visitor character (centered) ──
    const charX = w / 2 - PORTRAIT_SIZE / 2
    const charY = h * 0.45

    ctx.save()
    ctx.translate(charX, charY)
    ctx.scale(PORTRAIT_SCALE, PORTRAIT_SCALE)

    SpriteSheet.drawPlaceholderCharacter(
      ctx,
      0,
      0,
      this.visitorColor,
      'up', // facing the institution emblem
      0,
      true,
    )
    ctx.restore()

    // Visitor name tag
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.visitorName, w / 2, charY + PORTRAIT_SIZE + 10)

    // ── Ambient particles ──
    for (const p of this.ambientParticles) {
      const alpha = Math.max(0, (p.life / p.maxLife) * 0.4)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = theme.ambientColor
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Ambient light overlay ──
    ctx.save()
    ctx.fillStyle = rgba(theme.ambientColor, 0.03 + Math.sin(this.time * 0.8) * 0.01)
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // ── Vignette ──
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, rgba('#000000', 0.35))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  }

  // ── Private helpers ──

  private spawnAmbient(initialFraction?: number): void {
    const w = typeof document !== 'undefined' ? (document.querySelector('canvas')?.width ?? 800) : 800
    const h = typeof document !== 'undefined' ? (document.querySelector('canvas')?.height ?? 600) : 600
    const maxLife = randFloat(2, 5)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife

    this.ambientParticles.push({
      x: randFloat(0, w),
      y: randFloat(h * 0.3, h),
      vx: randFloat(-10, 10),
      vy: randFloat(-15, -3),
      life,
      maxLife,
      radius: randFloat(1, 3),
    })
  }
}
