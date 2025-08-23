import { useMemo } from 'react'
import type { GuessEntry, Trit } from '@/app/state/session'

export interface KeyboardProps {
  onKey(key: string): void
  history: GuessEntry[]
  disabled?: boolean
}

const rows = [
  'qwertyuiop'.split(''),
  'asdfghjkl'.split(''),
  ['Enter', ...'zxcvbnm'.split(''), 'Backspace'],
]

function mergeStatus(a: Trit | undefined, b: Trit): Trit {
  if (a === undefined) return b
  // precedence 2 > 1 > 0
  return (a === 2 || b === 2 ? 2 : a === 1 || b === 1 ? 1 : 0) as Trit
}

export function Keyboard({ onKey, history, disabled }: KeyboardProps) {
  const letterStatus = useMemo(() => {
    const map = new Map<string, Trit>()
    for (const { guess, trits } of history) {
      for (let i = 0; i < guess.length; i++) {
        const ch = guess[i]!
        const t = trits[i] as Trit
        map.set(ch, mergeStatus(map.get(ch), t))
      }
    }
    return map
  }, [history])

  return (
    <div className="select-none" aria-label="On-screen keyboard">
      {rows.map((r, idx) => (
        <div key={idx} className="flex justify-center gap-1 mb-1">
          {r.map((k) => {
            const lower = k.toLowerCase()
            const t = letterStatus.get(lower)
            const dataState = t === undefined ? undefined : t === 0 ? 'absent' : t === 1 ? 'present' : 'correct'
            return (
              <button
                key={k}
                type="button"
                data-state={dataState}
                className={`tile !w-10 !h-12 text-sm font-semibold ${k === 'Enter' || k === 'Backspace' ? '!w-16' : ''}`}
                onClick={() => !disabled && onKey(k)}
                aria-label={k === 'Backspace' ? 'Backspace' : k === 'Enter' ? 'Submit guess' : k}
                disabled={disabled}
              >
                {k === 'Backspace' ? '⌫' : k}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
