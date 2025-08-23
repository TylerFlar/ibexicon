import { useEffect, useState } from 'react'
import { loadEnManifest } from '@/solver/data/manifest'
import type { SessionState } from '@/app/state/session'

export interface ControlsBarProps {
  state: SessionState
  actions: {
    setLength(n: number): void
    setAttemptsMax(n: number): void
    setTopK(n: number): void
    setTauAuto(v: boolean): void
    setTau(n: number): void
    toggleColorblind(): void
    undo(): void
    clear(): void
  }
}

export function ControlsBar({ state, actions }: ControlsBarProps) {
  const { settings } = state
  const [lengthOptions, setLengthOptions] = useState<number[]>([])

  useEffect(() => {
    ;(async () => {
      const m = await loadEnManifest()
      setLengthOptions(m.lengths || [])
    })()
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-end">
        <label className="flex flex-col text-xs font-medium">
          <span className="mb-0.5">Length</span>
          <select
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70"
            value={settings.length}
            onChange={(e) => actions.setLength(Number(e.target.value))}
          >
            {lengthOptions.map((L) => (
              <option key={L} value={L}>
                {L}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs font-medium">
          <span className="mb-0.5">Attempts</span>
          <input
            type="number"
            min={1}
            max={100}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 w-20"
            value={settings.attemptsMax}
            onChange={(e) => actions.setAttemptsMax(Number(e.target.value))}
          />
        </label>
        <label className="flex flex-col text-xs font-medium">
          <span className="mb-0.5">Top K</span>
          <input
            type="number"
            min={1}
            max={1000}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 w-20"
            value={settings.topK}
            onChange={(e) => actions.setTopK(Number(e.target.value))}
          />
        </label>
        <label className="flex items-center gap-1 text-xs font-medium mt-4">
          <input
            type="checkbox"
            checked={settings.colorblind}
            onChange={actions.toggleColorblind}
          />
          <span>Colorblind</span>
        </label>
        <label className="flex items-center gap-1 text-xs font-medium mt-4">
          <input
            type="checkbox"
            checked={settings.tauAuto}
            onChange={(e) => actions.setTauAuto(e.target.checked)}
          />
          <span>τ auto</span>
        </label>
        {!settings.tauAuto && (
          <label className="flex flex-col text-xs font-medium">
            <span className="mb-0.5">τ</span>
            <input
              type="number"
              className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-white/70 dark:bg-neutral-800/70 w-24"
              value={settings.tau ?? ''}
              onChange={(e) => actions.setTau(Number(e.target.value))}
            />
          </label>
        )}
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={actions.undo}
            className="px-3 py-1 text-xs rounded bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={actions.clear}
            className="px-3 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600"
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}
