// ── VoteScene ──
// Characters arranged in a full circle (bird's eye perspective).
// Clickable characters for vote selection with visual feedback.
// Golden glow on selected target, red aura on "kamu baskisi" targets.
// Vote bars appear as votes come in.

import type { Scene } from './SceneManager'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import {
  COLORS, CHAR_SIZE, CHAR_SCALE, SCALED_TILE, BUILDING_POSITIONS, BUILDING,
} from '../utils/constants'
import { rgba, getPlayerColor, distance } from '../utils/helpers'
import type { Player } from '../state/types'

const CHAR_SCALED = CHAR_SIZE * CHAR_SCALE
const CIRCLE_RADIUS_RATIO = 0.3 // fraction of the smaller canvas dimension
const CLICK_THRESHOLD = CHAR_SCALED * 1.2 // click detection radius around a character

export class VoteScene implements Scene {
  private time = 0

  // Character positions in screen space
  private positions: { slotId: string; x: number; y: number }[] = []

  // Currently selected vote target
  selectedTarget: string | null = null

  // Input handlers
  private clickHandler: ((e: MouseEvent) => void) | null = null

  // Canvas dimensions (cached for click detection)
  private canvasWidth = 800
  private canvasHeight = 600

  enter(): void {
    this.time = 0
    this.selectedTarget = null
    this.positions = []

    // Bind click handler
    this.bindInput()

    // Calculate positions (will recalculate in draw if canvas size changes)
    this.recalcPositions()
  }

  exit(): void {
    this.unbindInput()
    this.positions = []
  }

  update(dt: number): void {
    this.time += dt
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // Recalculate positions if canvas size changed
    if (w !== this.canvasWidth || h !== this.canvasHeight) {
      this.canvasWidth = w
      this.canvasHeight = h
      this.recalcPositions()
    }

    const centerX = w / 2
    const centerY = h / 2

    // ── Dark background ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    // ── Subtle campfire glow in center ──
    const glowR = 80 + Math.sin(this.time * 2) * 10
    const glow = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, glowR)
    glow.addColorStop(0, rgba(COLORS.FIRE_ORANGE, 0.2))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(centerX - glowR, centerY - glowR, glowR * 2, glowR * 2)

    // ── Circle ring (decorative) ──
    const radius = Math.min(w, h) * CIRCLE_RADIUS_RATIO
    ctx.save()
    ctx.strokeStyle = rgba(COLORS.EARTH, 0.2)
    ctx.lineWidth = 2
    ctx.setLineDash([8, 8])
    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // ── Draw characters ──
    const state = useGameStore.getState()
    const players = state.players
    const votes = state.votes
    const baskiTarget = state.baskiTarget

    for (const pos of this.positions) {
      const player = players.find((p) => p.slot_id === pos.slotId)
      if (!player) continue

      const idx = players.indexOf(player)
      const color = player.color ?? getPlayerColor(idx)
      const isSelected = this.selectedTarget === pos.slotId
      const hasBaskiAura = baskiTarget === pos.slotId

      // ── "Kamu baskisi" red aura ──
      if (hasBaskiAura) {
        ctx.save()
        const auraR = CHAR_SCALED * 0.8
        const aura = ctx.createRadialGradient(
          pos.x + CHAR_SCALED / 2, pos.y + CHAR_SCALED / 2, CHAR_SCALED * 0.3,
          pos.x + CHAR_SCALED / 2, pos.y + CHAR_SCALED / 2, auraR,
        )
        aura.addColorStop(0, rgba(COLORS.ACCENT_RED, 0.3 + Math.sin(this.time * 3) * 0.1))
        aura.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = aura
        ctx.fillRect(pos.x - auraR, pos.y - auraR, CHAR_SCALED + auraR * 2, CHAR_SCALED + auraR * 2)
        ctx.restore()
      }

      // ── Selection golden glow ──
      if (isSelected) {
        ctx.save()
        const selR = CHAR_SCALED * 0.9
        const selGlow = ctx.createRadialGradient(
          pos.x + CHAR_SCALED / 2, pos.y + CHAR_SCALED / 2, CHAR_SCALED * 0.2,
          pos.x + CHAR_SCALED / 2, pos.y + CHAR_SCALED / 2, selR,
        )
        selGlow.addColorStop(0, rgba(COLORS.TEXT_GOLD, 0.4 + Math.sin(this.time * 4) * 0.15))
        selGlow.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = selGlow
        ctx.fillRect(pos.x - selR, pos.y - selR, CHAR_SCALED + selR * 2, CHAR_SCALED + selR * 2)

        // Golden border
        ctx.strokeStyle = rgba(COLORS.TEXT_GOLD, 0.7)
        ctx.lineWidth = 3
        ctx.strokeRect(pos.x - 4, pos.y - 4, CHAR_SCALED + 8, CHAR_SCALED + 8)
        ctx.restore()
      }

      // ── Character sprite ──
      // Direction: face center
      const dx = centerX - (pos.x + CHAR_SCALED / 2)
      const dy = centerY - (pos.y + CHAR_SCALED / 2)
      const dir: 'up' | 'down' | 'left' | 'right' =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? 'right' : 'left'
          : dy > 0 ? 'down' : 'up'

      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        pos.x,
        pos.y,
        color,
        dir,
        0,
        player.alive,
      )

      // ── Name tag ──
      ctx.save()
      ctx.fillStyle = isSelected ? COLORS.TEXT_GOLD : COLORS.TEXT_LIGHT
      ctx.font = isSelected ? 'bold 12px monospace' : '11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(player.name, pos.x + CHAR_SCALED / 2, pos.y + CHAR_SCALED + 6)
      ctx.restore()

      // ── Vote bar (votes received) ──
      const votesForThis = Object.values(votes).filter((v) => v === pos.slotId).length
      if (votesForThis > 0) {
        const barWidth = Math.min(votesForThis * 16, CHAR_SCALED)
        const barX = pos.x + (CHAR_SCALED - barWidth) / 2
        const barY = pos.y + CHAR_SCALED + 22

        // Bar background
        ctx.fillStyle = rgba('#000000', 0.5)
        ctx.fillRect(barX - 1, barY - 1, barWidth + 2, 10)

        // Bar fill
        ctx.fillStyle = COLORS.ACCENT_RED
        ctx.fillRect(barX, barY, barWidth, 8)

        // Vote count text
        ctx.fillStyle = COLORS.TEXT_LIGHT
        ctx.font = 'bold 10px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(`${votesForThis}`, pos.x + CHAR_SCALED / 2, barY + 10)
      }
    }

    // ── Title ──
    ctx.save()
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 28px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText('OYLAMA', centerX, 20)

    // Instruction
    ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, 0.6 + Math.sin(this.time * 2) * 0.2)
    ctx.font = '14px monospace'
    ctx.fillText('Sürgün etmek istedigin kisiye tikla', centerX, 56)
    ctx.restore()
  }

  /**
   * Determine which character was clicked given world coordinates.
   * Called internally from the click handler.
   */
  handleClick(screenX: number, screenY: number): void {
    const state = useGameStore.getState()
    const myName = state.myName

    for (const pos of this.positions) {
      const player = state.players.find((p) => p.slot_id === pos.slotId)
      if (!player || !player.alive) continue
      // Don't let player vote for themselves
      if (player.name === myName) continue

      const charCX = pos.x + CHAR_SCALED / 2
      const charCY = pos.y + CHAR_SCALED / 2
      const dist = distance(screenX, screenY, charCX, charCY)

      if (dist < CLICK_THRESHOLD) {
        this.selectedTarget = pos.slotId
        return
      }
    }
  }

  // ── Private helpers ──

  private recalcPositions(): void {
    const players = useGameStore.getState().players
    const alivePlayers = players.filter((p) => p.alive)
    const count = alivePlayers.length

    const centerX = this.canvasWidth / 2
    const centerY = this.canvasHeight / 2
    const radius = Math.min(this.canvasWidth, this.canvasHeight) * CIRCLE_RADIUS_RATIO

    this.positions = []

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count - Math.PI / 2 // start from top
      this.positions.push({
        slotId: alivePlayers[i].slot_id,
        x: centerX + Math.cos(angle) * radius - CHAR_SCALED / 2,
        y: centerY + Math.sin(angle) * radius - CHAR_SCALED / 2,
      })
    }
  }

  private bindInput(): void {
    this.clickHandler = (e: MouseEvent) => {
      const canvas = e.target as HTMLCanvasElement
      if (!canvas || canvas.tagName !== 'CANVAS') return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      this.handleClick(sx, sy)
    }
    window.addEventListener('click', this.clickHandler)
  }

  private unbindInput(): void {
    if (this.clickHandler) {
      window.removeEventListener('click', this.clickHandler)
    }
    this.clickHandler = null
  }
}
