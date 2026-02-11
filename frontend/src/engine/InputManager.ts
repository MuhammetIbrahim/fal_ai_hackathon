// ── InputManager ──
// Singleton that tracks keyboard, mouse, and touch input.
// Attaches to a canvas element and provides methods to query input state.

import type { Camera } from './Camera'

type ClickCallback = (worldX: number, worldY: number) => void

class InputManagerImpl {
  /** Map of currently pressed keys (key name -> pressed) */
  private keys: Map<string, boolean> = new Map()

  /** Mouse position on canvas (screen coords) */
  private mouseScreenX = 0
  private mouseScreenY = 0

  /** Last click position (screen coords), or null if no pending click */
  private lastClickScreenX: number | null = null
  private lastClickScreenY: number | null = null

  /** Registered click callbacks */
  private clickCallbacks: ClickCallback[] = []

  /** The canvas element we're listening on */
  private canvas: HTMLCanvasElement | null = null

  /** Bound event handler references (for cleanup) */
  private boundKeyDown: ((e: KeyboardEvent) => void) | null = null
  private boundKeyUp: ((e: KeyboardEvent) => void) | null = null
  private boundMouseMove: ((e: MouseEvent) => void) | null = null
  private boundMouseDown: ((e: MouseEvent) => void) | null = null
  private boundTouchStart: ((e: TouchEvent) => void) | null = null
  private boundContextMenu: ((e: Event) => void) | null = null
  private boundBlur: (() => void) | null = null

  /** Whether the manager is initialized */
  private initialized = false

  /**
   * Initialize the input manager by attaching event listeners to the canvas.
   */
  init(canvas: HTMLCanvasElement): void {
    if (this.initialized) {
      this.destroy()
    }

    this.canvas = canvas
    this.keys.clear()

    // Bind handlers
    this.boundKeyDown = this.onKeyDown.bind(this)
    this.boundKeyUp = this.onKeyUp.bind(this)
    this.boundMouseMove = this.onMouseMove.bind(this)
    this.boundMouseDown = this.onMouseDown.bind(this)
    this.boundTouchStart = this.onTouchStart.bind(this)
    this.boundContextMenu = (e: Event) => e.preventDefault()
    this.boundBlur = () => this.keys.clear()

    // Attach
    window.addEventListener('keydown', this.boundKeyDown)
    window.addEventListener('keyup', this.boundKeyUp)
    window.addEventListener('blur', this.boundBlur)
    canvas.addEventListener('mousemove', this.boundMouseMove)
    canvas.addEventListener('mousedown', this.boundMouseDown)
    canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false })
    canvas.addEventListener('contextmenu', this.boundContextMenu)

    this.initialized = true
  }

  /**
   * Remove all event listeners and clean up.
   */
  destroy(): void {
    if (!this.initialized) return

    if (this.boundKeyDown) window.removeEventListener('keydown', this.boundKeyDown)
    if (this.boundKeyUp) window.removeEventListener('keyup', this.boundKeyUp)
    if (this.boundBlur) window.removeEventListener('blur', this.boundBlur)

    if (this.canvas) {
      if (this.boundMouseMove) this.canvas.removeEventListener('mousemove', this.boundMouseMove)
      if (this.boundMouseDown) this.canvas.removeEventListener('mousedown', this.boundMouseDown)
      if (this.boundTouchStart) this.canvas.removeEventListener('touchstart', this.boundTouchStart)
      if (this.boundContextMenu) this.canvas.removeEventListener('contextmenu', this.boundContextMenu)
    }

    this.keys.clear()
    this.clickCallbacks = []
    this.canvas = null
    this.initialized = false
  }

  // ── Event handlers ──

  private onKeyDown(e: KeyboardEvent): void {
    this.keys.set(e.key.toLowerCase(), true)
    // Prevent default for game keys to avoid scrolling
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) {
      e.preventDefault()
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.keys.set(e.key.toLowerCase(), false)
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.mouseScreenX = (e.clientX - rect.left) * dpr
    this.mouseScreenY = (e.clientY - rect.top) * dpr
  }

  private onMouseDown(e: MouseEvent): void {
    if (!this.canvas) return
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    this.lastClickScreenX = (e.clientX - rect.left) * dpr
    this.lastClickScreenY = (e.clientY - rect.top) * dpr

    // Notify click callbacks (need a camera to convert, but we store screen coords here;
    // callbacks that need world coords should use getLastClick with a camera)
  }

  private onTouchStart(e: TouchEvent): void {
    if (!this.canvas || e.touches.length === 0) return
    e.preventDefault()
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const touch = e.touches[0]
    this.lastClickScreenX = (touch.clientX - rect.left) * dpr
    this.lastClickScreenY = (touch.clientY - rect.top) * dpr
  }

  // ── Query methods ──

  /**
   * Check if a specific key is currently pressed.
   */
  isKeyDown(key: string): boolean {
    return this.keys.get(key.toLowerCase()) === true
  }

  /**
   * Get the current movement direction from WASD/arrow keys.
   * Returns {dx, dy} where each is -1, 0, or 1.
   */
  getMovementDirection(): { dx: number; dy: number } {
    let dx = 0
    let dy = 0

    if (this.isKeyDown('w') || this.isKeyDown('arrowup')) dy -= 1
    if (this.isKeyDown('s') || this.isKeyDown('arrowdown')) dy += 1
    if (this.isKeyDown('a') || this.isKeyDown('arrowleft')) dx -= 1
    if (this.isKeyDown('d') || this.isKeyDown('arrowright')) dx += 1

    return { dx, dy }
  }

  /**
   * Get the current mouse position in world coordinates.
   */
  getMouseWorldPos(camera: Camera): { x: number; y: number } {
    return camera.screenToWorld(this.mouseScreenX, this.mouseScreenY)
  }

  /**
   * Get the last click position in world coordinates and clear it.
   * Returns null if no click pending.
   */
  getLastClick(camera: Camera): { x: number; y: number } | null {
    if (this.lastClickScreenX === null || this.lastClickScreenY === null) {
      return null
    }

    const worldPos = camera.screenToWorld(this.lastClickScreenX, this.lastClickScreenY)
    this.lastClickScreenX = null
    this.lastClickScreenY = null
    return worldPos
  }

  /**
   * Register a callback to be called on canvas click (receives world coords).
   * The callback is invoked on the next getLastClick call or manually.
   * For immediate notification, use this:
   */
  onCanvasClick(callback: ClickCallback): () => void {
    this.clickCallbacks.push(callback)

    // Return an unsubscribe function
    return () => {
      const idx = this.clickCallbacks.indexOf(callback)
      if (idx !== -1) this.clickCallbacks.splice(idx, 1)
    }
  }

  /**
   * Dispatch pending click to registered callbacks.
   * Should be called once per frame with the current camera.
   */
  dispatchClicks(camera: Camera): void {
    if (this.lastClickScreenX === null || this.lastClickScreenY === null) return
    if (this.clickCallbacks.length === 0) return

    const worldPos = camera.screenToWorld(this.lastClickScreenX, this.lastClickScreenY)
    for (const cb of this.clickCallbacks) {
      cb(worldPos.x, worldPos.y)
    }
    // Note: we do NOT clear the click here — getLastClick will do that.
    // If you only use callbacks, the click stays until getLastClick is called.
  }

  /**
   * Check if the manager is currently initialized.
   */
  isInitialized(): boolean {
    return this.initialized
  }
}

/** Singleton InputManager instance */
export const inputManager = new InputManagerImpl()
export { InputManagerImpl as InputManager }
