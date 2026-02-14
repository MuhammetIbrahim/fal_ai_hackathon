import React, { useEffect, useState, useRef } from 'react'
import { useGameStore } from '../state/GameStore'

interface MetricEntry {
  speaker: string
  llm_ms: number
  tts_ms: number
  total_ms: number
  text_len: number
  voice: string
  timestamp: number
}

export const PipelineMetrics: React.FC = () => {
  const pipelineMetrics = useGameStore((s) => s.pipelineMetrics)
  const [history, setHistory] = useState<MetricEntry[]>([])
  const [visible, setVisible] = useState(true)
  const prevRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pipelineMetrics) return
    // Avoid duplicates
    const key = `${pipelineMetrics.speaker}-${pipelineMetrics.total_ms}`
    if (key === prevRef.current) return
    prevRef.current = key

    setHistory((prev) => [
      ...prev.slice(-4), // Keep last 5
      { ...pipelineMetrics, timestamp: Date.now() },
    ])
  }, [pipelineMetrics])

  if (history.length === 0) return null

  const latest = history[history.length - 1]
  const avgTotal = history.length > 1
    ? Math.round(history.reduce((sum, h) => sum + h.total_ms, 0) / history.length)
    : null

  // Calculate bar widths proportionally
  const maxBar = Math.max(latest.llm_ms + latest.tts_ms, 1)
  const llmPct = (latest.llm_ms / maxBar) * 100
  const ttsPct = (latest.tts_ms / maxBar) * 100

  // Color coding for total latency
  const totalColor = latest.total_ms < 2000
    ? '#4ac850' // green — great
    : latest.total_ms < 4000
      ? '#DAA520' // gold — ok
      : '#DC143C' // red — slow

  return (
    <div
      className="fixed bottom-16 left-3 z-30 select-none"
      style={{ opacity: visible ? 1 : 0.3, transition: 'opacity 0.3s' }}
      onClick={() => setVisible(!visible)}
    >
      {visible && (
        <div
          className="rounded-lg overflow-hidden backdrop-blur-md"
          style={{
            width: '280px',
            background: 'rgba(12,10,6,0.92)',
            border: '1px solid rgba(139,94,60,0.3)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-3 py-1.5"
            style={{ borderBottom: '1px solid rgba(139,94,60,0.2)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-pixel text-text-gold tracking-wider">PIPELINE</span>
              <div
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ backgroundColor: totalColor }}
              />
            </div>
            <span className="text-[7px] font-pixel text-stone/50">
              {history.length} speech{history.length > 1 ? 'es' : ''}
            </span>
          </div>

          {/* Latest metric */}
          <div className="px-3 py-2 space-y-1.5">
            {/* Speaker name + total */}
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-pixel text-text-light/80">
                {latest.speaker}
              </span>
              <span
                className="text-[11px] font-pixel font-bold tabular-nums"
                style={{ color: totalColor }}
              >
                {(latest.total_ms / 1000).toFixed(2)}s
              </span>
            </div>

            {/* Pipeline timeline bar */}
            <div className="flex items-center h-5 rounded overflow-hidden bg-[#1a1208]">
              {/* LLM segment */}
              <div
                className="h-full flex items-center justify-center relative"
                style={{
                  width: `${llmPct}%`,
                  minWidth: '30px',
                  background: 'linear-gradient(90deg, #4a7023 0%, #5a8a2e 100%)',
                }}
              >
                <span className="text-[7px] font-pixel text-white/90 font-bold tabular-nums">
                  LLM {(latest.llm_ms / 1000).toFixed(1)}s
                </span>
              </div>

              {/* Arrow separator */}
              <div className="w-px h-full bg-black/50" />

              {/* TTS segment */}
              <div
                className="h-full flex items-center justify-center relative"
                style={{
                  width: `${ttsPct}%`,
                  minWidth: '30px',
                  background: 'linear-gradient(90deg, #2E5090 0%, #3a65b0 100%)',
                }}
              >
                <span className="text-[7px] font-pixel text-white/90 font-bold tabular-nums">
                  TTS {(latest.tts_ms / 1000).toFixed(1)}s
                </span>
              </div>
            </div>

            {/* Details row */}
            <div className="flex items-center justify-between text-[7px] font-pixel text-stone/60">
              <span>{latest.text_len} chars</span>
              <span>voice: {latest.voice}</span>
              {avgTotal && (
                <span>avg: {(avgTotal / 1000).toFixed(2)}s</span>
              )}
            </div>
          </div>

          {/* Mini history sparkline */}
          {history.length > 1 && (
            <div
              className="flex items-end gap-1 px-3 pb-2"
              style={{ height: '24px' }}
            >
              {history.map((h, i) => {
                const maxH = Math.max(...history.map((x) => x.total_ms))
                const barH = Math.max((h.total_ms / maxH) * 16, 2)
                const isLatest = i === history.length - 1
                const barColor = h.total_ms < 2000 ? '#4ac850' : h.total_ms < 4000 ? '#DAA520' : '#DC143C'

                return (
                  <div
                    key={i}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${barH}px`,
                      backgroundColor: barColor,
                      opacity: isLatest ? 1 : 0.4,
                    }}
                    title={`${h.speaker}: ${(h.total_ms / 1000).toFixed(2)}s`}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}

      {!visible && (
        <div
          className="rounded px-2 py-1 cursor-pointer"
          style={{
            background: 'rgba(12,10,6,0.8)',
            border: '1px solid rgba(139,94,60,0.2)',
          }}
        >
          <span className="text-[8px] font-pixel text-text-gold">PIPELINE</span>
        </div>
      )}
    </div>
  )
}

export default PipelineMetrics
