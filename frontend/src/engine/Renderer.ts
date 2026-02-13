// ── Renderer ──
// Main render loop manager. Orchestrates the game loop: update and draw.
// Manages the canvas, context, and active scene.

// ── Scene interface ──
export interface Scene {
  /** Update game logic. dt is the delta time in seconds since last frame. */
  update(dt: number): void

  /** Draw the scene to the canvas context. */
  draw(ctx: CanvasRenderingContext2D): void

  /** Called when this scene becomes active. */
  enter?(): void

  /** Called when this scene is replaced by another. */
  exit?(): void
}

/** Phase → background key mapping */
const PHASE_BG_MAP: Record<string, string> = {
  morning: 'morning',
  campfire: 'campfire',
  day: 'village',
  houses: 'house_interior',
  vote: 'campfire',
  night: 'night',
  exile: 'campfire',
}

export class Renderer {
  /** The canvas HTML element */
  canvas: HTMLCanvasElement

  /** The 2D rendering context */
  ctx: CanvasRenderingContext2D

  /** Whether the render loop is running */
  running = false

  /** Timestamp of the last frame (ms) */
  private lastTime = 0

  /** The currently active scene */
  private activeScene: Scene | null = null

  /** The requestAnimationFrame ID (for cancellation) */
  private rafId = 0

  /** Max delta time cap to prevent huge jumps (e.g. after tab switch) */
  private static readonly MAX_DT = 1 / 15 // ~66ms, about 15 FPS minimum

  /** Current background image (loaded texture) */
  private bgImage: HTMLImageElement | null = null

  /** Currently loaded background URL (to avoid redundant loads) */
  private bgUrl: string | null = null

  /** Current phase for background tracking */
  private currentPhase: string | null = null

  /** Background image cache: url → HTMLImageElement */
  private bgCache: Map<string, HTMLImageElement> = new Map()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('[Renderer] Could not get 2D context from canvas')
    }
    this.ctx = ctx

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false

    // Listen for phase background changes from the store
    this._onPhaseChange = this._onPhaseChange.bind(this)
    window.addEventListener('phase-background-change', this._onPhaseChange as EventListener)
  }

  /**
   * Start the render loop.
   */
  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now()
    this.loop(this.lastTime)
  }

  /**
   * Stop the render loop.
   */
  stop(): void {
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }
    window.removeEventListener('phase-background-change', this._onPhaseChange as EventListener)
  }

  /**
   * Update the background texture for the current phase.
   * Clears the old background and loads a new one from the provided URL.
   * Uses an internal cache to avoid re-downloading the same image.
   */
  updateBackground(phase: string, sceneBackgrounds: Record<string, string>): void {
    const bgKey = PHASE_BG_MAP[phase]
    if (!bgKey) {
      // No background mapping for this phase — clear background
      this.bgImage = null
      this.bgUrl = null
      this.currentPhase = phase
      return
    }

    const url = sceneBackgrounds[bgKey]
    if (!url) {
      // No URL provided for this background key — clear
      this.bgImage = null
      this.bgUrl = null
      this.currentPhase = phase
      return
    }

    // Skip if already loaded
    if (url === this.bgUrl && this.bgImage) {
      this.currentPhase = phase
      return
    }

    // Clear old background immediately
    this.bgImage = null
    this.bgUrl = url
    this.currentPhase = phase

    // Check cache first
    const cached = this.bgCache.get(url)
    if (cached) {
      this.bgImage = cached
      return
    }

    // Load new background image
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      // Only apply if the URL is still current (user might have changed phase)
      if (this.bgUrl === url) {
        this.bgImage = img
        this.bgCache.set(url, img)
      }
    }
    img.onerror = () => {
      console.warn(`[Renderer] Failed to load background: ${url}`)
    }
    img.src = url
  }

  /**
   * Get the current background image (if loaded).
   * Scenes can use this to draw the background.
   */
  getBackgroundImage(): HTMLImageElement | null {
    return this.bgImage
  }

  /**
   * Clear the background texture cache entirely.
   * Useful when sceneBackgrounds URLs change (e.g., new game session).
   */
  clearBackgroundCache(): void {
    this.bgCache.clear()
    this.bgImage = null
    this.bgUrl = null
  }

  /** Handle phase-background-change events from GameStore */
  private _onPhaseChange(e: Event): void {
    const detail = (e as CustomEvent).detail as {
      phase: string
      sceneBackgrounds: Record<string, string>
    }
    if (detail) {
      this.updateBackground(detail.phase, detail.sceneBackgrounds)
    }
  }

  /**
   * Set the active scene. Calls exit() on the old scene and enter() on the new one.
   */
  setScene(scene: Scene): void {
    if (this.activeScene?.exit) {
      this.activeScene.exit()
    }
    this.activeScene = scene
    if (this.activeScene?.enter) {
      this.activeScene.enter()
    }
  }

  /**
   * Get the current active scene.
   */
  getScene(): Scene | null {
    return this.activeScene
  }

  /**
   * Handle window resize: set canvas dimensions to match the window,
   * accounting for devicePixelRatio while keeping pixelated rendering.
   */
  resize(): void {
    const dpr = window.devicePixelRatio || 1
    const displayWidth = window.innerWidth
    const displayHeight = window.innerHeight

    // Set the actual canvas buffer size (scaled by DPR for sharpness)
    this.canvas.width = displayWidth * dpr
    this.canvas.height = displayHeight * dpr

    // Set the CSS display size
    this.canvas.style.width = `${displayWidth}px`
    this.canvas.style.height = `${displayHeight}px`

    // Re-apply pixel art settings after resize (context state resets)
    this.ctx.imageSmoothingEnabled = false
  }

  /**
   * Get the logical canvas width (accounting for DPR).
   */
  getWidth(): number {
    return this.canvas.width
  }

  /**
   * Get the logical canvas height (accounting for DPR).
   */
  getHeight(): number {
    return this.canvas.height
  }

  // ── The main loop ──

  private loop = (now: number): void => {
    if (!this.running) return

    // Calculate delta time in seconds
    let dt = (now - this.lastTime) / 1000
    this.lastTime = now

    // Clamp dt to avoid spiral of death after tab switches
    if (dt > Renderer.MAX_DT) {
      dt = Renderer.MAX_DT
    }

    // Clear the entire canvas
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)

    // Update and draw the active scene
    if (this.activeScene) {
      this.activeScene.update(dt)
      this.activeScene.draw(this.ctx)
    }

    // Request next frame
    this.rafId = requestAnimationFrame(this.loop)
  }
}
