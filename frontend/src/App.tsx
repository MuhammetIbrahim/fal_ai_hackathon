import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from './state/GameStore'
import { Renderer } from './engine/Renderer'
import { inputManager } from './engine/InputManager'
import { Camera } from './engine/Camera'
import { sceneManager } from './scenes/SceneManager'
import { LobbyScene } from './scenes/LobbyScene'
import { MorningScene } from './scenes/MorningScene'
import { VillageMapScene } from './scenes/VillageMapScene'
import { FreeRoamScene } from './scenes/FreeRoamScene'
import { InstitutionScene } from './scenes/InstitutionScene'
import { VoteScene } from './scenes/VoteScene'
import { NightScene } from './scenes/NightScene'
import { ExileScene } from './scenes/ExileScene'
import { GameOverScene } from './scenes/GameOverScene'
import { UIRoot } from './ui/UIRoot'
import type { Phase } from './state/types'

// Shared camera instance
export const camera = new Camera()

// Shared renderer (set after canvas mount)
let renderer: Renderer | null = null
export function getRenderer() { return renderer }

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phase = useGameStore((s) => s.phase)
  const prevPhaseRef = useRef<Phase>('lobby')

  // Initialize scenes once
  const initScenes = useCallback(() => {
    sceneManager.registerScene('lobby', new LobbyScene())
    sceneManager.registerScene('morning', new MorningScene())
    const villageScene = new VillageMapScene()
    sceneManager.registerScene('campfire', villageScene)
    sceneManager.registerScene('day', new FreeRoamScene())
    sceneManager.registerScene('houses', villageScene)
    sceneManager.registerScene('vote', new VoteScene())
    sceneManager.registerScene('night', new NightScene())
    sceneManager.registerScene('exile', new ExileScene())
    sceneManager.registerScene('game_over', new GameOverScene())
  }, [])

  // Canvas setup
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Init renderer
    renderer = new Renderer(canvas)
    renderer.resize()

    // Init input
    inputManager.init(canvas)

    // Init camera
    camera.resize(canvas.width, canvas.height)

    // Init scenes
    initScenes()

    // Start with lobby scene
    sceneManager.switchTo('lobby')
    renderer.setScene(sceneManager)

    // Start render loop
    renderer.start()

    // Handle resize
    const handleResize = () => {
      renderer?.resize()
      camera.resize(canvas.width, canvas.height)
    }
    window.addEventListener('resize', handleResize)

    // Canvas click → forward to active scene (for VillageMapScene room selection)
    const handleCanvasClick = (e: MouseEvent) => {
      const dpr = window.devicePixelRatio || 1
      const scene = sceneManager.getCurrentScene()
      if (scene && 'handleClick' in scene) {
        (scene as { handleClick: (x: number, y: number) => void }).handleClick(
          e.offsetX * dpr,
          e.offsetY * dpr,
        )
      }
    }
    canvas.addEventListener('click', handleCanvasClick)

    return () => {
      renderer?.stop()
      inputManager.destroy()
      window.removeEventListener('resize', handleResize)
      canvas.removeEventListener('click', handleCanvasClick)
      renderer = null
    }
  }, [initScenes])

  // Handle phase changes -> switch scenes
  useEffect(() => {
    if (phase !== prevPhaseRef.current) {
      prevPhaseRef.current = phase
      sceneManager.switchTo(phase)
    }
  }, [phase])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Canvas layer — game world */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          imageRendering: 'pixelated',
        }}
      />

      {/* UI overlay layer — React DOM */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <UIRoot />
      </div>
    </div>
  )
}

export default App
