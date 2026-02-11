// ── GameOverScene ──
// All characters lined up in a row. Winner side has golden frame.
// One by one, cards flip to reveal: name + role + type (et_can / yanki_dogmus).
// Big title at top: winner announcement.

import type { Scene } from './SceneManager'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import { COLORS, CHAR_SIZE, CHAR_SCALE } from '../utils/constants'
import { rgba, getPlayerColor, clamp, lerp } from '../utils/helpers'
import type { Player, GameOverData } from '../state/types'

const CHAR_SCALED = CHAR_SIZE * CHAR_SCALE
const REVEAL_INTERVAL = 1.2 // seconds between each character reveal
const CARD_WIDTH = 100
const CARD_HEIGHT = 150
const CARD_PADDING = 16

// ── Revealed player card data ──
interface CardData {
  name: string
  roleTitle: string
  playerType: 'et_can' | 'yanki_dogmus'
  color: string
  alive: boolean
}

export class GameOverScene implements Scene {
  private time = 0

  // Reveal system
  revealIndex = 0 // which character is currently being revealed
  revealTimer = 0 // timer counting toward next reveal

  // Game over data
  private winner: 'et_can' | 'yanki_dogmus' = 'et_can'
  private cards: CardData[] = []
  private allRevealed = false

  // Background particles (celebratory / somber)
  private particles: { x: number; y: number; vx: number; vy: number; life: number; color: string; radius: number }[] = []

  enter(): void {
    this.time = 0
    this.revealIndex = 0
    this.revealTimer = 0
    this.allRevealed = false
    this.particles = []

    // Get game over data from store
    const state = useGameStore.getState()
    const gameOver = state.gameOver

    if (gameOver) {
      this.winner = gameOver.winner
      this.cards = gameOver.players.map((p, idx) => ({
        name: p.name,
        roleTitle: p.role_title,
        playerType: p.player_type,
        color: p.color ?? getPlayerColor(idx),
        alive: p.alive,
      }))
    } else {
      // Fallback: use current player list
      this.winner = 'et_can'
      this.cards = state.players.map((p, idx) => ({
        name: p.name,
        roleTitle: p.role_title || '?',
        playerType: p.player_type ?? 'et_can',
        color: p.color ?? getPlayerColor(idx),
        alive: p.alive,
      }))
    }

    // Initial delay before first reveal
    this.revealTimer = -1.5
  }

  exit(): void {
    this.cards = []
    this.particles = []
  }

  update(dt: number): void {
    this.time += dt

    // ── Sequential reveal timer ──
    if (!this.allRevealed && this.cards.length > 0) {
      this.revealTimer += dt
      if (this.revealTimer >= REVEAL_INTERVAL) {
        this.revealTimer = 0
        this.revealIndex++

        if (this.revealIndex >= this.cards.length) {
          this.allRevealed = true
          // Burst of celebration particles
          this.spawnCelebration()
        }
      }
    }

    // ── Update particles ──
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 60 * dt // gravity
      p.life -= dt
      if (p.life <= 0) {
        this.particles.splice(i, 1)
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height

    // ── Background ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    // ── Subtle radial glow at center ──
    const bgGlow = ctx.createRadialGradient(w / 2, h / 2, 50, w / 2, h / 2, w * 0.6)
    const glowColor = this.winner === 'et_can' ? COLORS.TEXT_GOLD : COLORS.ACCENT_RED
    bgGlow.addColorStop(0, rgba(glowColor, 0.06))
    bgGlow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = bgGlow
    ctx.fillRect(0, 0, w, h)

    // ── Winner announcement title ──
    ctx.save()
    const winnerText = this.winner === 'et_can'
      ? 'ET CANLAR KAZANDI!'
      : 'YANKI DOGMUSLAR KAZANDI!'
    const titleColor = this.winner === 'et_can' ? COLORS.TEXT_GOLD : COLORS.ACCENT_RED

    // Pulsing effect
    const pulseScale = 1 + Math.sin(this.time * 2) * 0.03

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Shadow
    ctx.fillStyle = rgba('#000000', 0.5)
    ctx.font = `bold ${Math.floor(36 * pulseScale)}px monospace`
    ctx.fillText(winnerText, w / 2 + 2, 52)

    // Title
    ctx.fillStyle = titleColor
    ctx.fillText(winnerText, w / 2, 50)

    // Subtitle
    ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, 0.5)
    ctx.font = '14px monospace'
    ctx.fillText('OYUN SONU', w / 2, 85)
    ctx.restore()

    // ── Character cards ──
    const totalCards = this.cards.length
    if (totalCards === 0) return

    const totalWidth = totalCards * (CARD_WIDTH + CARD_PADDING) - CARD_PADDING
    const startX = (w - totalWidth) / 2
    const cardY = h * 0.25

    for (let i = 0; i < totalCards; i++) {
      const card = this.cards[i]
      const cx = startX + i * (CARD_WIDTH + CARD_PADDING)
      const isRevealed = i < this.revealIndex

      // ── Card background ──
      if (isRevealed) {
        // Revealed card
        const isWinner = (card.playerType === this.winner)

        // Golden or dark border based on winning side
        if (isWinner) {
          // Golden frame
          ctx.save()
          ctx.shadowColor = rgba(COLORS.TEXT_GOLD, 0.4)
          ctx.shadowBlur = 12
          ctx.strokeStyle = COLORS.TEXT_GOLD
          ctx.lineWidth = 3
          ctx.strokeRect(cx - 3, cardY - 3, CARD_WIDTH + 6, CARD_HEIGHT + 6)
          ctx.restore()
        }

        // Card body
        ctx.fillStyle = isWinner
          ? rgba(COLORS.TEXT_GOLD, 0.08)
          : rgba('#222222', 0.8)
        ctx.fillRect(cx, cardY, CARD_WIDTH, CARD_HEIGHT)

        // Border
        ctx.strokeStyle = isWinner ? COLORS.TEXT_GOLD : '#444444'
        ctx.lineWidth = 2
        ctx.strokeRect(cx, cardY, CARD_WIDTH, CARD_HEIGHT)

        // ── Character sprite (small) ──
        const spriteScale = 1.2
        const spriteSize = CHAR_SIZE * CHAR_SCALE * spriteScale
        const spriteX = cx + (CARD_WIDTH - spriteSize) / 2
        const spriteY = cardY + 8

        ctx.save()
        ctx.translate(spriteX, spriteY)
        ctx.scale(spriteScale, spriteScale)
        SpriteSheet.drawPlaceholderCharacter(ctx, 0, 0, card.color, 'down', 0, card.alive)
        ctx.restore()

        // ── Name ──
        ctx.fillStyle = COLORS.TEXT_LIGHT
        ctx.font = 'bold 11px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillText(card.name, cx + CARD_WIDTH / 2, cardY + 8 + spriteSize + 6)

        // ── Role title ──
        ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, 0.7)
        ctx.font = '10px monospace'
        ctx.fillText(card.roleTitle, cx + CARD_WIDTH / 2, cardY + 8 + spriteSize + 22)

        // ── Type badge ──
        const typeY = cardY + CARD_HEIGHT - 28
        const typeLabel = card.playerType === 'et_can' ? 'Et Can' : 'Yanki'
        const typeColor = card.playerType === 'et_can' ? COLORS.TEXT_GOLD : COLORS.ACCENT_RED

        ctx.fillStyle = rgba(typeColor, 0.2)
        ctx.fillRect(cx + 10, typeY, CARD_WIDTH - 20, 18)
        ctx.strokeStyle = typeColor
        ctx.lineWidth = 1
        ctx.strokeRect(cx + 10, typeY, CARD_WIDTH - 20, 18)

        ctx.fillStyle = typeColor
        ctx.font = 'bold 10px monospace'
        ctx.fillText(typeLabel, cx + CARD_WIDTH / 2, typeY + 3)

        // ── Dead indicator ──
        if (!card.alive) {
          ctx.save()
          ctx.fillStyle = rgba('#000000', 0.4)
          ctx.fillRect(cx, cardY, CARD_WIDTH, CARD_HEIGHT)

          ctx.fillStyle = COLORS.ACCENT_RED
          ctx.font = 'bold 10px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText('SURGUN', cx + CARD_WIDTH / 2, cardY + CARD_HEIGHT - 4)
          ctx.restore()
        }
      } else {
        // ── Unrevealed card (face down) ──
        ctx.fillStyle = '#2A2A3A'
        ctx.fillRect(cx, cardY, CARD_WIDTH, CARD_HEIGHT)

        ctx.strokeStyle = '#444466'
        ctx.lineWidth = 2
        ctx.strokeRect(cx, cardY, CARD_WIDTH, CARD_HEIGHT)

        // Question mark
        ctx.fillStyle = rgba('#666688', 0.6)
        ctx.font = 'bold 36px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('?', cx + CARD_WIDTH / 2, cardY + CARD_HEIGHT / 2)

        // Card back pattern (diagonal lines)
        ctx.save()
        ctx.strokeStyle = rgba('#444466', 0.3)
        ctx.lineWidth = 1
        for (let d = -CARD_HEIGHT; d < CARD_WIDTH + CARD_HEIGHT; d += 12) {
          ctx.beginPath()
          ctx.moveTo(cx + d, cardY)
          ctx.lineTo(cx + d - CARD_HEIGHT, cardY + CARD_HEIGHT)
          ctx.stroke()
        }
        ctx.restore()

        // Currently revealing animation (if this is the next card)
        if (i === this.revealIndex && this.revealTimer >= 0) {
          const flipProgress = clamp(this.revealTimer / REVEAL_INTERVAL, 0, 1)
          if (flipProgress > 0.5) {
            // Highlight glow approaching
            ctx.save()
            ctx.strokeStyle = rgba(COLORS.TEXT_GOLD, (flipProgress - 0.5) * 2)
            ctx.lineWidth = 2
            ctx.strokeRect(cx - 2, cardY - 2, CARD_WIDTH + 4, CARD_HEIGHT + 4)
            ctx.restore()
          }
        }
      }
    }

    // ── Celebration particles ──
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / 2)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── "Devam etmek icin bekleyin" after all revealed ──
    if (this.allRevealed) {
      ctx.save()
      const alpha = 0.4 + Math.sin(this.time * 2) * 0.3
      ctx.fillStyle = rgba(COLORS.TEXT_LIGHT, alpha)
      ctx.font = '14px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText('Lobiye donuluyor...', w / 2, h - 30)
      ctx.restore()
    }
  }

  // ── Private helpers ──

  private spawnCelebration(): void {
    const w = typeof document !== 'undefined' ? (document.querySelector('canvas')?.width ?? 800) : 800
    const h = typeof document !== 'undefined' ? (document.querySelector('canvas')?.height ?? 600) : 600

    const celebColors = this.winner === 'et_can'
      ? [COLORS.TEXT_GOLD, COLORS.FIRE_YELLOW, COLORS.FIRE_ORANGE, '#FFFFFF']
      : [COLORS.ACCENT_RED, COLORS.FIRE_RED, '#FF6644', '#FFAAAA']

    for (let i = 0; i < 60; i++) {
      this.particles.push({
        x: w / 2 + (Math.random() - 0.5) * w * 0.6,
        y: h * 0.5 + (Math.random() - 0.5) * h * 0.3,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200 - 80,
        life: 1.5 + Math.random() * 2,
        color: celebColors[Math.floor(Math.random() * celebColors.length)],
        radius: 2 + Math.random() * 4,
      })
    }
  }
}
