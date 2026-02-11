// ── SceneManager ──
// Manages scene lifecycle and transitions with a fog/darkness fade effect.

import type { Phase } from '../state/types'
import { COLORS, TRANSITION_DURATION } from '../utils/constants'
import { rgba, clamp } from '../utils/helpers'

// ── Scene interface ──
export interface Scene {
  update(dt: number): void
  draw(ctx: CanvasRenderingContext2D): void
  enter?(): void
  exit?(): void
}

// Transition takes 2x duration: first half fades to fog, second half fades out
const HALF_DURATION = TRANSITION_DURATION / 1000 // seconds

class SceneManager {
  currentScene: Scene | null = null
  private nextScene: Scene | null = null
  private transitionProgress = 0 // 0→1 fade-in fog, 1→2 fade-out fog
  transitioning = false
  private scenes: Map<Phase, Scene> = new Map()

  /** Register a scene for a given phase */
  registerScene(phase: Phase, scene: Scene): void {
    this.scenes.set(phase, scene)
  }

  /** Start a fog transition to the scene registered for the given phase */
  switchTo(phase: Phase): void {
    const scene = this.scenes.get(phase)
    if (!scene) {
      console.warn(`[SceneManager] No scene registered for phase "${phase}"`)
      return
    }
    if (this.transitioning) {
      // Force-finish current transition before starting a new one
      this.finishTransition()
    }
    this.nextScene = scene
    this.transitionProgress = 0
    this.transitioning = true
  }

  /** Update transition progress and current scene */
  update(dt: number): void {
    if (this.transitioning) {
      // Advance transition progress
      // Speed: go from 0 to 2 in 2*HALF_DURATION seconds
      this.transitionProgress += dt / HALF_DURATION
      this.transitionProgress = clamp(this.transitionProgress, 0, 2)

      // At the midpoint (progress == 1), swap scenes
      if (this.transitionProgress >= 1 && this.nextScene) {
        if (this.currentScene?.exit) {
          this.currentScene.exit()
        }
        this.currentScene = this.nextScene
        this.nextScene = null
        if (this.currentScene.enter) {
          this.currentScene.enter()
        }
      }

      // Transition complete
      if (this.transitionProgress >= 2) {
        this.finishTransition()
      }
    }

    // Update current scene
    if (this.currentScene) {
      this.currentScene.update(dt)
    }
  }

  /** Draw current scene and transition overlay */
  draw(ctx: CanvasRenderingContext2D): void {
    // Draw current scene
    if (this.currentScene) {
      this.currentScene.draw(ctx)
    }

    // Draw transition overlay (fog/darkness)
    if (this.transitioning) {
      let alpha: number
      if (this.transitionProgress <= 1) {
        // Fade IN: 0→1 maps to alpha 0→1
        alpha = this.transitionProgress
      } else {
        // Fade OUT: 1→2 maps to alpha 1→0
        alpha = 2 - this.transitionProgress
      }
      alpha = clamp(alpha, 0, 1)

      ctx.save()
      ctx.fillStyle = rgba(COLORS.FOG, alpha * 0.9)
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
      ctx.restore()
    }
  }

  /** Get the currently active scene */
  getCurrentScene(): Scene | null {
    return this.currentScene
  }

  /** Immediately finish any in-progress transition */
  private finishTransition(): void {
    if (this.nextScene) {
      // Scene swap hasn't happened yet, do it now
      if (this.currentScene?.exit) {
        this.currentScene.exit()
      }
      this.currentScene = this.nextScene
      this.nextScene = null
      if (this.currentScene.enter) {
        this.currentScene.enter()
      }
    }
    this.transitioning = false
    this.transitionProgress = 0
  }
}

export const sceneManager = new SceneManager()
