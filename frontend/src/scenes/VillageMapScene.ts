// ── VillageMapScene ──
// Salem-style village map: 6 houses arranged in a circle around a central campfire.
// Characters move between locations based on location_decisions.
// Clickable houses and campfire to select room for chat overlay.
// Replaces CampfireScene and HouseScene during campfire/houses phases.

import type { Scene } from './SceneManager'
import { Camera } from '../engine/Camera'
import { SpriteSheet } from '../engine/SpriteSheet'
import { useGameStore } from '../state/GameStore'
import {
  COLORS, SCALED_TILE, CHAR_SIZE, CHAR_SCALE, MAP_COLS, MAP_ROWS,
} from '../utils/constants'
import { rgba, randFloat, lerp, distance, getPlayerColor } from '../utils/helpers'
import type { OcakTepki } from '../state/types'

// ── Fire particle ──
interface FireParticle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; radius: number; color: string
}

interface SparkParticle {
  x: number; y: number; vx: number; vy: number
  life: number; maxLife: number; radius: number; color: string
}

// ── House definition ──
interface House {
  x: number       // top-left world x
  y: number       // top-left world y
  centerX: number // center world x
  centerY: number // center world y
  owner: string   // player name or fallback label
  ownerIndex: number // player index
}

// ── Character animation state ──
interface CharAnim {
  currentX: number
  currentY: number
  targetX: number
  targetY: number
}

// ── Constants ──
const VILLAGE_CENTER = { x: 1280, y: 960 }
const HOUSE_RADIUS = 350
const HOUSE_SIZE = 120
const CAMPFIRE_CLICK_RADIUS = 80
const CHAR_MOVE_SPEED = 200 // px/s

const FIRE_COLORS_NORMAL = [COLORS.FIRE_ORANGE, COLORS.FIRE_YELLOW, '#FFE08C']
const FIRE_COLORS_RAGE = [COLORS.FIRE_RED, '#FF2200', '#FF4444']
const FIRE_COLORS_APPROVAL = ['#22CC44', '#66FF66', COLORS.FIRE_YELLOW]
const MAX_FIRE = 45

export class VillageMapScene implements Scene {
  private camera: Camera
  private fireParticles: FireParticle[] = []
  private sparkParticles: SparkParticle[] = []
  private time = 0

  // Houses
  private houses: House[] = []
  private _lastAliveCount = -1

  // Character animation positions (name → anim state)
  private charAnims: Map<string, CharAnim> = new Map()

  // Avatar image cache (name → loaded HTMLImageElement)
  private avatarImages: Map<string, HTMLImageElement> = new Map()
  private avatarLoadingSet: Set<string> = new Set()

  // Background image cache
  private bgImage: HTMLImageElement | null = null
  private bgImageUrl: string | null = null

  // Fire colors (tepki reactions)
  private currentFireColors: string[] = FIRE_COLORS_NORMAL
  private tepkiTimer = 0
  private lastTepkiId: string | null = null

  constructor() {
    this.camera = new Camera()
  }

  enter(): void {
    this.time = 0
    this.fireParticles = []
    this.sparkParticles = []
    this.currentFireColors = FIRE_COLORS_NORMAL
    this.tepkiTimer = 0
    this.lastTepkiId = null
    this.charAnims.clear()

    // Build house positions
    this.rebuildHouses()

    // Camera: fit entire village
    this.camera.setScale(1)
    this.camera.follow(VILLAGE_CENTER.x, VILLAGE_CENTER.y)
    this.camera.snapToTarget()

    // Initialize character positions at campfire
    const players = useGameStore.getState().players
    const alivePlayers = players.filter(p => p.alive)
    for (let i = 0; i < alivePlayers.length; i++) {
      const seat = this.getCampfireSeat(i, alivePlayers.length)
      this.charAnims.set(alivePlayers[i].name, {
        currentX: seat.x, currentY: seat.y,
        targetX: seat.x, targetY: seat.y,
      })
    }

    // Pre-fill fire particles
    for (let i = 0; i < MAX_FIRE; i++) {
      this.spawnFireParticle(Math.random())
    }
  }

  exit(): void {
    this.fireParticles = []
    this.sparkParticles = []
  }

  update(dt: number): void {
    this.time += dt

    // Camera follows village center
    this.camera.follow(VILLAGE_CENTER.x, VILLAGE_CENTER.y)
    this.camera.update()

    // Rebuild houses only if alive player count changed
    const aliveCount = useGameStore.getState().players.filter(p => p.alive).length
    if (aliveCount !== this._lastAliveCount) {
      this._lastAliveCount = aliveCount
      this.rebuildHouses()
    }

    // ── Check ocak tepki ──
    const tepki = useGameStore.getState().ocakTepki
    if (tepki) {
      const tepkiKey = `${tepki.type}-${tepki.message}`
      if (tepkiKey !== this.lastTepkiId) {
        this.lastTepkiId = tepkiKey
        this.triggerTepki(tepki)
      }
    }

    if (this.tepkiTimer > 0) {
      this.tepkiTimer -= dt
      if (this.tepkiTimer <= 0) {
        this.currentFireColors = FIRE_COLORS_NORMAL
        this.tepkiTimer = 0
      }
    }

    // ── Update fire particles ──
    for (let i = this.fireParticles.length - 1; i >= 0; i--) {
      const p = this.fireParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.life -= dt
      p.vx += Math.sin(this.time * 3 + i * 0.5) * 0.4 * dt
      if (p.life <= 0) this.fireParticles.splice(i, 1)
    }
    while (this.fireParticles.length < MAX_FIRE) {
      this.spawnFireParticle()
    }

    // ── Update spark particles ──
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 120 * dt
      p.life -= dt
      if (p.life <= 0) this.sparkParticles.splice(i, 1)
    }

    // ── Update character targets based on playerLocations ──
    const store = useGameStore.getState()
    const players = store.players
    const alivePlayers = players.filter(p => p.alive)
    const locations = store.playerLocations

    // Count only campfire players for seat indexing
    const campfirePlayers = alivePlayers.filter(p => (locations[p.name] || 'campfire') === 'campfire')

    for (let i = 0; i < alivePlayers.length; i++) {
      const player = alivePlayers[i]
      const loc = locations[player.name] || 'campfire'
      // Use campfire-only index for seating
      const campfireIdx = campfirePlayers.indexOf(player)
      const seatIdx = campfireIdx >= 0 ? campfireIdx : i
      const seatTotal = campfireIdx >= 0 ? campfirePlayers.length : alivePlayers.length
      const target = this.getCharacterTarget(player.name, loc, seatIdx, seatTotal)

      let anim = this.charAnims.get(player.name)
      if (!anim) {
        anim = { currentX: target.x, currentY: target.y, targetX: target.x, targetY: target.y }
        this.charAnims.set(player.name, anim)
      }
      anim.targetX = target.x
      anim.targetY = target.y

      // Lerp towards target
      const dx = anim.targetX - anim.currentX
      const dy = anim.targetY - anim.currentY
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > 2) {
        const step = Math.min(CHAR_MOVE_SPEED * dt, dist)
        anim.currentX += (dx / dist) * step
        anim.currentY += (dy / dist) * step
      } else {
        anim.currentX = anim.targetX
        anim.currentY = anim.targetY
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const w = ctx.canvas.width
    const h = ctx.canvas.height
    this.camera.resize(w, h)

    // ── Clear ──
    ctx.fillStyle = COLORS.BG_DARK
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.scale(this.camera.scale, this.camera.scale)
    ctx.translate(-this.camera.x, -this.camera.y)

    // ── Ground ──
    this.drawGround(ctx)

    // ── Paths from campfire to houses ──
    this.drawPaths(ctx)

    // ── Houses ──
    const selectedRoom = useGameStore.getState().selectedRoom
    const locations = useGameStore.getState().playerLocations
    for (const house of this.houses) {
      this.drawHouse(ctx, house, selectedRoom === house.owner, locations)
    }

    // ── Fire glow ──
    const glowR = 180 + Math.sin(this.time * 2.5) * 25
    const glow = ctx.createRadialGradient(
      VILLAGE_CENTER.x, VILLAGE_CENTER.y, 10,
      VILLAGE_CENTER.x, VILLAGE_CENTER.y, glowR,
    )
    const primaryColor = this.currentFireColors[0]
    glow.addColorStop(0, rgba(primaryColor, 0.35))
    glow.addColorStop(0.5, rgba(primaryColor, 0.1))
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(
      VILLAGE_CENTER.x - glowR, VILLAGE_CENTER.y - glowR,
      glowR * 2, glowR * 2,
    )

    // ── Campfire base ──
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(VILLAGE_CENTER.x - 30, VILLAGE_CENTER.y + 8, 60, 10)
    ctx.fillStyle = COLORS.WOOD
    ctx.fillRect(VILLAGE_CENTER.x - 22, VILLAGE_CENTER.y + 2, 44, 8)

    // Campfire highlight if selected
    if (selectedRoom === 'campfire') {
      ctx.save()
      ctx.strokeStyle = COLORS.TEXT_GOLD
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(VILLAGE_CENTER.x, VILLAGE_CENTER.y, 60, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }

    // ── Fire particles ──
    for (const p of this.fireParticles) {
      const alpha = Math.max(0, p.life / p.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.radius * (0.4 + alpha * 0.6), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    // ── Spark particles ──
    for (const sp of this.sparkParticles) {
      const alpha = Math.max(0, sp.life / sp.maxLife)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = sp.color
      ctx.fillRect(sp.x - sp.radius / 2, sp.y - sp.radius / 2, sp.radius, sp.radius)
      ctx.restore()
    }

    // ── Characters ──
    const { players, myName } = useGameStore.getState()
    const alivePlayers = players.filter(p => p.alive)
    const AVATAR_DISPLAY_SIZE = 48 // px — avatar replaces placeholder square
    for (let i = 0; i < alivePlayers.length; i++) {
      const player = alivePlayers[i]
      const anim = this.charAnims.get(player.name)
      if (!anim) continue

      const color = player.color ?? getPlayerColor(i)
      const isMe = player.name === myName
      const half = AVATAR_DISPLAY_SIZE / 2

      // Load avatar if needed
      const avatarImg = this.avatarImages.get(player.name)
      if (!avatarImg) this.loadAvatar(player.name, player.avatar_url)

      // Gold glow for human player
      if (isMe) {
        ctx.save()
        ctx.shadowColor = COLORS.TEXT_GOLD
        ctx.shadowBlur = 14
        ctx.strokeStyle = COLORS.TEXT_GOLD
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(anim.currentX, anim.currentY, half + 3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      if (avatarImg) {
        // ── Draw avatar image as the character (circular) ──
        ctx.save()
        ctx.beginPath()
        ctx.arc(anim.currentX, anim.currentY, half, 0, Math.PI * 2)
        ctx.clip()
        ctx.drawImage(
          avatarImg,
          anim.currentX - half,
          anim.currentY - half,
          AVATAR_DISPLAY_SIZE,
          AVATAR_DISPLAY_SIZE,
        )
        ctx.restore()

        // Border ring
        ctx.save()
        ctx.strokeStyle = isMe ? COLORS.TEXT_GOLD : COLORS.WOOD
        ctx.lineWidth = isMe ? 2.5 : 1.5
        ctx.beginPath()
        ctx.arc(anim.currentX, anim.currentY, half, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()

        // Dead overlay
        if (!player.alive) {
          ctx.save()
          ctx.globalAlpha = 0.5
          ctx.fillStyle = '#000'
          ctx.beginPath()
          ctx.arc(anim.currentX, anim.currentY, half, 0, Math.PI * 2)
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.fillStyle = '#FF4444'
          ctx.font = 'bold 20px monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('X', anim.currentX, anim.currentY)
          ctx.restore()
        }
      } else {
        // ── Fallback: colored placeholder square ──
        const charSize = CHAR_SIZE * CHAR_SCALE
        const dx = anim.targetX - anim.currentX
        const dy = anim.targetY - anim.currentY
        const moving = Math.abs(dx) > 2 || Math.abs(dy) > 2
        let dir: 'up' | 'down' | 'left' | 'right' = 'down'
        if (moving) {
          dir = Math.abs(dx) > Math.abs(dy)
            ? (dx > 0 ? 'right' : 'left')
            : (dy > 0 ? 'down' : 'up')
        } else {
          const cx = VILLAGE_CENTER.x - anim.currentX
          const cy = VILLAGE_CENTER.y - anim.currentY
          dir = Math.abs(cx) > Math.abs(cy)
            ? (cx > 0 ? 'right' : 'left')
            : (cy > 0 ? 'down' : 'up')
        }
        SpriteSheet.drawPlaceholderCharacter(
          ctx,
          anim.currentX - charSize / 2,
          anim.currentY - charSize / 2,
          color, dir,
          moving ? Math.floor(this.time * 4) % 2 : 0,
          player.alive,
        )
      }

      // Name tag below character
      ctx.fillStyle = isMe ? COLORS.TEXT_GOLD : COLORS.TEXT_LIGHT
      ctx.font = isMe ? 'bold 12px monospace' : 'bold 11px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(
        isMe ? `${player.name} (SEN)` : player.name,
        anim.currentX,
        anim.currentY + half + 4,
      )

      // Role title subtitle
      ctx.fillStyle = COLORS.STONE
      ctx.font = '9px monospace'
      ctx.fillText(player.role_title, anim.currentX, anim.currentY + half + 18)
    }

    // ── Room activity indicators (speech bubble icon) ──
    this.drawActivityIndicators(ctx)

    ctx.restore()
  }

  /** Handle click event (called from canvas click handler in App.tsx) */
  handleClick(canvasX: number, canvasY: number): void {
    const world = this.camera.screenToWorld(canvasX, canvasY)
    const store = useGameStore.getState()
    const CLICK_RADIUS = 24 // px hit area for character clicks

    // Close player card if open
    if (store.inspectedPlayer) {
      store.setInspectedPlayer(null)
    }

    // 1. Campfire click (game mechanic — highest priority)
    if (distance(world.x, world.y, VILLAGE_CENTER.x, VILLAGE_CENTER.y) < CAMPFIRE_CLICK_RADIUS) {
      store.setSelectedRoom('campfire')
      return
    }

    // 2. House clicks (game mechanic — before characters)
    for (const house of this.houses) {
      if (
        world.x >= house.x && world.x <= house.x + HOUSE_SIZE &&
        world.y >= house.y && world.y <= house.y + HOUSE_SIZE
      ) {
        // Find the visit involving this house owner
        const visit = store.houseVisits.find(
          (v) => v.host === house.owner || v.visitor === house.owner
        )
        if (visit) {
          store.setSelectedRoom(visit.visit_id)
        }
        return
      }
    }

    // 3. Character clicks (info card — lowest priority, only in open space)
    const alivePlayers = store.players.filter(p => p.alive)
    for (const player of alivePlayers) {
      const anim = this.charAnims.get(player.name)
      if (!anim) continue
      if (distance(world.x, world.y, anim.currentX, anim.currentY) < CLICK_RADIUS) {
        store.setInspectedPlayer(player.name)
        return
      }
    }
  }

  // ── Private helpers ──

  private rebuildHouses(): void {
    const players = useGameStore.getState().players
    const alivePlayers = players.filter(p => p.alive)
    const count = alivePlayers.length

    const newHouses: House[] = []
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count - Math.PI / 2
      const cx = VILLAGE_CENTER.x + Math.cos(angle) * HOUSE_RADIUS
      const cy = VILLAGE_CENTER.y + Math.sin(angle) * HOUSE_RADIUS
      newHouses.push({
        x: cx - HOUSE_SIZE / 2,
        y: cy - HOUSE_SIZE / 2,
        centerX: cx,
        centerY: cy,
        owner: alivePlayers[i]?.name ?? `Ev ${i + 1}`,
        ownerIndex: i,
      })
    }
    this.houses = newHouses
  }

  private drawGround(ctx: CanvasRenderingContext2D): void {
    // Try to use background image if available
    const bgUrl = useGameStore.getState().sceneBackgrounds?.village
    if (bgUrl && bgUrl !== this.bgImageUrl) {
      this.bgImageUrl = bgUrl
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => { this.bgImage = img }
      img.src = bgUrl
    }

    if (this.bgImage) {
      // Draw background image covering the ENTIRE world map
      const worldW = MAP_COLS * SCALED_TILE  // 2560
      const worldH = MAP_ROWS * SCALED_TILE  // 1920
      ctx.globalAlpha = 0.85
      ctx.drawImage(this.bgImage, 0, 0, worldW, worldH)
      ctx.globalAlpha = 1.0
    } else {
      // No background image — draw solid grass tiles
      const { minCol, maxCol, minRow, maxRow } = this.camera.getVisibleTileRange()
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const x = col * SCALED_TILE
          const y = row * SCALED_TILE
          ctx.fillStyle = COLORS.GRASS
          ctx.fillRect(x, y, SCALED_TILE, SCALED_TILE)
          ctx.strokeStyle = rgba('#000000', 0.04)
          ctx.strokeRect(x, y, SCALED_TILE, SCALED_TILE)
        }
      }
    }
  }

  private drawPaths(ctx: CanvasRenderingContext2D): void {
    ctx.save()
    ctx.strokeStyle = COLORS.EARTH
    ctx.lineWidth = 16
    ctx.lineCap = 'round'
    for (const house of this.houses) {
      ctx.beginPath()
      ctx.moveTo(VILLAGE_CENTER.x, VILLAGE_CENTER.y)
      ctx.lineTo(house.centerX, house.centerY)
      ctx.stroke()
    }
    ctx.restore()
  }

  private drawHouse(
    ctx: CanvasRenderingContext2D,
    house: House,
    isSelected: boolean,
    locations: Record<string, string>,
  ): void {
    const { x, y } = house

    // Check if anyone is inside this house
    const hasOccupants = Object.values(locations).some(
      loc => loc === 'home' || loc === `visiting:${house.owner}`
    )

    ctx.save()

    // House body
    ctx.fillStyle = '#6B4226'
    ctx.fillRect(x, y, HOUSE_SIZE, HOUSE_SIZE)

    // Roof triangle
    ctx.fillStyle = '#8B4513'
    ctx.beginPath()
    ctx.moveTo(x - 10, y)
    ctx.lineTo(x + HOUSE_SIZE / 2, y - 30)
    ctx.lineTo(x + HOUSE_SIZE + 10, y)
    ctx.closePath()
    ctx.fill()

    // Darker border
    ctx.strokeStyle = '#3E200D'
    ctx.lineWidth = 2
    ctx.strokeRect(x + 1, y + 1, HOUSE_SIZE - 2, HOUSE_SIZE - 2)

    // Door
    const doorW = 20
    const doorH = 30
    ctx.fillStyle = COLORS.DARK_WOOD
    ctx.fillRect(x + HOUSE_SIZE / 2 - doorW / 2, y + HOUSE_SIZE - doorH, doorW, doorH)

    // Window with light if occupied
    const winSize = 18
    const winY = y + 20
    // Left window
    ctx.fillStyle = hasOccupants ? '#FFD700' : '#1a1208'
    ctx.fillRect(x + 15, winY, winSize, winSize)
    ctx.strokeStyle = '#3E200D'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 15, winY, winSize, winSize)
    // Right window
    ctx.fillStyle = hasOccupants ? '#FFD700' : '#1a1208'
    ctx.fillRect(x + HOUSE_SIZE - 15 - winSize, winY, winSize, winSize)
    ctx.strokeRect(x + HOUSE_SIZE - 15 - winSize, winY, winSize, winSize)

    // Selection highlight
    if (isSelected) {
      ctx.strokeStyle = COLORS.TEXT_GOLD
      ctx.lineWidth = 3
      ctx.shadowColor = COLORS.TEXT_GOLD
      ctx.shadowBlur = 10
      ctx.strokeRect(x - 4, y - 4, HOUSE_SIZE + 8, HOUSE_SIZE + 8)
      ctx.shadowBlur = 0
    }

    // Owner name label
    ctx.fillStyle = COLORS.TEXT_LIGHT
    ctx.font = 'bold 11px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.fillText(house.owner, x + HOUSE_SIZE / 2, y + HOUSE_SIZE + 6)

    ctx.restore()
  }

  private drawActivityIndicators(ctx: CanvasRenderingContext2D): void {
    const store = useGameStore.getState()
    const houseVisits = store.houseVisits

    // Show speech bubble icon above houses with active visits
    for (const visit of houseVisits) {
      const house = this.houses.find(h => h.owner === visit.host)
      if (!house) continue

      // Small speech bubble
      const bx = house.x + HOUSE_SIZE / 2
      const by = house.y - 40
      ctx.save()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(bx, by, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('...', bx, by - 1)
      ctx.restore()
    }

    // Show speech bubble above campfire if speeches are happening
    if (store.speeches.length > 0) {
      const bx = VILLAGE_CENTER.x
      const by = VILLAGE_CENTER.y - 50
      ctx.save()
      ctx.fillStyle = '#FFFFFF'
      ctx.beginPath()
      ctx.arc(bx, by, 10, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#333'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('...', bx, by - 1)
      ctx.restore()
    }
  }

  private getCharacterTarget(
    playerName: string,
    location: string,
    playerIndex: number,
    totalAlive: number,
  ): { x: number; y: number } {
    if (location === 'campfire') {
      return this.getCampfireSeat(playerIndex, totalAlive)
    }

    if (location === 'home') {
      // Stand inside house (centered)
      const house = this.houses.find(h => h.owner === playerName)
      if (house) {
        return { x: house.centerX, y: house.y + HOUSE_SIZE * 0.5 }
      }
    }

    if (location.startsWith('visiting:')) {
      const targetName = location.split(':')[1]
      const house = this.houses.find(h => h.owner === targetName)
      if (house) {
        // Stand at house door (clearly outside, offset to the right)
        return { x: house.centerX + 50, y: house.y + HOUSE_SIZE + 20 }
      }
    }

    if (location.startsWith('institution:')) {
      // Institution visitors go to top-right corner of the map
      return { x: VILLAGE_CENTER.x + HOUSE_RADIUS + 100, y: VILLAGE_CENTER.y - HOUSE_RADIUS - 50 + playerIndex * 40 }
    }

    // Fallback: campfire
    return this.getCampfireSeat(playerIndex, totalAlive)
  }

  private getCampfireSeat(index: number, total: number): { x: number; y: number } {
    if (total === 0) return { x: VILLAGE_CENTER.x, y: VILLAGE_CENTER.y + 100 }

    const startAngle = Math.PI * 0.6
    const endAngle = Math.PI * 2.4
    const step = (endAngle - startAngle) / Math.max(1, total - 1)
    const angle = total === 1 ? Math.PI * 1.5 : startAngle + step * index
    const radius = 170

    return {
      x: VILLAGE_CENTER.x + Math.cos(angle) * radius,
      y: VILLAGE_CENTER.y + Math.sin(angle) * radius,
    }
  }

  private triggerTepki(tepki: OcakTepki): void {
    switch (tepki.type) {
      case 'rage':
        this.currentFireColors = FIRE_COLORS_RAGE
        break
      case 'approval':
        this.currentFireColors = FIRE_COLORS_APPROVAL
        break
      default:
        this.currentFireColors = FIRE_COLORS_NORMAL
    }
    this.tepkiTimer = 4

    for (let i = 0; i < 25; i++) {
      this.sparkParticles.push({
        x: VILLAGE_CENTER.x + randFloat(-10, 10),
        y: VILLAGE_CENTER.y + randFloat(-10, 0),
        vx: randFloat(-150, 150),
        vy: randFloat(-200, -50),
        life: randFloat(0.5, 1.2),
        maxLife: 1.2,
        radius: randFloat(2, 5),
        color: this.currentFireColors[Math.floor(Math.random() * this.currentFireColors.length)],
      })
    }
  }

  private spawnFireParticle(initialFraction?: number): void {
    const maxLife = randFloat(0.5, 1.2)
    const life = initialFraction !== undefined ? maxLife * initialFraction : maxLife
    const colors = this.currentFireColors

    this.fireParticles.push({
      x: VILLAGE_CENTER.x + randFloat(-18, 18),
      y: VILLAGE_CENTER.y + randFloat(-5, 5),
      vx: randFloat(-10, 10),
      vy: randFloat(-80, -30),
      life, maxLife,
      radius: randFloat(3, 9),
      color: colors[Math.floor(Math.random() * colors.length)],
    })
  }

  /** Lazy-load avatar image from URL */
  private loadAvatar(name: string, url?: string): void {
    if (!url || this.avatarLoadingSet.has(name)) return
    this.avatarLoadingSet.add(name)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      this.avatarImages.set(name, img)
    }
    img.onerror = () => {
      // Failed to load, don't retry
      this.avatarLoadingSet.delete(name)
    }
    img.src = url
  }
}
