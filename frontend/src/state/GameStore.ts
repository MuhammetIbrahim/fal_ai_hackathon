import { create } from 'zustand'
import type {
  Phase, Player, Omen, Speech, LocationDecision, HouseVisit,
  ExileResult, NightResult, SpotlightCard, Sinama, OcakTepki,
  Proposal, SozBorcu, UIObject, InputAction, GameOverData, EventCard, ActiveEffect,
  WorldEvent,
} from './types'
import { audioQueue } from '../audio/AudioQueue'

export interface GameStore {
  // Connection
  gameId: string | null
  playerId: string | null
  lobbyCode: string | null
  connected: boolean

  // Game state
  phase: Phase
  round: number
  dayLimit: number
  players: Player[]
  myName: string | null

  // Phase data
  morningText: string
  omens: Omen[]
  speeches: Speech[]
  locationDecisions: LocationDecision[]
  houseVisits: HouseVisit[]
  votes: Record<string, string>
  exileResult: ExileResult | null
  nightResult: NightResult | null
  gameOver: GameOverData | null

  // Layer features
  spotlightCards: SpotlightCard[]
  sinama: Sinama | null
  ocakTepki: OcakTepki | null
  uiObjects: Record<string, UIObject>
  proposal: Proposal | null
  sozBorcu: SozBorcu | null
  baskiTarget: string | null
  canUseKalkan: boolean

  // Village map state
  selectedRoom: string | null      // 'campfire' | player name (house owner) | null
  playerLocations: Record<string, string>  // name → 'campfire' | 'home' | 'visiting:TargetName'
  sceneBackgrounds: Record<string, string>  // campfire, village, house_interior, night → URL

  // Character inspection
  inspectedPlayer: string | null  // player name when clicking a character on the map

  // UI control
  inputRequired: InputAction | null
  notification: { message: string; type: 'info' | 'warning' | 'error' } | null
  transitioning: boolean
  showParchment: boolean
  eventCard: EventCard | null  // Critical event display
  activeWorldEvents: WorldEvent[]  // Living Event System

  // Actions
  setConnection: (gameId: string, playerId: string) => void
  setLobbyCode: (code: string) => void
  setConnected: (connected: boolean) => void
  setPhase: (phase: Phase) => void
  setPlayers: (players: Player[]) => void
  setMyName: (name: string) => void
  setMorningText: (text: string) => void
  setOmens: (omens: Omen[]) => void
  addSpeech: (speech: Speech) => void
  clearSpeeches: () => void
  setHouseVisits: (visits: HouseVisit[]) => void
  addVote: (voter: string, target: string) => void
  clearVotes: () => void
  setExileResult: (result: ExileResult | null) => void
  setNightResult: (result: NightResult | null) => void
  setGameOver: (data: GameOverData | null) => void
  setSpotlightCards: (cards: SpotlightCard[]) => void
  setSinama: (sinama: Sinama | null) => void
  setOcakTepki: (tepki: OcakTepki | null) => void
  setProposal: (proposal: Proposal | null) => void
  setSelectedRoom: (room: string | null) => void
  setPlayerLocations: (locs: Record<string, string>) => void
  setInspectedPlayer: (name: string | null) => void
  setInputRequired: (input: InputAction | null) => void
  setNotification: (notification: { message: string; type: 'info' | 'warning' | 'error' } | null) => void
  setTransitioning: (transitioning: boolean) => void
  setShowParchment: (show: boolean) => void
  setRound: (round: number) => void
  setEventCard: (card: EventCard | null) => void
  setActiveWorldEvents: (events: WorldEvent[]) => void
  addPlayerEffect: (playerName: string, effect: ActiveEffect) => void
  removePlayerEffect: (playerName: string, effectId: string) => void
  clearPlayerEffects: (playerName: string) => void

  handleEvent: (event: string, data: Record<string, unknown>) => void
  reset: () => void
}

const initialState = {
  gameId: null,
  playerId: null,
  lobbyCode: null,
  connected: false,
  phase: 'lobby' as Phase,
  round: 0,
  dayLimit: 5,
  players: [],
  myName: null,
  morningText: '',
  omens: [],
  speeches: [],
  locationDecisions: [],
  houseVisits: [],
  votes: {},
  exileResult: null,
  nightResult: null,
  gameOver: null,
  spotlightCards: [],
  sinama: null,
  ocakTepki: null,
  uiObjects: {},
  proposal: null,
  sozBorcu: null,
  baskiTarget: null,
  canUseKalkan: false,
  selectedRoom: 'campfire' as string | null,
  playerLocations: {} as Record<string, string>,
  sceneBackgrounds: {} as Record<string, string>,
  inspectedPlayer: null as string | null,
  inputRequired: null,
  notification: null,
  transitioning: false,
  showParchment: false,
  eventCard: null,
  activeWorldEvents: [],
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setConnection: (gameId, playerId) => set({ gameId, playerId }),
  setLobbyCode: (code) => set({ lobbyCode: code }),
  setConnected: (connected) => set({ connected }),
  setPhase: (phase) => set({ phase }),
  setPlayers: (players) => set({ players }),
  setMyName: (name) => set({ myName: name }),
  setMorningText: (text) => set({ morningText: text }),
  setOmens: (omens) => set({ omens }),
  addSpeech: (speech) => set((s) => ({ speeches: [...s.speeches, speech] })),
  clearSpeeches: () => set({ speeches: [] }),
  setHouseVisits: (visits) => set({ houseVisits: visits }),
  addVote: (voter, target) => set((s) => ({ votes: { ...s.votes, [voter]: target } })),
  clearVotes: () => set({ votes: {} }),
  setExileResult: (result) => set({ exileResult: result }),
  setNightResult: (result) => set({ nightResult: result }),
  setGameOver: (data) => set({ gameOver: data }),
  setSpotlightCards: (cards) => set({ spotlightCards: cards }),
  setSinama: (sinama) => set({ sinama }),
  setOcakTepki: (tepki) => set({ ocakTepki: tepki }),
  setProposal: (proposal) => set({ proposal }),
  setSelectedRoom: (room) => {
    const prev = get().selectedRoom
    if (prev === room) return
    // Stop old room's audio, switch, then play new room's latest audio
    audioQueue.stop()
    set({ selectedRoom: room })
    // Find the last speech with audio_url in the new room and play it
    const state = get()
    if (!room || room === 'campfire') {
      const last = [...state.speeches].reverse().find(s => s.audio_url)
      if (last?.audio_url) audioQueue.enqueue(last.audio_url)
    } else {
      // room is a visit_id
      const visit = state.houseVisits.find(hv => hv.visit_id === room)
      if (visit) {
        const last = [...visit.speeches].reverse().find(s => s.audio_url)
        if (last?.audio_url) audioQueue.enqueue(last.audio_url)
      }
    }
  },
  setPlayerLocations: (locs) => set({ playerLocations: locs }),
  setInspectedPlayer: (name) => set({ inspectedPlayer: name }),
  setInputRequired: (input) => set({ inputRequired: input }),
  setNotification: (notification) => set({ notification }),
  setTransitioning: (transitioning) => set({ transitioning }),
  setShowParchment: (show) => set({ showParchment: show }),
  setRound: (round) => set({ round }),
  
  setEventCard: (card) => set({ eventCard: card }),
  
  setActiveWorldEvents: (events) => set({ activeWorldEvents: events }),
  
  addPlayerEffect: (playerName, effect) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.name === playerName
          ? { ...p, active_effects: [...(p.active_effects || []), effect] }
          : p
      ),
    }))
  },
  
  removePlayerEffect: (playerName, effectId) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.name === playerName
          ? { ...p, active_effects: (p.active_effects || []).filter((e) => e.id !== effectId) }
          : p
      ),
    }))
  },
  
  clearPlayerEffects: (playerName) => {
    set((state) => ({
      players: state.players.map((p) =>
        p.name === playerName ? { ...p, active_effects: [] } : p
      ),
    }))
  },

  handleEvent: (event: string, data: Record<string, unknown>) => {
    const store = get()

    switch (event) {
      case 'connected':
        set({ connected: true })
        break

      case 'player_connected':
      case 'player_disconnected':
        if (data.active_players) {
          // Update player alive status based on active players
        }
        break

      case 'phase_change': {
        const rawPhase = data.phase as string
        // Map backend phase names to frontend phase names
        const phaseMap: Record<string, Phase> = {
          campfire_open: 'campfire',
          campfire_close: 'campfire',
        }
        const phase = (phaseMap[rawPhase] ?? rawPhase) as Phase
        const round = (data.round as number) ?? store.round

        // Update players if provided in phase_change payload
        if (data.players) {
          const incomingPlayers = data.players as Player[]
          const existingPlayers = store.players
          const mergedPlayers = incomingPlayers.map((incoming) => {
            const existing = existingPlayers.find((p) => p.slot_id === incoming.slot_id)
            if (existing) {
              return { ...existing, ...incoming, x: incoming.x ?? existing.x, y: incoming.y ?? existing.y, color: incoming.color ?? existing.color }
            }
            return incoming
          })
          set({ players: mergedPlayers })
        }

        // Only reset on actual phase TRANSITIONS (not sub-phases within campfire)
        const isSubPhase = rawPhase === 'campfire_close'
        const isNewPhase = phase !== store.phase

        // Notify Renderer to update background for the new phase
        if (isNewPhase) {
          window.dispatchEvent(
            new CustomEvent('phase-background-change', {
              detail: { phase, sceneBackgrounds: store.sceneBackgrounds },
            }),
          )
        }

        set({
          phase,
          round,
          transitioning: isNewPhase, // Only show transition for real phase changes
          inputRequired: null,
        })

        // Stop stale audio only on real phase transitions
        if (isNewPhase) {
          audioQueue.stop()
        }

        // Clear phase-specific data on phase change
        if (phase === 'morning' && isNewPhase) {
          set({ speeches: [], votes: {}, exileResult: null, houseVisits: [], spotlightCards: [], sinama: null })
        }
        if (phase === 'campfire' && !isSubPhase) {
          // Only reset on campfire_open (first entry), NOT on campfire_close
          const allAtCampfire: Record<string, string> = {}
          for (const p of store.players) allAtCampfire[p.name] = 'campfire'
          set({ playerLocations: allAtCampfire, selectedRoom: 'campfire', houseVisits: [], showParchment: false })
        }
        if (phase === 'campfire' && isSubPhase) {
          // campfire_close: everyone returns to campfire but KEEP houseVisits and speeches
          const allAtCampfire: Record<string, string> = {}
          for (const p of store.players) allAtCampfire[p.name] = 'campfire'
          set({ playerLocations: allAtCampfire, selectedRoom: 'campfire' })
        }
        if (phase === 'vote') {
          set({ votes: {} })
        }
        // Auto clear transition after delay
        if (isNewPhase) {
          setTimeout(() => set({ transitioning: false }), 2000)
        }
        break
      }

      case 'morning':
        set({
          morningText: (data.content as string) ?? '',
          omens: (data.omens as Omen[]) ?? [],
          showParchment: true,
        })
        break

      case 'spotlight_cards':
        set({
          spotlightCards: (data.cards as SpotlightCard[]) ?? [],
        })
        break

      case 'free_roam_start':
        // Free roam is part of campfire flow — keep phase, show notification
        // Add a separator in the campfire chat to mark the segment
        store.addSpeech({
          speaker: '---',
          content: `--- Serbest Dolasim ${data.roam_round ?? ''}/${data.total_roam_rounds ?? ''} ---`,
        })
        set({
          notification: {
            message: `Serbest Dolaşım ${data.roam_round ?? ''}/${data.total_roam_rounds ?? ''}`,
            type: 'info',
          },
        })
        setTimeout(() => set({ notification: null }), 3000)
        break

      case 'location_decisions': {
        const decisions = (data.decisions as LocationDecision[]) ?? []
        const locs: Record<string, string> = {}
        for (const d of decisions) {
          if (d.choice === 'CAMPFIRE') locs[d.player] = 'campfire'
          else if (d.choice === 'HOME') locs[d.player] = 'home'
          else if (d.choice.startsWith('VISIT|')) locs[d.player] = `visiting:${d.choice.split('|')[1]}`
          else if (d.choice.startsWith('INSTITUTION|')) locs[d.player] = `institution:${d.choice.split('|')[1]}`
          else locs[d.player] = 'campfire'
        }
        set({ playerLocations: locs, locationDecisions: decisions })
        break
      }

      case 'mini_event': {
        const message = (data.content as string) ?? 'Bir olay oldu'
        set({
          notification: { message, type: 'info' },
        })
        setTimeout(() => set({ notification: null }), 5000)
        
        // If event has effect metadata, add it to player
        if (data.target_player && data.effect_type && data.effect_name) {
          const effect: ActiveEffect = {
            id: `effect_${Date.now()}_${Math.random()}`,
            type: data.effect_type as string,
            name: data.effect_name as string,
            description: data.effect_description as string || '',
            consequence_text: data.consequence_text as string || '',
            duration: data.duration as number || 1,
            source: 'mini_event',
          }
          store.addPlayerEffect(data.target_player as string, effect)
          
          // Show critical event card if is_critical flag is true
          if (data.is_critical) {
            store.setEventCard({
              id: `event_${Date.now()}`,
              event_type: 'mini_event',
              title: data.event_title as string || 'Olaylar',
              description: message,
              icon: data.icon as string || '⚠️',
              severity: data.severity as 'low' | 'medium' | 'high' | 'critical' || 'medium',
              target_player: data.target_player as string,
              effect_type: data.effect_type as string,
              consequence_text: data.consequence_text as string || '',
            })
          }
        }
        break
      }

      case 'morning_crisis':
        set({
          notification: {
            message: (data.crisis_text as string) ?? 'Büyük kriz!',
            type: 'warning',
          },
        })
        setTimeout(() => set({ notification: null }), 6000)
        break

      case 'world_events_update': {
        const events = (data.active_events as WorldEvent[]) ?? []
        store.setActiveWorldEvents(events)
        break
      }

      case 'sinama_echo':
        store.addSpeech({
          speaker: 'Sınama',
          content: (data.content as string) ?? '',
        })
        break

      case 'kul_kaymasi':
        store.addSpeech({
          speaker: 'Ocak',
          content: `🔥 ${(data.question as string) ?? ''}`,
        })
        break

      case 'proposal_result':
        set({ proposal: null })
        break

      case 'soz_borcu':
        set({
          notification: {
            message: `Söz borcu: ${((data.forced_speakers as string[]) ?? []).join(', ')}`,
            type: 'warning',
          },
        })
        setTimeout(() => set({ notification: null }), 5000)
        break

      case 'home_alone':
        // Player stayed home alone — just a notification
        break

      case 'campfire_speech': {
        const cfAudioUrl = data.audio_url as string | undefined
        store.addSpeech({
          speaker: data.speaker as string,
          content: data.content as string,
          audio_url: cfAudioUrl,
        })
        // Audio senkron: text + audio birlikte geldi, hemen cal
        if (cfAudioUrl) {
          const currentRoom = store.selectedRoom ?? 'campfire'
          if (currentRoom === 'campfire') {
            audioQueue.enqueue(cfAudioUrl)
          }
        }
        break
      }

      case 'your_turn': {
        const { action_required, timeout_seconds, ...rest } = data
        set({
          inputRequired: {
            type: action_required as InputAction['type'],
            timeout_seconds: timeout_seconds as number | undefined,
            data: rest,
          },
        })
        break
      }

      case 'vote_confirmed':
        store.addVote(data.voter as string, data.target as string)
        break

      case 'exile': {
        const exiledName = (data.exiled as string) ?? ''
        
        set({
          exileResult: {
            exiled: exiledName,
            active_players: (data.active_players as string[]) ?? [],
            exiled_type: (data.exiled_type as string) ?? '',
            exiled_role: (data.exiled_role as string) ?? '',
          },
          votes: (data.votes as Record<string, string>) ?? store.votes,
          phase: 'exile',
        })
        
        // ── Lifecycle Cleanup: Elenen oyuncuya ait etkileri temizle ──
        if (exiledName) {
          // Oyuncunun kendi etkilerini temizle
          store.clearPlayerEffects(exiledName)
          
          // UI objelerini temizle (owner veya target bu oyuncu olanlar)
          set((state) => ({
            uiObjects: Object.fromEntries(
              Object.entries(state.uiObjects).filter(
                ([_, obj]) => {
                  const objData = obj as Record<string, unknown>
                  return objData.owner_id !== exiledName && objData.target_id !== exiledName
                }
              )
            ),
          }))
          
          console.log(`[Cleanup] ${exiledName} için UI cleanup tamamlandı`)
        }
        break
      }

      case 'game_over':
        set({
          gameOver: {
            winner: data.winner as 'et_can' | 'yanki_dogmus',
            players: (data.all_players as GameOverData['players']) ?? [],
          },
          phase: 'game_over',
        })
        break
      
      case 'remove_ui_object': {
        const objectId = data.object_id as string
        const reason = data.reason as string
        
        if (objectId) {
          set((state) => {
            const newUiObjects = { ...state.uiObjects }
            delete newUiObjects[objectId]
            return { uiObjects: newUiObjects }
          })
          
          console.log(`[Cleanup] UI object removed: ${objectId} (${reason})`)
        }
        break
      }

      case 'speech_audio': {
        const audioUrl = data.audio_url as string
        const audioContext = (data.context as string) ?? 'campfire'

        // Update the matching speech with audio_url
        if (audioContext === 'campfire') {
          set((s) => ({
            speeches: s.speeches.map((sp) =>
              sp.speaker === data.speaker
                ? { ...sp, audio_url: audioUrl }
                : sp
            ),
          }))
        }

        // Only play audio if it matches the currently selected room
        if (audioUrl) {
          const currentRoom = store.selectedRoom ?? 'campfire'
          let shouldPlay = false

          if (audioContext === 'campfire' && currentRoom === 'campfire') {
            shouldPlay = true
          } else if (audioContext.startsWith('visit:') && currentRoom !== 'campfire') {
            const parts = audioContext.split(':')
            const host = parts[1]
            const visitor = parts[2]
            if (currentRoom === host || currentRoom === visitor) {
              shouldPlay = true
            }
          } else if (audioContext.startsWith('institution:')) {
            // Institution audio always plays (narration for the visiting player)
            shouldPlay = true
          }

          if (shouldPlay) {
            audioQueue.enqueue(audioUrl)
          }
        }
        break
      }

      case 'ocak_tepki': {
        const tepki: OcakTepki = {
          type: data.type as OcakTepki['type'],
          message: data.message as string,
          target: data.target as string | undefined,
          target_player: data.target_player as string | undefined,
          effect_type: data.effect_type as string | undefined,
          consequence_text: data.consequence_text as string | undefined,
        }
        set({ ocakTepki: tepki })
        setTimeout(() => set({ ocakTepki: null }), 5000)
        
        // If reaction has effect metadata, add it to player
        if (data.target_player && data.effect_type && data.effect_name) {
          const effect: ActiveEffect = {
            id: `effect_${Date.now()}_${Math.random()}`,
            type: data.effect_type as string,
            name: data.effect_name as string,
            description: data.effect_description as string || '',
            consequence_text: data.consequence_text as string || '',
            duration: data.duration as number || 1,
            source: 'ocak_tepki',
          }
          store.addPlayerEffect(data.target_player as string, effect)
          
          // Show critical event card if is_critical flag is true
          if (data.is_critical) {
            store.setEventCard({
              id: `event_${Date.now()}`,
              event_type: 'ocak_tepki',
              title: data.event_title as string || 'Ocak Tepkisi',
              description: data.message as string,
              icon: data.icon as string || '🔥',
              severity: data.severity as 'low' | 'medium' | 'high' | 'critical' || 'high',
              target_player: data.target_player as string,
              effect_type: data.effect_type as string,
              consequence_text: data.consequence_text as string || '',
            })
          }
        }
        break
      }

      case 'house_visit':
      case 'house_visit_start': {
        const visitId = data.visit_id as string
        
        // visit_id zorunlu - yoksa event yoksay
        if (!visitId) {
          console.warn('[GameStore] house_visit_start: visit_id eksik, event yoksayıldı')
          break
        }
        
        // Aynı visit_id zaten varsa duplicate, yoksay
        const isDuplicate = store.houseVisits.some((v) => v.visit_id === visitId)
        if (isDuplicate) {
          console.warn(`[GameStore] house_visit_start: visit_id ${visitId} zaten var, duplicate event yoksayıldı`)
          break
        }
        
        const newVisit: HouseVisit = {
          visit_id: visitId,
          host: data.host as string,
          visitor: data.visitor as string,
          speeches: [],
          turn: 0,
        }
        set((s) => ({
          houseVisits: [...s.houseVisits, newVisit],
        }))
        break
      }

      case 'visit_speech':
      case 'house_visit_exchange': {
        const exVisitId = data.visit_id as string
        const visitAudioUrl = data.audio_url as string | undefined
        
        // visit_id zorunlu - yoksa event yoksay
        if (!exVisitId) {
          console.warn('[GameStore] house_visit_exchange: visit_id eksik, event yoksayıldı')
          break
        }
        
        // Store'da bu visit_id var mı kontrol et
        const existingVisit = store.houseVisits.find((v) => v.visit_id === exVisitId)
        if (!existingVisit) {
          console.warn(`[GameStore] house_visit_exchange: visit_id ${exVisitId} store'da bulunamadı, event yoksayıldı`)
          break
        }
        
        set((s) => ({
          houseVisits: s.houseVisits.map((hv) => {
            // Sadece visit_id ile eşleştir
            return hv.visit_id === exVisitId
              ? {
                  ...hv,
                  speeches: [
                    ...hv.speeches,
                    {
                      speaker: data.speaker as string,
                      content: data.content as string,
                      audio_url: visitAudioUrl,
                    },
                  ],
                  turn: (data.turn as number) ?? hv.turn,
                }
              : hv
          }),
        }))
        
        // Audio senkron: visit bulundu, oda kontrolü yap
        if (visitAudioUrl && existingVisit) {
          const currentRoom = store.selectedRoom ?? 'campfire'
          if (currentRoom === existingVisit.host || currentRoom === existingVisit.visitor) {
            audioQueue.enqueue(visitAudioUrl)
          }
        }
        break
      }

      case 'house_visit_end': {
        const endVisitId = data.visit_id as string | undefined
        
        // visit_id zorunlu - yoksa event yoksay
        if (!endVisitId) {
          console.warn('[GameStore] house_visit_end: visit_id eksik, event yoksayıldı')
          break
        }
        
        // Store'da bu visit_id var mı kontrol et
        const existingVisit = store.houseVisits.find((v) => v.visit_id === endVisitId)
        if (!existingVisit) {
          console.warn(`[GameStore] house_visit_end: visit_id ${endVisitId} store'da bulunamadı, event yoksayıldı`)
          break
        }
        
        // Keep the visit data longer so user can read the conversation
        setTimeout(() => {
          set((s) => ({
            houseVisits: s.houseVisits.filter((hv) => hv.visit_id !== endVisitId),
          }))
        }, 60000) // 60 seconds — closing campfire will clear anyway
        break
      }

      case 'sinama': {
        const sinamaData = data as unknown as Sinama
        set({ sinama: sinamaData })
        
        // If sinama has effect metadata, add it to affected player
        if (data.affected_player && data.effect_type && data.effect_name) {
          const effect: ActiveEffect = {
            id: `effect_${Date.now()}_${Math.random()}`,
            type: data.effect_type as string,
            name: data.effect_name as string,
            description: data.effect_description as string || '',
            consequence_text: data.consequence_text as string || '',
            duration: data.duration as number || 1,
            source: 'sinama',
          }
          store.addPlayerEffect(data.affected_player as string, effect)
          
          // Show critical event card if is_critical flag is true
          if (data.is_critical) {
            store.setEventCard({
              id: `event_${Date.now()}`,
              event_type: 'sinama',
              title: data.event_title as string || 'Sınama Sonucu',
              description: data.outcome as string || '',
              icon: data.icon as string || '⚖️',
              severity: data.severity as 'low' | 'medium' | 'high' | 'critical' || 'high',
              target_player: data.affected_player as string,
              effect_type: data.effect_type as string,
              consequence_text: data.consequence_text as string || '',
            })
          }
        }
        break
      }

      case 'proposal':
        set({
          proposal: data as unknown as Proposal,
        })
        break

      case 'notification':
        set({
          notification: {
            message: data.message as string,
            type: (data.type as 'info' | 'warning' | 'error') ?? 'info',
          },
        })
        setTimeout(() => set({ notification: null }), 4000)
        break

      case 'character_reveal':
        // İnsan oyuncuya karakter bilgisi göster + myName güncelle
        set({
          myName: data.name as string,
          notification: {
            message: `Sen "${data.name}" rolundesin — ${data.role_title}. Tarafin: ${data.player_type === 'et_can' ? 'Et u Can (Köylü)' : 'Yanki Dogmus (Sahtekar)'}`,
            type: 'info',
          },
        })
        // Karakter bildirimini uzun tut
        setTimeout(() => set({ notification: null }), 12000)
        break

      case 'players_update': {
        const incomingPlayers = data.players as Player[]
        const existingPlayers = store.players

        // Merge incoming players with existing ones, preserving client-side fields (x, y, color)
        // but updating server-side fields (avatar_url, alive, etc.)
        const mergedPlayers = incomingPlayers.map((incoming) => {
          const existing = existingPlayers.find((p) => p.slot_id === incoming.slot_id)
          if (existing) {
            return {
              ...existing,
              ...incoming,
              // Preserve client-side rendering fields if not provided by server
              x: incoming.x ?? existing.x,
              y: incoming.y ?? existing.y,
              color: incoming.color ?? existing.color,
            }
          }
          return incoming
        })

        // Detect avatar changes — notify Character system to invalidate cache
        for (const incoming of incomingPlayers) {
          const existing = existingPlayers.find((p) => p.slot_id === incoming.slot_id)
          if (existing && existing.avatar_url !== incoming.avatar_url && incoming.avatar_url) {
            // Dispatch a custom event so Character/SpriteSheet can clear cached sprites
            window.dispatchEvent(
              new CustomEvent('avatar-changed', {
                detail: { slotId: incoming.slot_id, name: incoming.name, url: incoming.avatar_url },
              }),
            )
          }
        }

        set({ players: mergedPlayers })
        break
      }

      case 'scene_backgrounds':
        set({ sceneBackgrounds: data as Record<string, string> })
        break

      case 'error':
        set({
          notification: {
            message: data.message as string,
            type: 'error',
          },
        })
        setTimeout(() => set({ notification: null }), 5000)
        break

      default:
        console.log('[GameStore] Unhandled event:', event, data)
    }
  },

  reset: () => {
    audioQueue.stop()
    set(initialState)
  },
}))
