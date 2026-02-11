import { useEffect, useRef, useCallback } from 'react'
import { useGameStore } from './state/GameStore'
import { Renderer } from './engine/Renderer'
import { inputManager } from './engine/InputManager'
import { Camera } from './engine/Camera'
import { sceneManager } from './scenes/SceneManager'
import { LobbyScene } from './scenes/LobbyScene'
import { MorningScene } from './scenes/MorningScene'
import { CampfireScene } from './scenes/CampfireScene'
import { FreeRoamScene } from './scenes/FreeRoamScene'
import { HouseScene } from './scenes/HouseScene'
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
    sceneManager.registerScene('campfire', new CampfireScene())
    sceneManager.registerScene('day', new FreeRoamScene())
    sceneManager.registerScene('houses', new HouseScene())
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

    return () => {
      renderer?.stop()
      inputManager.destroy()
      window.removeEventListener('resize', handleResize)
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
