// ── SpriteSheet Manager ──
// Loads and manages sprite sheets for the pixel-art game engine.
// For hackathon: includes programmatic placeholder sprites.

import { CHAR_SIZE, CHAR_SCALE, COLORS } from '../utils/constants'

export class SpriteSheet {
  private image: HTMLImageElement | null = null
  private loaded = false
  public src = ''

  /** Load a sprite sheet image from a URL */
  async load(src: string): Promise<void> {
    this.src = src
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        this.image = img
        this.loaded = true
        resolve()
      }
      img.onerror = () => {
        console.warn(`[SpriteSheet] Failed to load: ${src}, using placeholder`)
        this.loaded = false
        resolve() // resolve anyway — we'll use placeholders
      }
      img.src = src
    })
  }

  /** Check if the sprite sheet image is loaded */
  isLoaded(): boolean {
    return this.loaded && this.image !== null
  }

  /** Get the raw image element */
  getImage(): HTMLImageElement | null {
    return this.image
  }

  /**
   * Draw a frame from the sprite sheet.
   * frameX/frameY: source position in the sheet (px).
   * frameW/frameH: source frame size (px).
   * destX/destY: destination position on canvas (px).
   * destW/destH: destination draw size (px).
   */
  drawFrame(
    ctx: CanvasRenderingContext2D,
    frameX: number,
    frameY: number,
    frameW: number,
    frameH: number,
    destX: number,
    destY: number,
    destW: number,
    destH: number,
  ): void {
    if (this.loaded && this.image) {
      ctx.drawImage(this.image, frameX, frameY, frameW, frameH, destX, destY, destW, destH)
    }
  }

  /**
   * Draw a programmatic placeholder character sprite.
   * Used during hackathon before real assets exist.
   * Renders a colored rectangle with a simple pixel face and direction indicator.
   */
  static drawPlaceholderCharacter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    direction: 'up' | 'down' | 'left' | 'right',
    animFrame: number,
    alive: boolean,
  ): void {
    const size = CHAR_SIZE * CHAR_SCALE // 64
    const halfSize = size / 2

    ctx.save()

    // Body: colored rectangle
    ctx.fillStyle = alive ? color : '#555555'
    ctx.fillRect(x, y, size, size)

    // Darker border
    ctx.strokeStyle = alive ? darkenColor(color, 0.3) : '#333333'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)

    if (!alive) {
      // Dead: draw X eyes
      ctx.fillStyle = '#AA0000'
      const eyeSize = 8
      const eyeY = y + 16
      // Left X
      drawX(ctx, x + 14, eyeY, eyeSize)
      // Right X
      drawX(ctx, x + 42, eyeY, eyeSize)
      ctx.restore()
      return
    }

    // Face — eyes
    const eyeSize = 6
    const eyeOffsetY = 18
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(x + 14, y + eyeOffsetY, eyeSize + 4, eyeSize + 2)
    ctx.fillRect(x + 40, y + eyeOffsetY, eyeSize + 4, eyeSize + 2)

    // Pupils (shift based on direction)
    let pupilDx = 0
    let pupilDy = 0
    if (direction === 'left') pupilDx = -2
    if (direction === 'right') pupilDx = 2
    if (direction === 'up') pupilDy = -2
    if (direction === 'down') pupilDy = 2

    ctx.fillStyle = '#111111'
    ctx.fillRect(x + 16 + pupilDx, y + eyeOffsetY + 1 + pupilDy, 4, 4)
    ctx.fillRect(x + 42 + pupilDx, y + eyeOffsetY + 1 + pupilDy, 4, 4)

    // Mouth — simple line
    ctx.fillStyle = '#111111'
    ctx.fillRect(x + 22, y + 38, 20, 3)

    // Direction indicator (small triangle/arrow)
    ctx.fillStyle = COLORS.TEXT_GOLD
    const arrowSize = 6
    switch (direction) {
      case 'up':
        drawTriangle(ctx, x + halfSize, y - arrowSize - 2, arrowSize, 'up')
        break
      case 'down':
        drawTriangle(ctx, x + halfSize, y + size + 2, arrowSize, 'down')
        break
      case 'left':
        drawTriangle(ctx, x - arrowSize - 2, y + halfSize, arrowSize, 'left')
        break
      case 'right':
        drawTriangle(ctx, x + size + 2, y + halfSize, arrowSize, 'right')
        break
    }

    // Walking animation: small "bounce" indicator
    if (animFrame % 2 === 1) {
      ctx.fillStyle = darkenColor(color, 0.15)
      ctx.fillRect(x + 4, y + size - 8, size - 8, 4)
    }

    ctx.restore()
  }

  /**
   * Draw a programmatic placeholder building.
   */
  static drawPlaceholderBuilding(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    buildingColor: string,
  ): void {
    ctx.save()

    // Building body
    ctx.fillStyle = buildingColor
    ctx.fillRect(x, y, w, h)

    // Darker border
    ctx.strokeStyle = darkenColor(buildingColor, 0.4)
    ctx.lineWidth = 3
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)

    // Roof line
    ctx.fillStyle = darkenColor(buildingColor, 0.5)
    ctx.fillRect(x, y, w, 8)

    // Door
    const doorW = Math.min(24, w / 3)
    const doorH = Math.min(32, h / 3)
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(x + w / 2 - doorW / 2, y + h - doorH, doorW, doorH)

    // Label
    ctx.fillStyle = COLORS.TEXT_LIGHT
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'
    ctx.fillText(label, x + w / 2, y - 4)

    ctx.restore()
  }
}

// ── Helper drawing functions ──

function drawTriangle(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  size: number,
  dir: 'up' | 'down' | 'left' | 'right',
): void {
  ctx.beginPath()
  switch (dir) {
    case 'up':
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX - size, tipY + size)
      ctx.lineTo(tipX + size, tipY + size)
      break
    case 'down':
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX - size, tipY - size)
      ctx.lineTo(tipX + size, tipY - size)
      break
    case 'left':
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX + size, tipY - size)
      ctx.lineTo(tipX + size, tipY + size)
      break
    case 'right':
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX - size, tipY - size)
      ctx.lineTo(tipX - size, tipY + size)
      break
  }
  ctx.closePath()
  ctx.fill()
}

function drawX(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number): void {
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(cx - size / 2, cy - size / 2)
  ctx.lineTo(cx + size / 2, cy + size / 2)
  ctx.moveTo(cx + size / 2, cy - size / 2)
  ctx.lineTo(cx - size / 2, cy + size / 2)
  ctx.stroke()
}

function darkenColor(hex: string, amount: number): string {
  const r = Math.max(0, Math.floor(parseInt(hex.slice(1, 3), 16) * (1 - amount)))
  const g = Math.max(0, Math.floor(parseInt(hex.slice(3, 5), 16) * (1 - amount)))
  const b = Math.max(0, Math.floor(parseInt(hex.slice(5, 7), 16) * (1 - amount)))
  return `rgb(${r},${g},${b})`
}

// ── Sprite Manager Singleton ──
// Holds a map of named sprite sheets for easy access across the engine.

class SpriteManager {
  private sheets: Map<string, SpriteSheet> = new Map()

  /** Load and register a sprite sheet by name */
  async load(name: string, src: string): Promise<SpriteSheet> {
    const sheet = new SpriteSheet()
    await sheet.load(src)
    this.sheets.set(name, sheet)
    return sheet
  }

  /** Get a registered sprite sheet by name */
  get(name: string): SpriteSheet | undefined {
    return this.sheets.get(name)
  }

  /** Check if a sheet is registered */
  has(name: string): boolean {
    return this.sheets.has(name)
  }

  /** Register an already-created sheet */
  register(name: string, sheet: SpriteSheet): void {
    this.sheets.set(name, sheet)
  }
}

export const spriteManager = new SpriteManager()
