import React, { useEffect, useState, useCallback } from 'react'
import { useGameStore } from '../state/GameStore'

interface ToastItem {
  id: number
  message: string
  type: 'info' | 'warning' | 'error' | 'ocak'
  exiting: boolean
}

let toastIdCounter = 0

const typeBorderClass: Record<ToastItem['type'], string> = {
  info: 'border-wood',
  warning: 'border-fire-orange',
  error: 'border-fire-red',
  ocak: 'border-fire-orange',
}

const typeBgClass: Record<ToastItem['type'], string> = {
  info: 'bg-bg-dark/95',
  warning: 'bg-[#2a1a08]/95',
  error: 'bg-[#2a0808]/95',
  ocak: 'bg-[#1a0808]/95',
}

export const NotificationToast: React.FC = () => {
  const notification = useGameStore((s) => s.notification)
  const ocakTepki = useGameStore((s) => s.ocakTepki)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: number) => {
    // Start exit animation
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    )
    // Remove after animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 400)
  }, [])

  // Watch for new notifications
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

  // Watch for ocak tepki
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
    <div className="fixed bottom-20 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`
            pointer-events-auto
            border-4 px-4 py-2 max-w-[300px]
            shadow-lg shadow-black/50
            transition-all duration-400 ease-out
            ${typeBorderClass[toast.type]}
            ${typeBgClass[toast.type]}
            ${toast.exiting
              ? 'opacity-0 translate-x-8'
              : 'opacity-100 translate-x-0 animate-[slideInRight_0.3s_ease-out]'
            }
          `}
        >
          <p className="text-text-light text-[9px] font-pixel leading-relaxed">
            {toast.message}
          </p>

          {/* Fire glow effect for ocak type */}
          {toast.type === 'ocak' && (
            <div className="absolute inset-0 pointer-events-none border-2 border-fire-orange/30 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  )
}

export default NotificationToast
