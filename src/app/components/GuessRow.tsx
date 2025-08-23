import React, { useEffect, useMemo, useState } from 'react'
import { Tile } from './Tile'
import type { Trit } from '@/app/state/session'

export interface GuessRowProps {
  length: number
  value: string
  onChange(value: string): void
  onCommit(guess: string, trits: Trit[]): void
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
  disabled,
  colorblind,
  resetSignal,
}: GuessRowProps) {
  const [trits, setTrits] = useState<Trit[]>(() => Array.from({ length }, () => 0 as Trit))
  const [patternInput, setPatternInput] = useState('')

  // Reset trits when length changes or external reset
  useEffect(() => {
    setTrits(Array.from({ length }, () => 0 as Trit))
    setPatternInput('')
  }, [length, resetSignal])

  // Keep pattern input in sync when trits change (user clicked tiles)
  useEffect(() => {
    setPatternInput(trits.join(''))
  }, [trits])

  const commitReady = value.length === length && trits.length === length

  const handleCommit = () => {
    if (!commitReady || disabled) return
    onCommit(value, trits)
  }

  const keyHandler = (e: React.KeyboardEvent) => {
    if (disabled) return
    const k = e.key
    if (/^[a-zA-Z]$/.test(k)) {
      e.preventDefault()
      if (value.length < length) onChange((value + k.toLowerCase()).slice(0, length))
    } else if (k === 'Backspace') {
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
    setTrits((prev) =>
      prev.map((t, idx) => (idx === i ? (((t + 1) % 3) as Trit) : t)) as Trit[],
    )
  }

  const handlePatternChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const raw = e.target.value.replace(/[^012]/g, '').slice(0, length)
    setPatternInput(raw)
    if (raw.length) {
      const newTrits = Array.from({ length }, (_, i) => (raw[i] ? (Number(raw[i]) as Trit) : 0))
      setTrits(newTrits)
    }
  }

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
          colorblind={colorblind}
        />
      )),
    [length, value, trits, disabled, colorblind],
  )

  return (
    <div
      className="flex flex-col gap-2 outline-none"
      tabIndex={0}
      onKeyDown={keyHandler}
      aria-label="Active guess row"
    >
      <div className="flex gap-1" aria-hidden>
        {tiles}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <input
          type="text"
          inputMode="text"
          pattern="[a-z]*"
          aria-label="Guess letters"
          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/50 font-mono text-sm w-36"
          value={value}
          maxLength={length}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, length))}
        />
        <input
          type="text"
          inputMode="numeric"
          aria-label="Pattern digits"
          placeholder={trits.join('')}
          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/50 dark:bg-neutral-800/50 font-mono text-sm w-28"
          value={patternInput}
          onChange={handlePatternChange}
        />
        <button
          type="button"
          disabled={!commitReady || disabled}
          onClick={handleCommit}
          className="px-3 py-1 rounded bg-blue-600 disabled:opacity-40 text-white font-medium text-sm"
        >
          Add
        </button>
      </div>
    </div>
  )
}
