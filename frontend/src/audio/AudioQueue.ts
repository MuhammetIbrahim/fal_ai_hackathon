class AudioQueue {
  private queue: string[] = []
  private currentAudio: HTMLAudioElement | null = null
  private playing = false
  private volume = 1.0
  private unlocked = false

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
   */
  enqueue(url: string): void {
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
   */
  stop(): void {
    this.playing = false
    this.queue = []

    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.removeAttribute('src')
      this.currentAudio.load() // release resources
      this.currentAudio = null
    }
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
    audio.volume = this.volume
    this.currentAudio = audio

    audio.addEventListener('ended', this.handleEnded)
    audio.addEventListener('error', this.handleError)

    audio.play().catch((err) => {
      console.error('[AudioQueue] Playback failed:', err)
      // Skip to next track on failure
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
    // Treat error like end -- skip to next
    this.handleEnded()
  }
}

export const audioQueue = new AudioQueue()
