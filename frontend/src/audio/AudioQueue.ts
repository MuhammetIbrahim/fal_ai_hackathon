class AudioQueue {
  private queue: string[] = []
  private currentAudio: HTMLAudioElement | null = null
  private playing = false
  private volume = 1.0
  private unlocked = false
  private maxQueueSize = 10  // Audio is synced with TTS, queue rarely fills up
  private fadeMs = 300  // Fade-in/out duration in ms

  /**
   * Unlock audio playback. Must be called from a user gesture (click/tap).
   * Creates and resumes an AudioContext to satisfy browser autoplay policy.
   */
  unlock(): void {
    if (this.unlocked) return
    try {
      const ctx = new AudioContext()
      ctx.resume().then(() => ctx.close())
      // Also play a silent audio element to warm up HTMLAudioElement path
      const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=')
      silent.volume = 0
      silent.play().then(() => silent.pause()).catch(() => {})
      this.unlocked = true
    } catch {
      // Best-effort
    }
  }

  /**
   * Add an audio URL to the end of the queue.
   * If nothing is currently playing, playback starts automatically.
   * Drops oldest queued items if the queue gets too large.
   */
  enqueue(url: string): void {
    // Drop old queued (not currently playing) items if queue is full
    while (this.queue.length >= this.maxQueueSize) {
      this.queue.shift()
    }
    this.queue.push(url)

    // Auto-start if idle
    if (!this.playing) {
      this.play()
    }
  }

  /**
   * Start playing from the queue.
   * If already playing, this is a no-op.
   */
  play(): void {
    if (this.playing) return
    this.playNext()
  }

  /**
   * Stop current playback and clear the entire queue.
   * Fades out current audio before stopping.
   */
  stop(): void {
    this.queue = []

    if (this.currentAudio) {
      this.fadeOut(this.currentAudio, () => {
        this.playing = false
        this.currentAudio = null
      })
    } else {
      this.playing = false
    }
  }

  /**
   * Clear the pending queue but let the current audio finish naturally.
   * Useful for phase transitions — don't abruptly cut audio but stop queueing more.
   */
  clearQueue(): void {
    this.queue = []
  }

  /**
   * Check if audio is currently playing.
   */
  isPlaying(): boolean {
    return this.playing
  }

  /**
   * Set the playback volume.
   * @param vol - A number between 0 (muted) and 1 (full volume).
   */
  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol))

    if (this.currentAudio) {
      this.currentAudio.volume = this.volume
    }
  }

  // ── Private ──

  private playNext(): void {
    // Nothing left in the queue
    if (this.queue.length === 0) {
      this.playing = false
      this.currentAudio = null
      return
    }

    this.playing = true
    const url = this.queue.shift()!

    const audio = new Audio(url)
    audio.volume = 0  // Start silent for fade-in
    this.currentAudio = audio

    audio.addEventListener('ended', this.handleEnded)
    audio.addEventListener('error', this.handleError)

    audio.play().then(() => {
      // Fade in
      this.fadeIn(audio)
    }).catch((err) => {
      console.error('[AudioQueue] Playback failed:', err)
      this.handleEnded()
    })
  }

  private handleEnded = (): void => {
    // Clean up current
    if (this.currentAudio) {
      this.currentAudio.removeEventListener('ended', this.handleEnded)
      this.currentAudio.removeEventListener('error', this.handleError)
      this.currentAudio = null
    }

    // Advance to next in queue
    this.playNext()
  }

  private handleError = (event: Event | string): void => {
    console.error('[AudioQueue] Audio error:', event)
    this.handleEnded()
  }

  /** Fade audio volume from 0 to target over fadeMs */
  private fadeIn(audio: HTMLAudioElement): void {
    const target = this.volume
    const steps = 10
    const stepMs = this.fadeMs / steps
    const increment = target / steps
    let current = 0

    const interval = setInterval(() => {
      current += increment
      if (current >= target) {
        audio.volume = target
        clearInterval(interval)
      } else {
        audio.volume = current
      }
    }, stepMs)
  }

  /** Fade audio volume to 0 then call onDone */
  private fadeOut(audio: HTMLAudioElement, onDone: () => void): void {
    const steps = 10
    const stepMs = this.fadeMs / steps
    const decrement = audio.volume / steps
    let current = audio.volume

    const interval = setInterval(() => {
      current -= decrement
      if (current <= 0.01) {
        audio.volume = 0
        clearInterval(interval)
        audio.pause()
        audio.removeAttribute('src')
        audio.load()
        onDone()
      } else {
        audio.volume = current
      }
    }, stepMs)
  }
}

export const audioQueue = new AudioQueue()
