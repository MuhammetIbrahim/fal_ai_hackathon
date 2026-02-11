// ── FreeRoamScene ──
// Full settlement map visible with player-controlled character (WASD / click-to-move).
// AI characters wander. Camera follows the player. Buildings highlight on proximity.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import {
  COLORS, SCALED_TILE, BUILDING_POSITIONS, BUILDING,
  CHAR_SIZE, CHAR_SCALE, CHAR_SPEED, MAP_COLS, MAP_ROWS,
} from '../utils/constants'
import { rgba, randFloat, randInt, tileToPixel, distance, clamp, getPlayerColor } from '../utils/helpers'
import type { Player } from '../state/types'

// ── NPC wandering state ──
interface NPCState {
  slotId: string
  x: number
  y: number
  targetX: number
  targetY: number
  direction: 'up' | 'down' | 'left' | 'right'
  animFrame: number
  wanderTimer: number
}

// ── Click-to-move target ──
interface MoveTarget {
  x: number
  y: number
}

const CHAR_SCALED = CHAR_SIZE * CHAR_SCALE
const INTERACTION_DISTANCE = SCALED_TILE * 2.5 // px, how close to a building to interact
const NPC_SPEED = 1.2 // slower than player
const WANDER_INTERVAL_MIN = 2 // seconds
const WANDER_INTERVAL_MAX = 6

export class FreeRoamScene implements Scene {
  private camera: Camera
  private time = 0

  // Player character
  private playerX = 0
  private playerY = 0
  private playerDir: 'up' | 'down' | 'left' | 'right' = 'down'
  private playerAnimFrame = 0
  private animTimer = 0
  private moving = false

  // Click-to-move
  private moveTarget: MoveTarget | null = null

  // NPC states
  private npcs: NPCState[] = []

  // Building proximity
  nearBuilding: string | null = null

  // Key states (tracked manually since InputManager may not exist yet)
  private keys: Set<string> = new Set()
  private keyDownHandler: ((e: KeyboardEvent) => void) | null = null
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null
  private clickHandler: ((e: MouseEvent) => void) | null = null

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.nearBuilding = null
    this.moveTarget = null

    // Place player at campfire
    const ocak = BUILDING_POSITIONS[BUILDING.OCAK]
    this.playerX = (ocak.x + ocak.w / 2) * SCALED_TILE
    this.playerY = (ocak.y + ocak.h / 2 + 3) * SCALED_TILE
    this.playerDir = 'down'

    // Camera setup
    this.camera.setScale(1)
    this.camera.follow(this.playerX, this.playerY)
    this.camera.snapToTarget()

    // Initialize NPCs from other players
    this.initNPCs()

    // Bind keyboard/mouse input
    this.bindInput()
  }

  exit(): void {
    this.unbindInput()
    this.npcs = []
  }

  update(dt: number): void {
    this.time += dt

    // ── Player movement from keyboard ──
    const speed = CHAR_SPEED * SCALED_TILE * dt
    let dx = 0
    let dy = 0

    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1

    const hasKeyInput = dx !== 0 || dy !== 0

    if (hasKeyInput) {
      // Keyboard takes priority over click-to-move
      this.moveTarget = null

      // Normalize diagonal
      if (dx !== 0 && dy !== 0) {
        const inv = 1 / Math.SQRT2
        dx *= inv
        dy *= inv
      }

      this.playerX += dx * speed
      this.playerY += dy * speed
      this.moving = true

      // Direction
      if (Math.abs(dx) > Math.abs(dy)) {
        this.playerDir = dx > 0 ? 'right' : 'left'
      } else {
        this.playerDir = dy > 0 ? 'down' : 'up'
      }
    } else if (this.moveTarget) {
      // Click-to-move
      const tdx = this.moveTarget.x - this.playerX
      const tdy = this.moveTarget.y - this.playerY
      const dist = Math.sqrt(tdx * tdx + tdy * tdy)

      if (dist < speed) {
        this.playerX = this.moveTarget.x
        this.playerY = this.moveTarget.y
        this.moveTarget = null
        this.moving = false
      } else {
        const nx = tdx / dist
        const ny = tdy / dist
        this.playerX += nx * speed
        this.playerY += ny * speed
        this.moving = true

        if (Math.abs(nx) > Math.abs(ny)) {
          this.playerDir = nx > 0 ? 'right' : 'left'
        } else {
          this.playerDir = ny > 0 ? 'down' : 'up'
        }
      }
    } else {
      this.moving = false
    }

    // Clamp to world bounds
    this.playerX = clamp(this.playerX, 0, MAP_COLS * SCALED_TILE - CHAR_SCALED)
    this.playerY = clamp(this.playerY, 0, MAP_ROWS * SCALED_TILE - CHAR_SCALED)

    // Animation timer
    if (this.moving) {
      this.animTimer += dt
      if (this.animTimer > 0.15) {
        this.animTimer = 0
        this.playerAnimFrame = (this.playerAnimFrame + 1) % 4
      }
    } else {
      this.playerAnimFrame = 0
      this.animTimer = 0
    }

    // Camera follow
    this.camera.follow(this.playerX + CHAR_SCALED / 2, this.playerY + CHAR_SCALED / 2)
    this.camera.update()

    // ── NPC wander AI ──
    for (const npc of this.npcs) {
      npc.wanderTimer -= dt
      if (npc.wanderTimer <= 0) {
        // Pick new random target within the map
        npc.targetX = randFloat(3 * SCALED_TILE, (MAP_COLS - 3) * SCALED_TILE)
        npc.targetY = randFloat(3 * SCALED_TILE, (MAP_ROWS - 3) * SCALED_TILE)
        npc.wanderTimer = randFloat(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX)
      }

      const ndx = npc.targetX - npc.x
      const ndy = npc.targetY - npc.y
      const ndist = Math.sqrt(ndx * ndx + ndy * ndy)
      const npcSpeed = NPC_SPEED * SCALED_TILE * dt

      if (ndist > npcSpeed) {
        const nx = ndx / ndist
        const ny = ndy / ndist
        npc.x += nx * npcSpeed
        npc.y += ny * npcSpeed

        if (Math.abs(nx) > Math.abs(ny)) {
          npc.direction = nx > 0 ? 'right' : 'left'
        } else {
          npc.direction = ny > 0 ? 'down' : 'up'
        }

        // Animate
        npc.animFrame = Math.floor(this.time * 4) % 4
      }
    }

    // ── Check building proximity ──
    this.nearBuilding = null
    const playerCenterX = this.playerX + CHAR_SCALED / 2
    const playerCenterY = this.playerY + CHAR_SCALED / 2

    for (const [id, b] of Object.entries(BUILDING_POSITIONS)) {
      const bCenterX = (b.x + b.w / 2) * SCALED_TILE
      const bCenterY = (b.y + b.h / 2) * SCALED_TILE
      const dist = distance(playerCenterX, playerCenterY, bCenterX, bCenterY)
      if (dist < INTERACTION_DISTANCE) {
        this.nearBuilding = id
        break
      }
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

    // ── Draw tile map ──
    this.drawTileMap(ctx)

    // ── Draw buildings ──
    this.drawBuildings(ctx)

    // ── Draw NPCs ──
    const players = useGameStore.getState().players
    for (const npc of this.npcs) {
      const player = players.find((p) => p.slot_id === npc.slotId)
      if (!player || !player.alive) continue

      const idx = players.indexOf(player)
      const color = player.color ?? getPlayerColor(idx)

      SpriteSheet.drawPlaceholderCharacter(
        ctx,
        npc.x,
        npc.y,
        color,
        npc.direction,
        npc.animFrame,
        player.alive,
      )

      // Name
      ctx.fillStyle = COLORS.TEXT_LIGHT
      ctx.font = '10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(player.name, npc.x + CHAR_SCALED / 2, npc.y + CHAR_SCALED + 2)
    }

    // ── Draw player character ──
    const myName = useGameStore.getState().myName
    const myPlayer = players.find((p) => p.name === myName)
    const myIdx = myPlayer ? players.indexOf(myPlayer) : 0
    const myColor = myPlayer?.color ?? getPlayerColor(myIdx)

    SpriteSheet.drawPlaceholderCharacter(
      ctx,
      this.playerX,
      this.playerY,
      myColor,
      this.playerDir,
      this.playerAnimFrame,
      true,
    )

    // Player name tag (highlighted)
    ctx.fillStyle = COLORS.TEXT_GOLD
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(myName ?? 'Oyuncu', this.playerX + CHAR_SCALED / 2, this.playerY + CHAR_SCALED + 2)

    // ── Click-to-move indicator ──
    if (this.moveTarget) {
      ctx.save()
      ctx.strokeStyle = rgba(COLORS.TEXT_GOLD, 0.5 + Math.sin(this.time * 4) * 0.3)
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(this.moveTarget.x, this.moveTarget.y, 10, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    ctx.restore()

    // ── Building interaction prompt (screen space) ──
    if (this.nearBuilding) {
      const b = BUILDING_POSITIONS[this.nearBuilding]
      if (b) {
        ctx.save()
        ctx.fillStyle = rgba('#000000', 0.7)
        ctx.fillRect(w / 2 - 120, h - 60, 240, 36)
        ctx.strokeStyle = COLORS.TEXT_GOLD
        ctx.lineWidth = 1
        ctx.strokeRect(w / 2 - 120, h - 60, 240, 36)
        ctx.fillStyle = COLORS.TEXT_GOLD
        ctx.font = 'bold 14px monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`[E] ${b.label}`, w / 2, h - 42)
        ctx.restore()
      }
    }
  }

  // ── Private helpers ──

  private initNPCs(): void {
    const players = useGameStore.getState().players
    const myName = useGameStore.getState().myName
    this.npcs = []

    const buildingKeys = Object.keys(BUILDING_POSITIONS)

    players.forEach((player, idx) => {
      if (player.name === myName) return // skip the human player
      if (!player.alive) return

      // Place NPCs at random buildings
      const bKey = buildingKeys[idx % buildingKeys.length]
      const b = BUILDING_POSITIONS[bKey]
      const startX = (b.x + b.w / 2) * SCALED_TILE + randFloat(-40, 40)
      const startY = (b.y + b.h + 1) * SCALED_TILE + randFloat(-20, 20)

      this.npcs.push({
        slotId: player.slot_id,
        x: startX,
        y: startY,
        targetX: startX,
        targetY: startY,
        direction: 'down',
        animFrame: 0,
        wanderTimer: randFloat(1, WANDER_INTERVAL_MAX),
      })
    })
  }

  private bindInput(): void {
    this.keyDownHandler = (e: KeyboardEvent) => {
      this.keys.add(e.key.toLowerCase())
    }
    this.keyUpHandler = (e: KeyboardEvent) => {
      this.keys.delete(e.key.toLowerCase())
    }
    this.clickHandler = (e: MouseEvent) => {
      const canvas = e.target as HTMLCanvasElement
      if (!canvas || canvas.tagName !== 'CANVAS') return
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      const world = this.camera.screenToWorld(sx, sy)
      this.moveTarget = { x: world.x, y: world.y }
    }

    window.addEventListener('keydown', this.keyDownHandler)
    window.addEventListener('keyup', this.keyUpHandler)
    window.addEventListener('click', this.clickHandler)
  }

  private unbindInput(): void {
    if (this.keyDownHandler) {
      window.removeEventListener('keydown', this.keyDownHandler)
    }
    if (this.keyUpHandler) {
      window.removeEventListener('keyup', this.keyUpHandler)
    }
    if (this.clickHandler) {
      window.removeEventListener('click', this.clickHandler)
    }
    this.keys.clear()
    this.keyDownHandler = null
    this.keyUpHandler = null
    this.clickHandler = null
  }

  private drawTileMap(ctx: CanvasRenderingContext2D): void {
    const { minCol, maxCol, minRow, maxRow } = this.camera.getVisibleTileRange()

    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        const x = col * SCALED_TILE
        const y = row * SCALED_TILE

        // Determine tile type
        const isWater = (col < 1 || col >= MAP_COLS - 1 || row < 1 || row >= MAP_ROWS - 1)
        const isPath = (col >= 17 && col <= 22 && row >= 5 && row <= 25)
          || (row >= 12 && row <= 17 && col >= 5 && col <= 32)

        if (isWater) {
          ctx.fillStyle = COLORS.WATER
        } else if (isPath) {
          ctx.fillStyle = COLORS.EARTH
        } else {
          ctx.fillStyle = COLORS.GRASS
        }
        ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE)

        ctx.strokeStyle = rgba('#000000', 0.03)
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

      // Highlight if player is near
      const isNear = this.nearBuilding === id

      const baseColor = id === BUILDING.OCAK ? COLORS.FIRE_ORANGE : COLORS.WOOD

      SpriteSheet.drawPlaceholderBuilding(ctx, bx, by, bw, bh, b.label, baseColor)

      // Golden highlight glow when nearby
      if (isNear) {
        ctx.save()
        ctx.strokeStyle = rgba(COLORS.TEXT_GOLD, 0.6 + Math.sin(this.time * 3) * 0.3)
        ctx.lineWidth = 3
        ctx.strokeRect(bx - 4, by - 4, bw + 8, bh + 8)
        ctx.restore()
      }
    }
  }
}
