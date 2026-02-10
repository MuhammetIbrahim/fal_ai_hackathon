import { useRef, useState, useCallback, useEffect } from 'react'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

type EventHandler = (data: Record<string, unknown>) => void

interface UseWebSocketReturn {
  status: ConnectionStatus
  connect: (gameId: string, playerId: string) => void
  disconnect: () => void
  send: (event: string, data: Record<string, unknown>) => void
  onEvent: (eventName: string, handler: EventHandler) => () => void
}

const WS_BASE = '/ws'
const HEARTBEAT_INTERVAL = 30_000
const RECONNECT_DELAY = 3000

export function useWebSocket(): UseWebSocketReturn {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const wsRef = useRef<WebSocket | null>(null)
  const handlersRef = useRef<Map<string, Set<EventHandler>>>(new Map())
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const paramsRef = useRef<{ gameId: string; playerId: string } | null>(null)

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (reconnectRef.current) {
      clearTimeout(reconnectRef.current)
      reconnectRef.current = null
    }
  }, [])

  const dispatch = useCallback((event: string, data: Record<string, unknown>) => {
    const handlers = handlersRef.current.get(event)
    if (handlers) {
      handlers.forEach(h => h(data))
    }
    // Also dispatch to '*' wildcard listeners
    const wildcardHandlers = handlersRef.current.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach(h => h({ event, data }))
    }
  }, [])

  const connectWs = useCallback((gameId: string, playerId: string) => {
    // Close existing connection
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    clearTimers()

    paramsRef.current = { gameId, playerId }
    setStatus('connecting')

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const url = `${protocol}//${host}${WS_BASE}/${gameId}/${playerId}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setStatus('connected')
      console.log(`[WS] Connected: ${gameId}/${playerId}`)

      // Start heartbeat
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'heartbeat', data: { timestamp: Date.now() } }))
        }
      }, HEARTBEAT_INTERVAL)
    }

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data)
        if (msg.event) {
          console.log(`[WS] Event: ${msg.event}`, msg.data)
          dispatch(msg.event, msg.data ?? {})
        }
      } catch {
        console.warn('[WS] Failed to parse message:', evt.data)
      }
    }

    ws.onclose = () => {
      setStatus('disconnected')
      clearTimers()
      console.log('[WS] Disconnected')

      // Auto-reconnect if we have params
      if (paramsRef.current) {
        reconnectRef.current = setTimeout(() => {
          if (paramsRef.current) {
            console.log('[WS] Reconnecting...')
            connectWs(paramsRef.current.gameId, paramsRef.current.playerId)
          }
        }, RECONNECT_DELAY)
      }
    }

    ws.onerror = (err) => {
      console.error('[WS] Error:', err)
    }
  }, [clearTimers, dispatch])

  const disconnectWs = useCallback(() => {
    paramsRef.current = null // Prevent auto-reconnect
    clearTimers()
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    setStatus('disconnected')
  }, [clearTimers])

  const send = useCallback((event: string, data: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ event, data }))
    } else {
      console.warn(`[WS] Cannot send "${event}" — not connected`)
    }
  }, [])

  const onEvent = useCallback((eventName: string, handler: EventHandler): (() => void) => {
    if (!handlersRef.current.has(eventName)) {
      handlersRef.current.set(eventName, new Set())
    }
    handlersRef.current.get(eventName)!.add(handler)

    // Return unsubscribe function
    return () => {
      handlersRef.current.get(eventName)?.delete(handler)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      paramsRef.current = null
      clearTimers()
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [clearTimers])

  return { status, connect: connectWs, disconnect: disconnectWs, send, onEvent }
}
