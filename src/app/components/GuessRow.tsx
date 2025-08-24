import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Tile } from './Tile'
import type { Trit } from '@/app/state/session'

export interface GuessRowProps {
  length: number
  value: string
  onChange(value: string): void
  onCommit(guess: string, trits: Trit[]): void
  onInvalid?(reason: 'length' | 'pattern' | 'chars'): void
  disabled?: boolean
  colorblind?: boolean
  /** Optional external trigger to reset row (e.g., after commit) */
  resetSignal?: any
}

export function GuessRow({
  length,
  value,
  onChange,
  onCommit,
  onInvalid,
  disabled,
  colorblind,
  resetSignal,
}: GuessRowProps) {
  const [trits, setTrits] = useState<Trit[]>(() => Array.from({ length }, () => 0 as Trit))
  const [mode, setMode] = useState<'letters' | 'colors'>('letters')
  // Direct typing happens on tiles in letters mode; colors mode lets user cycle trits.
  const [cursor, setCursor] = useState(0)

  // Reset trits when length changes or external reset
  useEffect(() => {
    setTrits(Array.from({ length }, () => 0 as Trit))
    setMode('letters')
    setCursor(0)
  }, [length, resetSignal])

  // Keep pattern input in sync when trits change (user clicked tiles)
  // no separate pattern input sync

  const commitReady = value.length === length && trits.length === length

  const handleCommit = useCallback(() => {
    if (!commitReady || disabled) {
      if (onInvalid) {
        if (value.length !== length) onInvalid('length')
        else if (trits.length !== length) onInvalid('pattern')
      }
      return
    }
    onCommit(value, trits)
  }, [commitReady, disabled, onInvalid, value, length, trits, onCommit])

  const applyLetter = useCallback(
    (ch: string) => {
      if (disabled) return
      if (mode !== 'letters') return
      if (value.length >= length) return // row full
      const next = (value + ch).slice(0, length)
      onChange(next)
      // Cursor moves to next empty slot, or stays at last tile if full
      const nextCursor = next.length < length ? next.length : length - 1
      setCursor(nextCursor)
    },
    [disabled, mode, value, onChange, length],
  )

  const applyBackspace = useCallback(() => {
    if (disabled) return
    if (mode !== 'letters') return
    if (!value.length) return
    const next = value.slice(0, -1)
    onChange(next)
    const nextCursor = next.length ? Math.min(next.length, length - 1) : 0
    setCursor(nextCursor)
  }, [disabled, mode, value, onChange, length])

  const navigate = useCallback(
    (delta: number, idx: number) => {
      const target = Math.min(length - 1, Math.max(0, idx + delta))
      setCursor(target)
    },
    [length],
  )

  // handleEnter now just reuses handleCommit directly

  const setTritAt = (i: number, v: Trit) => {
    setTrits((prev) => prev.map((t, idx) => (idx === i ? v : t)) as Trit[])
  }
  const cycleTritAt = (i: number) => {
    setTrits((prev) => prev.map((t, idx) => (idx === i ? (((t + 1) % 3) as Trit) : t)) as Trit[])
  }

  // pattern text entry removed

  const tiles = useMemo(
    () =>
      Array.from({ length }, (_, i) => (
        <Tile
          key={i}
          index={i}
          letter={value[i] ? value[i]! : ''}
          value={trits[i]!}
          disabled={disabled}
          onCycle={() => cycleTritAt(i)}
            onSet={(v) => setTritAt(i, v)}
          disableCycle={mode === 'letters'}
          colorblind={colorblind}
          selected={i === cursor}
          onLetter={(ch) => applyLetter(ch)}
          onBackspace={() => applyBackspace()}
          onNavigate={(d) => navigate(d, i)}
          onEnter={handleCommit}
          onSelect={() => setCursor(i)}
        />
      )),
  [length, value, trits, disabled, colorblind, mode, cursor, applyLetter, applyBackspace, navigate, handleCommit],
  )

  // Manage focusing the active tile
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    tileRefs.current[cursor]?.focus()
  }, [cursor, tiles])

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="group"
      aria-label="Active guess row (type letters, then switch to Colors mode to set feedback)"
    >
      <div className="flex flex-col items-center gap-1 mb-1 w-full">
        <div
          role="group"
          aria-label="Input mode"
          className="inline-flex rounded overflow-hidden border border-neutral-300 dark:border-neutral-600"
        >
          <button
            type="button"
            onClick={() => setMode('letters')}
            className={`px-3 py-1 text-[0.65rem] font-medium ${mode === 'letters' ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'}`}
          >
            Letters
          </button>
          <button
            type="button"
            onClick={() => setMode('colors')}
            className={`px-3 py-1 text-[0.65rem] font-medium ${mode === 'colors' ? 'bg-blue-600 text-white' : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300'}`}
          >
            Colors
          </button>
        </div>
        <div className="text-[0.6rem] text-neutral-500 dark:text-neutral-400 text-center">
          {mode === 'letters' ? `${value.length}/${length} letters` : 'Tap tiles to cycle colors'}
        </div>
      </div>
      <div className="flex gap-1 mb-1" aria-label="Guess tiles">
        {tiles.map((t, i) =>
          React.cloneElement(t as any, {
            ref: (el: HTMLButtonElement | null) => (tileRefs.current[i] = el),
          }),
        )}
      </div>
      <button
        type="button"
        disabled={!commitReady || disabled}
        onClick={handleCommit}
        className="px-4 py-1 rounded bg-blue-600 disabled:opacity-40 text-white font-medium text-sm"
      >
        Add Guess
      </button>
      <p className="text-[0.6rem] text-neutral-500 dark:text-neutral-400 max-w-[14rem] text-center leading-snug">
        Type directly into the tiles. Switch to Colors to set feedback.
      </p>
    </div>
  )
}
