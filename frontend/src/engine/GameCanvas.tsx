// ── GameCanvas ──
// React component that creates and manages the HTML5 canvas element
// for the pixel-art game engine. Initializes the Renderer and InputManager,
// handles resize events, and exposes the renderer via module-level export.

import React, { useRef, useEffect } from 'react'
import { Renderer, type Scene } from './Renderer'
import { inputManager } from './InputManager'

// ── Module-level exports ──
// These are set when the component mounts and cleared on unmount.
// Other modules (scenes, etc.) can import these to access the renderer and canvas.

let _renderer: Renderer | null = null
let _canvas: HTMLCanvasElement | null = null

/** Get the current Renderer instance (null if not mounted). */
export function getRenderer(): Renderer | null {
  return _renderer
}

/** Get the current canvas element (null if not mounted). */
export function getCanvas(): HTMLCanvasElement | null {
  return _canvas
}

/** Convenience: set the active scene on the renderer. */
export function setActiveScene(scene: Scene): void {
  if (_renderer) {
    _renderer.setScene(scene)
  } else {
    console.warn('[GameCanvas] Cannot set scene: renderer not initialized')
  }
}

// ── Props ──
interface GameCanvasProps {
  /** Optional: initial scene to load when the canvas mounts */
  initialScene?: Scene
  /** Optional: callback when the renderer is ready */
  onReady?: (renderer: Renderer) => void
}

const GameCanvas: React.FC<GameCanvasProps> = ({ initialScene, onReady }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // ── Initialize Renderer ──
    const renderer = new Renderer(canvas)
    _renderer = renderer
    _canvas = canvas

    // ── Initial resize ──
    renderer.resize()

    // ── Initialize InputManager ──
    inputManager.init(canvas)

    // ── Set initial scene if provided ──
    if (initialScene) {
      renderer.setScene(initialScene)
    }

    // ── Start render loop ──
    renderer.start()

    // ── Notify parent ──
    if (onReady) {
      onReady(renderer)
    }

    // ── Handle window resize ──
    const handleResize = (): void => {
      renderer.resize()
    }
    window.addEventListener('resize', handleResize)

    // ── Cleanup on unmount ──
    return () => {
      renderer.stop()
      inputManager.destroy()
      window.removeEventListener('resize', handleResize)
      _renderer = null
      _canvas = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
        imageRendering: 'pixelated',
        cursor: 'default',
        background: '#1a1208',
      }}
    />
  )
}

export default GameCanvas
