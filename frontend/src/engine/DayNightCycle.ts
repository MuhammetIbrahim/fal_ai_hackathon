// ── DayNightCycle ──
// Manages the time-of-day visual overlay for the pixel-art game world.
// Smoothly transitions between morning, day, evening, and night lighting.

import { lerp } from '../utils/helpers'

export type TimeOfDay = 'morning' | 'day' | 'evening' | 'night'

interface TimeConfig {
  color: string
  alpha: number
}

const TIME_CONFIGS: Record<TimeOfDay, TimeConfig> = {
  morning: { color: 'rgba(255, 220, 100,', alpha: 0.12 },
  day: { color: 'rgba(0, 0, 0,', alpha: 0 },
  evening: { color: 'rgba(255, 140, 50,', alpha: 0.2 },
  night: { color: 'rgba(13, 27, 42,', alpha: 0.65 },
}

const TRANSITION_SPEED = 0.02

export class DayNightCycle {
  /** Current time of day */
  timeOfDay: TimeOfDay = 'day'

  /** Current overlay alpha (smoothly animated) */
  overlayAlpha = 0

  /** Target overlay alpha */
  private targetAlpha = 0

  /** Current overlay color (the rgba prefix without the alpha) */
  overlayColor = 'rgba(0, 0, 0,'

  /** Target overlay color */
  private targetColor = 'rgba(0, 0, 0,'

  /** Current blended color components for smooth color transition */
  private currentR = 0
  private currentG = 0
  private currentB = 0
  private targetR = 0
  private targetG = 0
  private targetB = 0

  constructor(initialTime: TimeOfDay = 'day') {
    this.setTime(initialTime)
    // Snap immediately on construction
    this.overlayAlpha = this.targetAlpha
    this.currentR = this.targetR
    this.currentG = this.targetG
    this.currentB = this.targetB
  }

  /**
   * Set the time of day. The overlay will smoothly transition to the new lighting.
   */
  setTime(time: TimeOfDay): void {
    this.timeOfDay = time
    const config = TIME_CONFIGS[time]
    this.targetAlpha = config.alpha
    this.targetColor = config.color

    // Parse target color components
    const match = config.color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),/)
    if (match) {
      this.targetR = parseInt(match[1], 10)
      this.targetG = parseInt(match[2], 10)
      this.targetB = parseInt(match[3], 10)
    }
  }

  /**
   * Snap immediately to the current time's lighting (no transition).
   */
  snap(): void {
    this.overlayAlpha = this.targetAlpha
    this.currentR = this.targetR
    this.currentG = this.targetG
    this.currentB = this.targetB
  }

  /**
   * Update the overlay transition. Call once per frame.
   */
  update(): void {
    // Lerp alpha towards target
    this.overlayAlpha = lerp(this.overlayAlpha, this.targetAlpha, TRANSITION_SPEED)

    // Lerp color components
    this.currentR = lerp(this.currentR, this.targetR, TRANSITION_SPEED)
    this.currentG = lerp(this.currentG, this.targetG, TRANSITION_SPEED)
    this.currentB = lerp(this.currentB, this.targetB, TRANSITION_SPEED)

    // Snap when very close to target to avoid float drift
    if (Math.abs(this.overlayAlpha - this.targetAlpha) < 0.001) {
      this.overlayAlpha = this.targetAlpha
    }
  }

  /**
   * Draw the full-screen time-of-day overlay on the canvas.
   */
  draw(ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number): void {
    if (this.overlayAlpha <= 0.001) return

    ctx.save()

    const r = Math.round(this.currentR)
    const g = Math.round(this.currentG)
    const b = Math.round(this.currentB)

    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${this.overlayAlpha})`
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    // Night: add subtle star effect
    if (this.timeOfDay === 'night' && this.overlayAlpha > 0.3) {
      this.drawStars(ctx, canvasWidth, canvasHeight)
    }

    // Morning: add subtle warm glow on the right side (sunrise)
    if (this.timeOfDay === 'morning' && this.overlayAlpha > 0.05) {
      this.drawSunriseGlow(ctx, canvasWidth, canvasHeight)
    }

    ctx.restore()
  }

  /**
   * Draw subtle star twinkle during night.
   */
  private drawStars(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    // Use a seeded random so stars don't jump every frame
    const time = Math.floor(Date.now() / 500) // changes every 500ms
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed * 127.1 + seed * 311.7) * 43758.5453
      return x - Math.floor(x)
    }

    ctx.fillStyle = 'rgba(255, 255, 220, 0.6)'
    for (let i = 0; i < 30; i++) {
      const sx = pseudoRandom(i * 7 + 1) * w
      const sy = pseudoRandom(i * 13 + 3) * (h * 0.5) // stars only in top half
      const twinkle = Math.sin(time * 0.1 + i) * 0.5 + 0.5

      if (twinkle > 0.3) {
        const starSize = 1 + pseudoRandom(i * 31) * 2
        ctx.globalAlpha = twinkle * 0.8
        ctx.fillRect(sx, sy, starSize, starSize)
      }
    }
    ctx.globalAlpha = 1
  }

  /**
   * Draw a warm glow gradient on the right side during morning.
   */
  private drawSunriseGlow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const gradient = ctx.createLinearGradient(w * 0.7, 0, w, h * 0.6)
    gradient.addColorStop(0, 'rgba(255, 200, 100, 0)')
    gradient.addColorStop(1, `rgba(255, 200, 100, ${this.overlayAlpha * 0.5})`)

    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  }

  /**
   * Get the current time of day.
   */
  getTime(): TimeOfDay {
    return this.timeOfDay
  }

  /**
   * Check if it's currently dark (for gameplay logic like visibility).
   */
  isDark(): boolean {
    return this.timeOfDay === 'night' || this.timeOfDay === 'evening'
  }
}
