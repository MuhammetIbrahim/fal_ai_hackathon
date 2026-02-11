import { API_BASE } from '../utils/constants'

// ── Helpers ──

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE}${path}`

  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!res.ok) {
    let detail = ''
    try {
      const body = await res.json()
      if (Array.isArray(body.detail)) {
        detail = body.detail.map((d: any) => d.msg ?? JSON.stringify(d)).join('; ')
      } else {
        detail = body.detail ?? body.message ?? JSON.stringify(body)
      }
    } catch {
      detail = res.statusText
    }
    throw new Error(`${detail}`)
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T
  }

  return res.json() as Promise<T>
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' })
}

function post<T>(path: string, body?: Record<string, unknown>): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  })
}

// ── Game endpoints ──

export function createGame(): Promise<{ game_id: string; world_brief: string }> {
  return post('/game/')
}

export function getGameState(gameId: string): Promise<any> {
  return get(`/game/${gameId}`)
}

export function startGame(gameId: string): Promise<any> {
  return post(`/game/${gameId}/start`)
}

export function getGameLog(gameId: string): Promise<any> {
  return get(`/game/${gameId}/log`)
}

// ── Lobby endpoints ──

export function createLobby(hostName: string, maxPlayers = 6, aiCount = 4, dayLimit = 5): Promise<{ lobby_code: string; host: string; status: string }> {
  return post('/lobby/', {
    host_name: hostName,
    max_players: maxPlayers,
    ai_count: aiCount,
    day_limit: dayLimit,
  })
}

export function getLobbyStatus(code: string): Promise<any> {
  return get(`/lobby/${code}`)
}

export function joinLobby(code: string, playerName: string): Promise<{ slot_id: string; lobby_code: string; player_name: string }> {
  return post(`/lobby/${code}/join`, { player_name: playerName })
}

export function startLobby(code: string, hostName: string): Promise<{ game_id: string }> {
  return post(`/lobby/${code}/start?host_name=${encodeURIComponent(hostName)}`)
}

export function listLobbies(): Promise<any[]> {
  return get('/lobby/')
}
