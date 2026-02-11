// ── Particles ──
// Particle system for visual effects: fire, fog, ash, sparks, owl.

import { COLORS, BUILDING_POSITIONS, SCALED_TILE } from '../utils/constants'
import { randFloat, randInt, rgba } from '../utils/helpers'
import type { Camera } from './Camera'

// ── Particle interface ──
export interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}

export type EmitterType = 'fire' | 'fog' | 'ash' | 'spark' | 'owl'

// ── Particle Emitter ──
export class ParticleEmitter {
  type: EmitterType
  x: number
  y: number
  particles: Particle[] = []
  active = true

  /** Emission rate: particles per emit() call */
  private rate: number

  /** Maximum concurrent particles */
  private maxParticles: number

  constructor(type: EmitterType, x: number, y: number) {
    this.type = type
    this.x = x
    this.y = y

    // Configure by type
    switch (type) {
      case 'fire':
        this.rate = 3
        this.maxParticles = 60
        break
      case 'fog':
        this.rate = 1
        this.maxParticles = 40
        break
      case 'ash':
        this.rate = 1
        this.maxParticles = 30
        break
      case 'spark':
        this.rate = 5
        this.maxParticles = 25
        break
      case 'owl':
        this.rate = 1
        this.maxParticles = 3
        break
      default:
        this.rate = 1
        this.maxParticles = 20
    }
  }

  /**
   * Emit new particles based on type.
   */
  emit(): void {
    if (!this.active) return
    if (this.particles.length >= this.maxParticles) return

    for (let i = 0; i < this.rate; i++) {
      if (this.particles.length >= this.maxParticles) break
      this.particles.push(this.createParticle())
    }
  }

  private createParticle(): Particle {
    switch (this.type) {
      case 'fire':
        return this.createFireParticle()
      case 'fog':
        return this.createFogParticle()
      case 'ash':
        return this.createAshParticle()
      case 'spark':
        return this.createSparkParticle()
      case 'owl':
        return this.createOwlParticle()
      default:
        return this.createFireParticle()
    }
  }

  private createFireParticle(): Particle {
    const colors = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, COLORS.FIRE_RED, '#FF6600']
    return {
      x: this.x + randFloat(-16, 16),
      y: this.y + randFloat(-4, 4),
      vx: randFloat(-0.5, 0.5),
      vy: randFloat(-2.5, -0.8),
      life: randFloat(30, 60),
      maxLife: 60,
      color: colors[randInt(0, colors.length - 1)],
      size: randFloat(3, 8),
    }
  }

  private createFogParticle(): Particle {
    return {
      x: this.x + randFloat(-100, 100),
      y: this.y + randFloat(-20, 20),
      vx: randFloat(0.2, 1.0),
      vy: randFloat(-0.1, 0.1),
      life: randFloat(80, 160),
      maxLife: 160,
      color: COLORS.FOG,
      size: randFloat(20, 50),
    }
  }

  private createAshParticle(): Particle {
    return {
      x: this.x + randFloat(-200, 200),
      y: this.y + randFloat(-200, -50),
      vx: randFloat(-0.3, 0.3),
      vy: randFloat(0.2, 0.8),
      life: randFloat(100, 200),
      maxLife: 200,
      color: '#A0A0A0',
      size: randFloat(1, 3),
    }
  }

  private createSparkParticle(): Particle {
    return {
      x: this.x + randFloat(-8, 8),
      y: this.y,
      vx: randFloat(-2, 2),
      vy: randFloat(-5, -2),
      life: randFloat(15, 30),
      maxLife: 30,
      color: COLORS.FIRE_YELLOW,
      size: randFloat(2, 4),
    }
  }

  private createOwlParticle(): Particle {
    return {
      x: this.x,
      y: this.y,
      vx: randFloat(-0.5, 0.5),
      vy: randFloat(-0.3, -0.1),
      life: randFloat(100, 200),
      maxLife: 200,
      color: '#DDDDBB',
      size: 6,
    }
  }

  /**
   * Update all particles: apply velocity, reduce life, remove dead ones.
   */
  update(): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]

      p.x += p.vx
      p.y += p.vy
      p.life -= 1

      // Type-specific updates
      if (this.type === 'fire') {
        // Fire shrinks as it rises
        p.size *= 0.98
        // Slight horizontal sway
        p.vx += randFloat(-0.05, 0.05)
      } else if (this.type === 'fog') {
        // Fog expands slightly
        p.size += 0.05
      } else if (this.type === 'spark') {
        // Sparks affected by gravity
        p.vy += 0.15
        p.size *= 0.95
      } else if (this.type === 'ash') {
        // Ash sways
        p.vx += randFloat(-0.02, 0.02)
      } else if (this.type === 'owl') {
        // Owl drifts in a sine wave
        p.vx = Math.sin(p.life * 0.05) * 0.5
      }

      // Remove dead particles
      if (p.life <= 0 || p.size < 0.3) {
        this.particles.splice(i, 1)
      }
    }
  }

  /**
   * Draw all particles onto the canvas.
   */
  draw(ctx: CanvasRenderingContext2D, camera: Camera): void {
    for (const p of this.particles) {
      if (!camera.isVisible(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)) continue

      const screen = camera.worldToScreen(p.x, p.y)
      const alpha = Math.max(0, p.life / p.maxLife)
      const drawSize = p.size * camera.scale

      ctx.save()

      if (this.type === 'fog') {
        // Fog: large semi-transparent circles
        ctx.globalAlpha = alpha * 0.2
        ctx.fillStyle = p.color
        ctx.beginPath()
        ctx.arc(screen.x, screen.y, drawSize, 0, Math.PI * 2)
        ctx.fill()
      } else if (this.type === 'owl') {
        // Owl: small V shape
        ctx.globalAlpha = alpha * 0.8
        ctx.strokeStyle = p.color
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(screen.x - drawSize, screen.y + drawSize / 2)
        ctx.lineTo(screen.x, screen.y)
        ctx.lineTo(screen.x + drawSize, screen.y + drawSize / 2)
        ctx.stroke()
      } else {
        // Fire, ash, spark: filled circles/squares
        ctx.globalAlpha = alpha
        ctx.fillStyle = p.color

        if (this.type === 'spark') {
          // Sparks: small bright dots
          ctx.shadowColor = COLORS.FIRE_YELLOW
          ctx.shadowBlur = 4
        }

        ctx.fillRect(
          screen.x - drawSize / 2,
          screen.y - drawSize / 2,
          drawSize,
          drawSize,
        )
      }

      ctx.restore()
    }
  }
}

// ── Convenience: create a fire emitter at the Ocak position ──
export function createOcakFireEmitter(): ParticleEmitter {
  const ocak = BUILDING_POSITIONS.ocak
  const centerX = (ocak.x + ocak.w / 2) * SCALED_TILE
  const centerY = (ocak.y + ocak.h / 2) * SCALED_TILE
  return new ParticleEmitter('fire', centerX, centerY)
}

// ── Convenience: create fog emitter across the map ──
export function createFogEmitter(worldX: number, worldY: number): ParticleEmitter {
  return new ParticleEmitter('fog', worldX, worldY)
}

// ── Convenience: create ash emitter ──
export function createAshEmitter(worldX: number, worldY: number): ParticleEmitter {
  return new ParticleEmitter('ash', worldX, worldY)
}

// ── Convenience: create spark burst (for Ocak tepki reactions) ──
export function createSparkBurst(worldX: number, worldY: number): ParticleEmitter {
  const emitter = new ParticleEmitter('spark', worldX, worldY)
  // Emit a burst immediately
  for (let i = 0; i < 10; i++) {
    emitter.emit()
  }
  // Auto-deactivate after burst
  emitter.active = false
  return emitter
}
