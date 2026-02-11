// ── LobbyScene ──
// Atmospheric background for the lobby phase.
// Draws an animated campfire, game title, and floating ember particles.
// Actual lobby UI (buttons, player list) is rendered by a React overlay.

import type { Scene } from './SceneManager'
import { COLORS } from '../utils/constants'
import { randFloat, rgba } from '../utils/helpers'

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

const FIRE_COLORS = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, COLORS.FIRE_RED, '#FF6600']
const MAX_PARTICLES = 60

export class LobbyScene implements Scene {
  private particles: FireParticle[] = []
  private time = 0

  enter(): void {
    this.particles = []
    this.time = 0
    // Pre-fill some particles so fire doesn't start empty
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.spawnParticle(Math.random())
    }
  }

  exit(): void {
    this.particles = []
  }

  update(dt: number): void {
    this.time += dt

    // Update existing particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      // Add gentle horizontal sway
      p.vx += Math.sin(this.time * 3 + i) * 0.5 * dt

      if (p.life <= 0) {
        this.particles.splice(i, 1)
      }
    }

    // Respawn to maintain particle count
    while (this.particles.length < MAX_PARTICLES) {
      this.spawnParticle()
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    const centerX = w / 2
    const fireBaseY = h * 0.6

    // ── Dark background ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    // ── Ground plane (subtle earth tone) ──
    ctx.fillStyle = rgba(COLORS.EARTH, 0.15)
    ctx.fillRect(0, fireBaseY + 40, w, h - fireBaseY - 40)

    // ── Campfire base (logs) ──
    ctx.save()
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(centerX - 40, fireBaseY + 10, 80, 12)
    ctx.fillStyle = COLORS.WOOD
    ctx.fillRect(centerX - 30, fireBaseY + 4, 60, 10)
    // Glowing coals
    ctx.fillStyle = rgba(COLORS.FIRE_RED, 0.6 + Math.sin(this.time * 4) * 0.2)
    ctx.fillRect(centerX - 20, fireBaseY + 8, 40, 6)
    ctx.restore()

    // ── Fire glow (radial gradient behind particles) ──
    const glowRadius = 120 + Math.sin(this.time * 2) * 15
    const glow = ctx.createRadialGradient(centerX, fireBaseY, 10, centerX, fireBaseY, glowRadius)
    glow.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.35))
    glow.addColorStop(0.5, rgba(COLORS.FIRE_YELLOW, 0.1))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(centerX - glowRadius, fireBaseY - glowRadius, glowRadius * 2, glowRadius * 2)

    // ── Fire particles ──
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius * alpha, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Title ──
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Title shadow
    ctx.fillStyle = rgba('#000000', 0.5)
    ctx.font = 'bold 56px monospace'
    ctx.fillText('OCAK YEMİNİ', centerX + 2, h * 0.15 + 2)

    // Title text with golden color
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 56px monospace'
    ctx.fillText('OCAK YEMİNİ', centerX, h * 0.15)

    // Subtitle
    ctx.fillStyle = COLORS.TEXT_LIGHT
    ctx.font = '24px monospace'
    ctx.fillText('AI vs İnsan', centerX, h * 0.15 + 50)

    // Subtle pulsing tagline
    const tagAlpha = 0.5 + Math.sin(this.time * 1.5) * 0.3
    ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, tagAlpha)
    ctx.font = '14px monospace'
    ctx.fillText('Ateş etrafında gerçek ortaya çıkar...', centerX, h * 0.15 + 85)

    ctx.restore()
  }

  // ── Private helpers ──

  private spawnParticle(initialLifeFraction?: number): void {
    const w = typeof document !== 'undefined' ? (document.querySelector('canvas')?.width ?? 800) : 800
    const h = typeof document !== 'undefined' ? (document.querySelector('canvas')?.height ?? 600) : 600
    const centerX = w / 2
    const fireBaseY = h * 0.6

    const maxLife = randFloat(0.6, 1.8)
    const life = initialLifeFraction !== undefined ? maxLife * initialLifeFraction : maxLife

    this.particles.push({
      x: centerX + randFloat(-25, 25),
      y: fireBaseY + randFloat(-5, 5),
      vx: randFloat(-15, 15),
      vy: randFloat(-80, -30),
      life,
      maxLife,
      radius: randFloat(3, 8),
      color: FIRE_COLORS[Math.floor(Math.random() * FIRE_COLORS.length)],
    })
  }
}
