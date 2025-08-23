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
    if (e.key === ' ' || e.key === 'Enter') {
      cycle(e)
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
      onContextMenu={(e) => { e.preventDefault(); if (!disabled && !disableCycle) cycle(e) }}
      onKeyDown={handleKey}
      disabled={disabled}
    >
      <span className="pointer-events-none select-none">
        {letter || ''}
      </span>
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
