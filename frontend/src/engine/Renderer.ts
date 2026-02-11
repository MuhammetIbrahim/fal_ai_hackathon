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

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('[Renderer] Could not get 2D context from canvas')
    }
    this.ctx = ctx

    // Disable image smoothing for crisp pixel art
    this.ctx.imageSmoothingEnabled = false
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
