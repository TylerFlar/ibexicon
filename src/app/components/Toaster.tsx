/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export interface Toast {
  id: string
  message: string
  tone?: 'info' | 'warn' | 'error'
  ttl?: number // ms
  actions?: Array<{ label: string; event: string; tone?: 'primary' | 'danger' }>
}

interface ToastContextValue {
  push(t: Omit<Toast, 'id'>): void
  remove(id: string): void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToasts(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used within <ToastProvider>')
  return ctx
}

export interface ToastProviderProps {
  children: React.ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, number>>(new Map())

  const remove = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    const handle = timers.current.get(id)
    if (handle) {
      window.clearTimeout(handle)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback<ToastContextValue['push']>((t) => {
    const id = Math.random().toString(36).slice(2)
    const toast: Toast = { ttl: 4500, tone: 'info', ...t, id }
    setToasts((prev) => [...prev, toast])
    if (toast.ttl) {
      const handle = window.setTimeout(() => remove(id), toast.ttl)
      timers.current.set(id, handle)
    }
  }, [remove])

  // Cleanup timers on unmount
  useEffect(() => () => timers.current.forEach((h) => window.clearTimeout(h)), [])

  return (
    <ToastContext.Provider value={{ push, remove }}>
      {children}
      <div
        aria-live="polite"
        className="fixed z-50 bottom-4 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(90%,28rem)]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`rounded shadow px-3 py-2 text-sm flex items-start gap-2 border backdrop-blur bg-white/80 dark:bg-neutral-900/80 border-neutral-200 dark:border-neutral-700 ${
              t.tone === 'warn'
                ? 'text-amber-800 dark:text-amber-300'
                : t.tone === 'error'
                ? 'text-red-700 dark:text-red-300'
                : 'text-neutral-800 dark:text-neutral-200'
            }`}
            role="status"
          >
            <span className="flex-1">{t.message}</span>
            {t.actions && t.actions.length > 0 && (
              <div className="flex gap-1">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('ibx:confirm-action', { detail: a.event }),
                      )
                      remove(t.id)
                    }}
                    className={`text-xs px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 ${
                      a.tone === 'danger'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : a.tone === 'primary'
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => remove(t.id)}
              className="text-xs px-1 py-0.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700"
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
