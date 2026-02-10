import React, { useState, useEffect } from 'react'
import { GameProvider, useGame } from '../context/GameContext'
import { LobbyScene } from './LobbyScene'
import { MorningScene } from './MorningScene'
import { CampfireScene } from './CampfireScene'
import { FreeRoamScene } from './FreeRoamScene'
import { HouseScene } from './HouseScene'
import { VoteScene } from './VoteScene'
import { ExileScene } from './ExileScene'
import { GameOverScene } from './GameOverScene'

const SceneSwitch: React.FC = () => {
  const { phase } = useGame()
  const [visible, setVisible] = useState(true)
  const [currentPhase, setCurrentPhase] = useState(phase)

  // Fade gecis
  useEffect(() => {
    if (phase !== currentPhase) {
      setVisible(false)
      const t = setTimeout(() => {
        setCurrentPhase(phase)
        setVisible(true)
      }, 500)
      return () => clearTimeout(t)
    }
  }, [phase, currentPhase])

  const renderScene = () => {
    switch (currentPhase) {
      case 'lobby':          return <LobbyScene />
      case 'morning':        return <MorningScene />
      case 'campfire_open':  return <CampfireScene />
      case 'campfire_close': return <CampfireScene />
      case 'free_roam':      return <FreeRoamScene />
      case 'house':          return <HouseScene />
      case 'vote':           return <VoteScene />
      case 'exile':          return <ExileScene />
      case 'game_over':      return <GameOverScene />
      default:               return <LobbyScene />
    }
  }

  return (
    <div className="w-screen h-screen relative overflow-hidden bg-bg-dark">
      {/* Fog overlay */}
      <div className="absolute inset-0 z-50 pointer-events-none opacity-10 bg-white/5 mix-blend-overlay" />

      {/* Scene with fade */}
      <div className={`w-full h-full transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        {renderScene()}
      </div>
    </div>
  )
}

export const SceneRouter: React.FC = () => {
  return (
    <GameProvider>
      <SceneSwitch />
    </GameProvider>
  )
}
