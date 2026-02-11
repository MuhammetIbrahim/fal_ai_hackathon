import { useGameStore } from '../state/GameStore'
import { HEARTBEAT_INTERVAL, RECONNECT_INTERVAL } from '../utils/constants'

const MAX_RETRIES = 5

class WebSocketManager {
  private ws: WebSocket | null = null
  private gameId: string | null = null
  private playerId: string | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private intentionalClose = false

  /**
   * Establish a WebSocket connection to the game server.
   */
  connect(gameId: string, playerId: string): void {
    // If already connected with the same params, skip
    if (
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      this.gameId === gameId &&
      this.playerId === playerId
    ) {
      return
    }

    // Clean up any existing connection first
    this.cleanup()

    this.gameId = gameId
    this.playerId = playerId
    this.intentionalClose = false
    this.retryCount = 0

    this.createConnection()
  }

  /**
   * Disconnect from the server intentionally.
   */
  disconnect(): void {
    this.intentionalClose = true
    this.cleanup()
    useGameStore.getState().setConnected(false)
  }

  /**
   * Send a message to the server.
   */
  send(event: string, data: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WS] Cannot send, WebSocket is not open. Event:', event)
      return
    }

    const message = JSON.stringify({ event, data })
    this.ws.send(message)
  }

  /**
   * Check if the WebSocket connection is currently open.
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN
  }

  // ── Private ──

  private createConnection(): void {
    if (!this.gameId || !this.playerId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/ws/${this.gameId}/${this.playerId}`

    console.log('[WS] Connecting to', url)

    try {
      this.ws = new WebSocket(url)
    } catch (err) {
      console.error('[WS] Failed to create WebSocket:', err)
      this.scheduleReconnect()
      return
    }

    this.ws.onopen = this.handleOpen
    this.ws.onmessage = this.handleMessage
    this.ws.onclose = this.handleClose
    this.ws.onerror = this.handleError
  }

  private handleOpen = (): void => {
    console.log('[WS] Connected')
    this.retryCount = 0
    useGameStore.getState().setConnected(true)
    this.startHeartbeat()
  }

  private handleMessage = (event: MessageEvent): void => {
    try {
      const parsed = JSON.parse(event.data) as { event: string; data: Record<string, unknown> }
      const { event: eventName, data } = parsed
      console.log('[WS] Event received:', eventName, data)
      useGameStore.getState().handleEvent(eventName, data)
    } catch (err) {
      console.error('[WS] Failed to parse message:', event.data, err)
    }
  }

  private handleClose = (event: CloseEvent): void => {
    console.log('[WS] Connection closed. Code:', event.code, 'Reason:', event.reason)
    this.stopHeartbeat()
    useGameStore.getState().setConnected(false)

    if (!this.intentionalClose) {
      this.scheduleReconnect()
    }
  }

  private handleError = (event: Event): void => {
    console.error('[WS] Error:', event)
    // The onclose handler will fire after onerror, so reconnect logic is handled there.
  }

  private startHeartbeat(): void {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      this.send('heartbeat', { timestamp: Date.now() })
    }, HEARTBEAT_INTERVAL)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      console.warn('[WS] Max reconnect retries reached. Giving up.')
      useGameStore.getState().setNotification({
        message: 'Sunucuya bağlanılamıyor. Lütfen sayfayı yenileyin.',
        type: 'error',
      })
      return
    }

    this.retryCount++
    console.log(`[WS] Reconnecting in ${RECONNECT_INTERVAL}ms (attempt ${this.retryCount}/${MAX_RETRIES})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.createConnection()
    }, RECONNECT_INTERVAL)
  }

  private cleanup(): void {
    this.stopHeartbeat()

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      // Remove listeners to avoid triggering reconnect from cleanup
      this.ws.onopen = null
      this.ws.onmessage = null
      this.ws.onclose = null
      this.ws.onerror = null

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close()
      }

      this.ws = null
    }
  }
}

export const wsManager = new WebSocketManager()
