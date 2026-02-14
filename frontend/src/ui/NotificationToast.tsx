import React, { useEffect, useState, useCallback } from 'react'
import { useGameStore } from '../state/GameStore'

interface ToastItem {
  id: number
  message: string
  type: 'info' | 'warning' | 'error' | 'ocak'
  exiting: boolean
}

let toastIdCounter = 0

const typeStyles: Record<ToastItem['type'], { border: string; bg: string; accent: string }> = {
  info: {
    border: '1px solid rgba(139,94,60,0.4)',
    bg: 'rgba(18,14,6,0.95)',
    accent: 'rgba(139,94,60,0.6)',
  },
  warning: {
    border: '1px solid rgba(255,140,0,0.4)',
    bg: 'rgba(30,18,6,0.95)',
    accent: 'rgba(255,140,0,0.6)',
  },
  error: {
    border: '1px solid rgba(220,20,60,0.4)',
    bg: 'rgba(30,8,8,0.95)',
    accent: 'rgba(220,20,60,0.6)',
  },
  ocak: {
    border: '1px solid rgba(255,140,0,0.5)',
    bg: 'rgba(26,10,6,0.95)',
    accent: 'rgba(255,140,0,0.7)',
  },
}

export const NotificationToast: React.FC = () => {
  const notification = useGameStore((s) => s.notification)
  const ocakTepki = useGameStore((s) => s.ocakTepki)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    )
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 400)
  }, [])

  useEffect(() => {
    if (!notification) return

    const id = ++toastIdCounter
    setToasts((prev) => [
      ...prev,
      {
        id,
        message: notification.message,
        type: notification.type,
        exiting: false,
      },
    ])

    const timer = setTimeout(() => removeToast(id), 4000)
    return () => clearTimeout(timer)
  }, [notification, removeToast])

  useEffect(() => {
    if (!ocakTepki) return

    const id = ++toastIdCounter
    const prefix =
      ocakTepki.type === 'rage'
        ? '\uD83D\uDD25 '
        : ocakTepki.type === 'warning'
          ? '\u26A0\uFE0F '
          : '\u2705 '

    setToasts((prev) => [
      ...prev,
      {
        id,
        message: `${prefix}${ocakTepki.message}`,
        type: 'ocak',
        exiting: false,
      },
    ])

    const timer = setTimeout(() => removeToast(id), 5000)
    return () => clearTimeout(timer)
  }, [ocakTepki, removeToast])

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2.5 pointer-events-none">
      {toasts.map((toast) => {
        const s = typeStyles[toast.type]

        return (
          <div
            key={toast.id}
            className={`
              pointer-events-auto rounded-lg px-4 py-2.5 max-w-[320px]
              backdrop-blur-md
              transition-all duration-400 ease-out
              ${toast.exiting
                ? 'opacity-0 translate-x-8 scale-95'
                : 'opacity-100 translate-x-0 scale-100 animate-[slideInRight_0.3s_ease-out]'
              }
            `}
            style={{
              border: s.border,
              backgroundColor: s.bg,
              boxShadow: `0 4px 16px rgba(0,0,0,0.4), 0 0 1px ${s.accent}`,
            }}
          >
            {/* Left accent bar */}
            <div
              className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full"
              style={{ backgroundColor: s.accent }}
            />

            <p className="text-text-light text-[9px] font-pixel leading-relaxed pl-2">
              {toast.message}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default NotificationToast
