import React, { useCallback } from 'react'
import type { Trit } from '@/app/state/session'

export interface TileProps {
  letter: string
  value: Trit
  index: number
  disabled?: boolean
  onCycle(): void
  onSet?(v: Trit): void
  colorblind?: boolean
}

const valueLabels: Record<Trit, string> = {
  0: 'absent',
  1: 'present',
  2: 'correct',
}

export function Tile({
  letter,
  value,
  index,
  disabled,
  onCycle,
  onSet,
  colorblind,
}: TileProps) {
  const cycle = useCallback(
    (e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault()
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

  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={`Position ${index + 1} ${letter || 'blank'} is ${valueLabels[value]}`}
      className="tile relative text-lg font-semibold"
      data-state={valueLabels[value]}
      onClick={cycle}
      onKeyDown={handleKey}
      disabled={disabled}
    >
      <span className="pointer-events-none select-none">
        {letter || ''}
      </span>
      {colorblind && value !== 0 && (
        <span
          aria-hidden
          className="absolute -right-1 -top-1 text-[0.55rem] font-bold rounded px-0.5 py-px bg-black/50 text-white"
        >
          {value === 1 ? 'P' : value === 2 ? 'C' : ''}
        </span>
      )}
    </button>
  )
}
