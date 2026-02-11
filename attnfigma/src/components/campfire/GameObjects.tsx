import React from 'react'
import type { UIObject } from '../../types/game'

// Default states to compare against
const DEFAULT_STATES: Record<string, Record<string, unknown>> = {
  // Katman 2 (6)
  kiler_kapisi: { state: 'locked' },
  anahtar_halkasi: { state: 'present' },
  kayit_defteri: { blurred_line: '' },
  nobet_levhasi: { names: [], silik_satir: '' },
  kul_kasesi: { fill: 0.3 },
  sifahane_dolabi: { bottle_count: 5 },
  // Katman 3 (6)
  meclis_masasi: { karar_notu: '' },
  sinir_haritasi: { isaret_sayisi: 0 },
  ot_rafi: { eksik_ot: '' },
  ocak_koru: { renk: 'kehribar' },
  alet_duvari: { eksik_alet: '' },
  gezgin_notlari: { son_not: '' },
}

const OBJECT_META: Record<string, { label: string; icon: string }> = {
  kiler_kapisi: { label: 'Kiler Kapisi', icon: '🚪' },
  anahtar_halkasi: { label: 'Anahtar Halkasi', icon: '🔑' },
  kayit_defteri: { label: 'Kayit Defteri', icon: '📖' },
  nobet_levhasi: { label: 'Nobet Levhasi', icon: '📋' },
  kul_kasesi: { label: 'Kul Kasesi', icon: '🥣' },
  sifahane_dolabi: { label: 'Sifahane Dolabi', icon: '💊' },
  meclis_masasi: { label: 'Meclis Masasi', icon: '🪑' },
  sinir_haritasi: { label: 'Sinir Haritasi', icon: '🗺️' },
  ot_rafi: { label: 'Ot Rafi', icon: '🌿' },
  ocak_koru: { label: 'Ocak Koru', icon: '🔥' },
  alet_duvari: { label: 'Alet Duvari', icon: '🔧' },
  gezgin_notlari: { label: 'Gezgin Notlari', icon: '📝' },
}

function hasChanged(id: string, currentState: Record<string, unknown>): boolean {
  const def = DEFAULT_STATES[id]
  if (!def) return true
  return JSON.stringify(def) !== JSON.stringify(currentState)
}

function formatState(id: string, state: Record<string, unknown>): string {
  if (id === 'kiler_kapisi') return state.state === 'locked' ? 'Kilitli' : 'Acik'
  if (id === 'anahtar_halkasi') return state.state === 'present' ? 'Yerinde' : 'Kayip'
  if (id === 'kayit_defteri') return state.blurred_line ? `"${state.blurred_line}"` : 'Temiz'
  if (id === 'nobet_levhasi') {
    const names = state.names as string[] | undefined
    return names && names.length > 0 ? names.join(', ') : 'Bos'
  }
  if (id === 'kul_kasesi') return `${Math.round((state.fill as number ?? 0.3) * 100)}%`
  if (id === 'sifahane_dolabi') return `${state.bottle_count ?? 5} sise`
  // Katman 3
  if (id === 'meclis_masasi') return state.karar_notu ? `"${state.karar_notu}"` : 'Bos'
  if (id === 'sinir_haritasi') return `${state.isaret_sayisi ?? 0} isaret`
  if (id === 'ot_rafi') return state.eksik_ot ? `Eksik: ${state.eksik_ot}` : 'Tam'
  if (id === 'ocak_koru') return `${state.renk ?? 'kehribar'}`
  if (id === 'alet_duvari') return state.eksik_alet ? `Eksik: ${state.eksik_alet}` : 'Tam'
  if (id === 'gezgin_notlari') return state.son_not ? `"${state.son_not}"` : 'Bos'
  return JSON.stringify(state)
}

interface GameObjectsProps {
  uiObjects: Record<string, UIObject>
}

export const GameObjects: React.FC<GameObjectsProps> = ({ uiObjects }) => {
  // Only show objects that differ from default
  const changedObjects = Object.entries(uiObjects).filter(
    ([id, obj]) => obj.state && hasChanged(id, obj.state)
  )

  if (changedObjects.length === 0) return null

  return (
    <div className="game-objects-bar">
      {changedObjects.map(([id, obj]) => {
        const meta = OBJECT_META[id] ?? { label: id, icon: '📦' }
        return (
          <div key={id} className="game-object-item">
            <span className="text-base">{meta.icon}</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-text-secondary/50 uppercase tracking-wider">{meta.label}</span>
              <span className="text-xs text-accent/70 font-medium">{formatState(id, obj.state)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
