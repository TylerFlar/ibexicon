import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  // pattern input removed; user cycles tiles directly

  // Reset trits when length changes or external reset
  useEffect(() => {
    setTrits(Array.from({ length }, () => 0 as Trit))
    setMode('letters')
  }, [length, resetSignal])

  // Keep pattern input in sync when trits change (user clicked tiles)
  // no separate pattern input sync

  const commitReady = value.length === length && trits.length === length

  const handleCommit = () => {
    if (!commitReady || disabled) {
      if (onInvalid) {
        if (value.length !== length) onInvalid('length')
        else if (trits.length !== length) onInvalid('pattern')
      }
      return
    }
    onCommit(value, trits)
  }

  const keyHandler = (e: React.KeyboardEvent) => {
    if (disabled) return
    const k = e.key
    if (mode === 'letters' && /^[a-zA-Z]$/.test(k)) {
      e.preventDefault()
      if (value.length < length) onChange((value + k.toLowerCase()).slice(0, length))
    } else if (mode === 'letters' && k === 'Backspace') {
      e.preventDefault()
      onChange(value.slice(0, -1))
    } else if (k === 'Enter') {
      e.preventDefault()
      handleCommit()
    }
  }

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
        />
      )),
    [length, value, trits, disabled, colorblind, mode],
  )

  const firstButtonRef = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    firstButtonRef.current?.focus()
  }, [])

  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (mode === 'letters') hiddenInputRef.current?.focus()
  }, [mode])

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="group"
      aria-label="Active guess row (type letters, then switch to Colors mode to set feedback)"
    >
      <input
        ref={hiddenInputRef}
        type="text"
        aria-label="Guess letters"
        aria-describedby={mode === 'letters' ? undefined : 'color-mode-hint'}
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        value={value}
        onChange={(e) => {
          if (disabled) return
          const raw = e.target.value.toLowerCase().replace(/[^a-z]/g, '')
          onChange(raw.slice(0, length))
        }}
        onKeyDown={keyHandler}
        className="sr-only focus:not-sr-only focus:w-0 focus:h-0"
      />
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
        {tiles.map((t, i) => (i === 0 ? React.cloneElement(t as any, { ref: firstButtonRef }) : t))}
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
        Letters: enter word. Colors: tap tiles to set feedback.
      </p>
    </div>
  )
}
