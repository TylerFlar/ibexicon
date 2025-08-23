import type { SessionState } from '@/app/state/session'

export interface TopBarProps {
  state: SessionState
  setLength(n: number): void
  setAttemptsMax(n: number): void
  onToggleAdvanced(): void
  onOpenHelp(): void
  showAdvanced: boolean
}

export function TopBar({ state, setLength, setAttemptsMax, onToggleAdvanced, onOpenHelp, showAdvanced }: TopBarProps) {
  const { settings } = state
  return (
    <header className="relative flex flex-wrap items-center gap-4 px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 bg-white/70 dark:bg-neutral-900/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-neutral-900/60">
      <h1 className="text-lg font-semibold tracking-tight mr-2">Ibexicon</h1>
      <div className="flex items-end gap-4 flex-wrap">
        <label className="flex flex-col text-[11px] font-medium" title="Word length">
          <span className="uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Length</span>
          <select
            className="mt-0.5 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
            value={settings.length}
            onChange={(e) => setLength(Number(e.target.value))}
            aria-label="Word length"
          >
            {Array.from({ length: 12 }, (_, i) => 5 + i).map((L) => (
              <option key={L} value={L}>{L}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-[11px] font-medium" title="Maximum number of guesses (for planning)">
          <span className="uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Attempts</span>
            <input
              type="number" min={1} max={100}
              className="mt-0.5 w-20 px-3 py-1.5 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
              value={settings.attemptsMax}
              onChange={(e) => setAttemptsMax(Number(e.target.value))}
              aria-label="Max attempts"
            />
        </label>
      </div>
      <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={onToggleAdvanced}
          className={`h-9 px-3 inline-flex items-center gap-1 rounded border border-neutral-300 dark:border-neutral-600 text-xs font-medium ${showAdvanced ? 'bg-blue-600 text-white border-blue-600' : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-600'}`}
          aria-pressed={showAdvanced}
          aria-haspopup="true"
          aria-expanded={showAdvanced}
          aria-label={showAdvanced ? 'Hide settings' : 'Show settings'}
        >
          <span role="img" aria-hidden="true">⚙</span> <span className="hidden sm:inline">Settings</span>
        </button>
        <button
          type="button"
          className="h-9 px-3 inline-flex items-center justify-center rounded bg-neutral-200 dark:bg-neutral-700 hover:bg-neutral-300 dark:hover:bg-neutral-600 text-xs font-medium"
          onClick={onOpenHelp}
          aria-label="Help"
        >?
        </button>
      </div>
    </header>
  )
}
