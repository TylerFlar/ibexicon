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
  // Cursor retained only for potential future focus management but not required for typing.
  const [cursor, setCursor] = useState(0)

  // Reset trits when length changes or external reset
  useEffect(() => {
    setTrits(Array.from({ length }, () => 0 as Trit))
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
      if (value.length >= length) return // row full
      const next = (value + ch).slice(0, length)
      onChange(next)
      const nextCursor = next.length < length ? next.length : length - 1
      setCursor(nextCursor)
    },
    [disabled, value, onChange, length],
  )

  const applyBackspace = useCallback(() => {
    if (disabled) return
    if (!value.length) return
    const next = value.slice(0, -1)
    onChange(next)
    const nextCursor = next.length ? Math.min(next.length, length - 1) : 0
    setCursor(nextCursor)
  }, [disabled, value, onChange, length])

  const navigate = useCallback(
    (delta: number) => {
      setCursor((c) => Math.min(length - 1, Math.max(0, c + delta)))
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

  const [inputFocused, setInputFocused] = useState(false)
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
          disableCycle={false}
          colorblind={colorblind}
          selected={i === cursor}
          preventFocusSteal={inputFocused}
          onLetter={(ch) => applyLetter(ch)}
          onBackspace={() => applyBackspace()}
          onNavigate={(d) => navigate(d)}
          onEnter={handleCommit}
          onSelect={() => {
            setCursor(i)
            visibleInputRef.current?.focus()
          }}
        />
      )),
    [
      length,
      value,
      trits,
      disabled,
      colorblind,
      cursor,
      applyLetter,
      applyBackspace,
      navigate,
      handleCommit,
      inputFocused,
    ],
  )

  // Optional focusing of active tile (not required for input anymore)
  const tileRefs = useRef<(HTMLButtonElement | null)[]>([])
  useEffect(() => {
    if (!inputFocused) {
      tileRefs.current[cursor]?.focus()
    }
  }, [cursor, inputFocused])

  // Global key handler so typing works anywhere (unless in an editable field outside the board)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (disabled) return
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        // Allow keystrokes if the focused input is our hidden mobile field; otherwise skip typical editable elements
        if (
          target !== hiddenInputRef.current &&
          (tag === 'INPUT' || tag === 'TEXTAREA' || (target as any).isContentEditable)
        ) {
          return
        }
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^[a-zA-Z]$/.test(e.key)) {
        applyLetter(e.key.toLowerCase())
        e.preventDefault()
      } else if (e.key === 'Backspace') {
        applyBackspace()
        e.preventDefault()
      } else if (e.key === 'ArrowLeft') {
        navigate(-1)
        e.preventDefault()
      } else if (e.key === 'ArrowRight') {
        navigate(1)
        e.preventDefault()
      } else if (e.key === 'Enter') {
        handleCommit()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [disabled, applyLetter, applyBackspace, navigate, handleCommit])

  // Visible mirrored input (improves mobile keyboard access)
  const hiddenInputRef = useRef<HTMLInputElement | null>(null)
  const visibleInputRef = useRef<HTMLInputElement | null>(null)
  const [inputValue, setInputValue] = useState(value)

  // Keep internal input mirror synced when external value changes (from parent or tile actions)
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return
    let raw = e.target.value
    // Normalize: letters only, lowercase, trim length
    raw = raw
      .replace(/[^a-zA-Z]/g, '')
      .toLowerCase()
      .slice(0, length)
    setInputValue(raw)
    onChange(raw)
    setCursor(Math.min(raw.length, length - 1))
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleCommit()
      e.preventDefault()
    } else if (e.key === 'ArrowLeft') {
      navigate(-1)
    } else if (e.key === 'ArrowRight') {
      navigate(1)
    }
  }

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="group"
      aria-label="Active guess row (type letters, then switch to Colors mode to set feedback)"
    >
      <div className="flex flex-col items-center gap-1 mb-1 w-full text-[0.6rem] text-neutral-500 dark:text-neutral-400">
        <div id="guess-progress">
          {value.length}/{length} letters (tap tiles to set colors)
        </div>
      </div>
      <div className="flex gap-1 mb-1" aria-label="Guess tiles">
        {tiles.map((t, i) =>
          React.cloneElement(t as any, {
            ref: (el: HTMLButtonElement | null) => (tileRefs.current[i] = el),
          }),
        )}
      </div>
      {/* Visible input for mobile + desktop typing; placed below tiles now. */}
      <div className="w-full max-w-xs mb-2">
        <label className="sr-only" htmlFor="guess-input">
          Guess letters
        </label>
        <input
          id="guess-input"
          ref={visibleInputRef}
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onFocus={() => setInputFocused(true)}
          onBlur={() => setInputFocused(false)}
          className="w-full rounded border border-neutral-300 dark:border-neutral-600 bg-transparent px-2 py-1 text-center tracking-widest font-mono text-sm focus:outline-none focus:ring focus:ring-primary/50"
          placeholder={Array.from({ length }, () => '•').join('')}
          aria-describedby="guess-progress"
        />
      </div>
      <button
        type="button"
        disabled={!commitReady || disabled}
        onClick={handleCommit}
        className="btn-primary text-sm px-4 py-1"
      >
        Add Guess
      </button>
      <p className="text-[0.6rem] text-neutral-500 dark:text-neutral-400 max-w-[14rem] text-center leading-snug">
        Type anywhere. Click tiles to cycle colors. Enter to add guess.
      </p>
    </div>
  )
}
