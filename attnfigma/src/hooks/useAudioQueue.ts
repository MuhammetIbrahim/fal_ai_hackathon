import { useRef, useCallback, useEffect } from 'react'

/**
 * Audio URL queue — gelen sesleri sirayla calar.
 * Bir ses bitince sonraki baslar.
 */
export function useAudioQueue() {
  const queueRef = useRef<string[]>([])
  const playingRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const playNext = useCallback(() => {
    if (playingRef.current || queueRef.current.length === 0) return

    const url = queueRef.current.shift()!
    playingRef.current = true

    const audio = new Audio(url)
    audioRef.current = audio
    audio.volume = 1.0

    audio.onended = () => {
      playingRef.current = false
      audioRef.current = null
      playNext()
    }

    audio.onerror = () => {
      console.warn('[AudioQueue] Playback error, skipping:', url)
      playingRef.current = false
      audioRef.current = null
      playNext()
    }

    audio.play().catch((err) => {
      console.warn('[AudioQueue] Play blocked:', err.message)
      playingRef.current = false
      audioRef.current = null
      playNext()
    })
  }, [])

  const enqueue = useCallback((url: string) => {
    queueRef.current.push(url)
    playNext()
  }, [playNext])

  const stop = useCallback(() => {
    queueRef.current = []
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    playingRef.current = false
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [])

  return { enqueue, stop }
}
