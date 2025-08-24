import React, { useCallback } from 'react'
import type { Trit } from '@/app/state/session'

export interface TileProps {
  letter: string
  value: Trit
  index: number
  disabled?: boolean
  onCycle(): void
  onSet?(v: Trit): void
  disableCycle?: boolean
  onSelect?(index: number): void
  selected?: boolean
  colorblind?: boolean
  // Direct typing mode (letters mode) callbacks
  onLetter?(ch: string, index: number): void
  onBackspace?(index: number): void
  onNavigate?(delta: number, index: number): void
  onEnter?(): void
}

const valueLabels: Record<Trit, string> = {
  0: 'absent',
  1: 'present',
  2: 'correct',
}

const colorblindSymbols: Record<Trit, string> = {
  0: '',
  1: '◆', // diamond for present
  2: '●', // filled circle for correct
}

export function Tile({
  letter,
  value,
  index,
  disabled,
  onCycle,
  onSet,
  disableCycle,
  onSelect,
  selected,
  colorblind,
  onLetter,
  onBackspace,
  onNavigate,
  onEnter,
}: TileProps) {
  const cycle = useCallback(
    (e?: React.MouseEvent | React.KeyboardEvent) => {
      if (e) e.preventDefault()
      if (disabled) return
      onCycle()
    },
    [disabled, onCycle],
  )

  const handleKey = (e: React.KeyboardEvent) => {
    if (disabled) return
    // Letters mode (disableCycle true) repurposes keys for direct editing
    if (disableCycle) {
      if (/^[a-zA-Z]$/.test(e.key)) {
        onLetter?.(e.key.toLowerCase(), index)
        e.preventDefault()
        return
      }
      if (e.key === 'Backspace') {
        onBackspace?.(index)
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowLeft') {
        onNavigate?.(-1, index)
        e.preventDefault()
        return
      }
      if (e.key === 'ArrowRight') {
        onNavigate?.(1, index)
        e.preventDefault()
        return
      }
      if (e.key === 'Enter') {
        onEnter?.()
        e.preventDefault()
        return
      }
      // ignore other keys in letters mode
      return
    }
    // Colors mode (cycling / explicit trit setting)
    if (e.key === ' ') {
      cycle(e)
    } else if (e.key === 'Backspace') {
      // Allow deleting last letter even if user focused a tile in color mode (falls back to global handler otherwise)
      onBackspace?.(index)
      e.preventDefault()
    } else if (e.key === 'Enter') {
      // Do NOT cycle color on Enter; let parent commit instead.
      onEnter?.()
    } else if (onSet) {
      if (e.key === '0' || e.key === '1' || e.key === '2') {
        onSet(Number(e.key) as Trit)
      } else if (e.key === 'ArrowUp') {
        onSet(((value + 1) % 3) as Trit)
      } else if (e.key === 'ArrowDown') {
        onSet(((value + 2) % 3) as Trit)
      }
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return
    if (disableCycle) {
      onSelect?.(index)
      return
    }
    cycle(e)
  }

  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={`Letter ${letter || 'blank'} at position ${index + 1} is ${valueLabels[value]}`}
      className="tile relative text-lg font-semibold"
      data-state={valueLabels[value]}
      data-selected={selected ? 'true' : undefined}
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault()
        if (!disabled && !disableCycle) cycle(e)
      }}
      onKeyDown={handleKey}
      disabled={disabled}
    >
      <span className="pointer-events-none select-none">{letter || ''}</span>
      {colorblind && value !== 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 text-[0.65rem] font-bold rounded px-0.5 py-px bg-black/60 text-white leading-none"
        >
          {colorblindSymbols[value]}
        </span>
      )}
    </button>
  )
}
