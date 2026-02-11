// ── HouseScene ──
// Interior view for house visits. Host on the left, visitor on the right.
// Characters drawn at 3x normal size with warm interior lighting.
// Conversation text and turn logic handled by React UI overlay.

import type { Scene } from './SceneManager'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import { COLORS, CHAR_SIZE, CHAR_SCALE, SCALED_TILE } from '../utils/constants'
import { rgba, getPlayerColor } from '../utils/helpers'

const PORTRAIT_SCALE = 3 // Characters drawn 3x normal size
const PORTRAIT_SIZE = CHAR_SIZE * CHAR_SCALE * PORTRAIT_SCALE // 64 * 3 = 192

// Room tile colors
const FLOOR_COLOR = '#6B4226' // warm wood floor
const WALL_COLOR = '#5A5A5A' // stone wall
const WALL_TOP_COLOR = '#484848'

export class HouseScene implements Scene {
  private time = 0
  private hostColor: string = COLORS.TEXT_LIGHT
  private visitorColor: string = COLORS.TEXT_LIGHT
  private hostName = ''
  private visitorName = ''

  enter(): void {
    this.time = 0

    // Get house visit data from the store
    const state = useGameStore.getState()
    const visit = state.houseVisits[0] ?? null
    const players = state.players

    if (visit) {
      const hostPlayer = players.find((p) => p.slot_id === visit.host || p.name === visit.host)
      const visitorPlayer = players.find((p) => p.slot_id === visit.visitor || p.name === visit.visitor)

      this.hostName = hostPlayer?.name ?? visit.host
      this.visitorName = visitorPlayer?.name ?? visit.visitor

      const hostIdx = hostPlayer ? players.indexOf(hostPlayer) : 0
      const visitorIdx = visitorPlayer ? players.indexOf(visitorPlayer) : 1
      this.hostColor = hostPlayer?.color ?? getPlayerColor(hostIdx)
      this.visitorColor = visitorPlayer?.color ?? getPlayerColor(visitorIdx)
    }
  }

  exit(): void {
    // cleanup
  }

  update(dt: number): void {
    this.time += dt
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // ── Room background ──
    // Wall (top portion)
    ctx.fillStyle = WALL_COLOR
    ctx.fillRect(0, 0, w, h * 0.45)

    // Wall top accent
    ctx.fillStyle = WALL_TOP_COLOR
    ctx.fillRect(0, 0, w, 20)

    // Wall decorative line
    ctx.fillStyle = rgba(COLORS.TEXT_GOLD, 0.15)
    ctx.fillRect(0, h * 0.45 - 4, w, 4)

    // Floor (bottom portion)
    ctx.fillStyle = FLOOR_COLOR
    ctx.fillRect(0, h * 0.45, w, h * 0.55)

    // Draw floor planks
    ctx.strokeStyle = rgba('#000000', 0.1)
    ctx.lineWidth = 1
    const plankWidth = 80
    for (let px = 0; px < w; px += plankWidth) {
      ctx.beginPath()
      ctx.moveTo(px, h * 0.45)
      ctx.lineTo(px, h)
      ctx.stroke()
    }

    // ── Window on back wall (decorative) ──
    const windowX = w / 2 - 40
    const windowY = h * 0.08
    ctx.fillStyle = rgba(COLORS.NIGHT_BLUE, 0.6)
    ctx.fillRect(windowX, windowY, 80, 60)
    ctx.strokeStyle = COLORS.DARK_WOOD
    ctx.lineWidth = 4
    ctx.strokeRect(windowX, windowY, 80, 60)
    // Window cross
    ctx.beginPath()
    ctx.moveTo(windowX + 40, windowY)
    ctx.lineTo(windowX + 40, windowY + 60)
    ctx.moveTo(windowX, windowY + 30)
    ctx.lineTo(windowX + 80, windowY + 30)
    ctx.stroke()

    // ── Table between characters ──
    const tableX = w / 2 - 60
    const tableY = h * 0.55
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(tableX, tableY, 120, 50)
    ctx.strokeStyle = rgba('#000000', 0.3)
    ctx.lineWidth = 2
    ctx.strokeRect(tableX, tableY, 120, 50)

    // Candle on table
    ctx.fillStyle = '#EEEECC'
    ctx.fillRect(w / 2 - 4, tableY - 16, 8, 16)
    // Candle flame
    const flameAlpha = 0.8 + Math.sin(this.time * 6) * 0.2
    ctx.fillStyle = rgba(COLORS.FIRE_YELLOW, flameAlpha)
    ctx.beginPath()
    ctx.arc(w / 2, tableY - 20, 5, 0, Math.PI * 2)
    ctx.fill()

    // ── Candle glow ──
    const candleGlow = ctx.createRadialGradient(w / 2, tableY - 20, 3, w / 2, tableY - 20, 120)
    candleGlow.addColorStop(0, rgba(COLORS.FIRE_YELLOW, 0.15))
    candleGlow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = candleGlow
    ctx.fillRect(w / 2 - 120, tableY - 140, 240, 240)

    // ── Host character (left side, facing right) ──
    const hostX = w * 0.15
    const hostY = h * 0.35

    this.drawLargeCharacter(ctx, hostX, hostY, this.hostColor, 'right')

    // Host name tag
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.hostName, hostX + PORTRAIT_SIZE / 2, hostY + PORTRAIT_SIZE + 10)

    // "Ev Sahibi" label
    ctx.fillStyle = COLORS.TEXT_LIGHT
    ctx.font = '12px monospace'
    ctx.fillText('Ev Sahibi', hostX + PORTRAIT_SIZE / 2, hostY + PORTRAIT_SIZE + 30)

    // ── Visitor character (right side, facing left) ──
    const visitorX = w * 0.65
    const visitorY = h * 0.35

    this.drawLargeCharacter(ctx, visitorX, visitorY, this.visitorColor, 'left')

    // Visitor name tag
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 16px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(this.visitorName, visitorX + PORTRAIT_SIZE / 2, visitorY + PORTRAIT_SIZE + 10)

    // "Ziyaretci" label
    ctx.fillStyle = COLORS.TEXT_LIGHT
    ctx.font = '12px monospace'
    ctx.fillText('Ziyaretci', visitorX + PORTRAIT_SIZE / 2, visitorY + PORTRAIT_SIZE + 30)

    // ── Warm interior lighting overlay ──
    ctx.save()
    ctx.fillStyle = rgba(COLORS.FIRE_ORANGE, 0.04 + Math.sin(this.time * 1.2) * 0.01)
    ctx.fillRect(0, 0, w, h)
    ctx.restore()

    // ── Vignette edges ──
    this.drawVignette(ctx, w, h)
  }

  // ── Private helpers ──

  /** Draw a character at 3x scale using the placeholder sprite system */
  private drawLargeCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    direction: 'up' | 'down' | 'left' | 'right',
  ): void {
    // Scale up via canvas transform
    ctx.save()
    ctx.translate(x, y)
    ctx.scale(PORTRAIT_SCALE, PORTRAIT_SCALE)

    const baseSize = CHAR_SIZE * CHAR_SCALE
    SpriteSheet.drawPlaceholderCharacter(
      ctx,
      0,
      0,
      color,
      direction,
      0, // static pose
      true,
    )

    ctx.restore()
  }

  /** Draw a subtle vignette (dark edges) */
  private drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, w * 0.3, w / 2, h / 2, w * 0.8)
    gradient.addColorStop(0, 'rgba(0,0,0,0)')
    gradient.addColorStop(1, rgba('#000000', 0.3))
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, w, h)
  }
}
