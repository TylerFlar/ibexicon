import { useEffect, useRef, useState } from 'react'
import { loadWordlistSet } from '@/solver/data/loader'
import { PrecomputeBanner } from './PrecomputeBanner'
import { CacheDebug } from './CacheDebug'
import { SolverWorkerClient } from '@/worker/client'
import { WordlistDebug } from './WordlistDebug'
import { SolverDebug } from './SolverDebug'
import { SuggestDebug } from './SuggestDebug'

// Secret debug page aggregating internal tooling. Access via ?__debug=1 or #__debug

export function DebugPage() {
  const workerClientRef = useRef<SolverWorkerClient | null>(null)
  if (!workerClientRef.current) workerClientRef.current = new SolverWorkerClient()
  const client = workerClientRef.current

  const [length, setLength] = useState(5)
  const [words, setWords] = useState<string[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stats, setStats] = useState<{
    length: number
    memorySeedPlanes: number
    memoryFallback: number
    idbEntries: number
  } | null>(null)
  const [showWordlist, setShowWordlist] = useState(false)
  const [showSolver, setShowSolver] = useState(false)
  const [showSuggest, setShowSuggest] = useState(false)

  useEffect(() => {
    let cancel = false
    setLoading(true)
    setWords(null)
    setError(null)
    ;(async () => {
      try {
        const wl = await loadWordlistSet(length)
        if (!cancel) setWords(wl.words)
      } catch (e: any) {
        if (!cancel) setError(e?.message || String(e))
      } finally {
        if (!cancel) setLoading(false)
      }
    })()
    return () => {
      cancel = true
    }
  }, [length])

  async function refreshStats() {
    try {
      const s = await client.ptabStats(length)
      setStats(s)
    } catch (e) {
      /* ignore */
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ibexicon Debug</h1>
      <p className="text-xs text-neutral-500 max-w-xl text-center">
        Heavy internal tooling for development & analysis. Some panels may perform large in-memory
        computations; keep candidate sizes modest when exploring.
      </p>
      <div className="flex flex-wrap gap-4 items-end text-sm">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">Length</span>
          <input
            type="number"
            min={1}
            max={50}
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            className="px-3 py-1 border rounded bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600"
          />
        </label>
        <button
          type="button"
          onClick={() => refreshStats()}
          className="px-4 py-2 rounded bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
        >
          Stats
        </button>
        <button
          type="button"
          onClick={async () => {
            await client.clearPtabMemory(length)
            refreshStats()
          }}
          className="px-4 py-2 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-500"
        >
          Clear Memory
        </button>
        <button
          type="button"
          onClick={async () => {
            await client.clearPtabIDB(length)
            refreshStats()
          }}
          className="px-4 py-2 rounded bg-red-600 text-white text-sm font-medium hover:bg-red-500"
        >
          Clear IDB
        </button>
      </div>
      {loading && <div className="text-xs text-neutral-500">Loading words…</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}
      {words && (
        <div className="w-full max-w-xl">
          <PrecomputeBanner client={client} length={length} words={words} />
        </div>
      )}
      {stats && (
        <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded p-3">
          <div>L: {stats.length}</div>
          <div>Seed planes (used): {stats.memorySeedPlanes}</div>
          <div>Fallback rows (mem): {stats.memoryFallback}</div>
          <div>IDB rows: {stats.idbEntries}</div>
        </div>
      )}
      {words && <CacheDebug client={client} length={length} />}
      <div className="w-full max-w-5xl flex flex-col gap-4">
        <section className="border border-neutral-300 dark:border-neutral-700 rounded p-3 bg-white dark:bg-neutral-900">
          <header className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold">Panels</h2>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => setShowWordlist((v) => !v)}
                className={`px-2 py-1 rounded border ${showWordlist ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'}`}
              >
                {showWordlist ? 'Hide' : 'Show'} Wordlist
              </button>
              <button
                type="button"
                onClick={() => setShowSolver((v) => !v)}
                className={`px-2 py-1 rounded border ${showSolver ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'}`}
              >
                {showSolver ? 'Hide' : 'Show'} Solver
              </button>
              <button
                type="button"
                onClick={() => setShowSuggest((v) => !v)}
                className={`px-2 py-1 rounded border ${showSuggest ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600'}`}
              >
                {showSuggest ? 'Hide' : 'Show'} Suggest
              </button>
            </div>
          </header>
          <div className="mt-3 space-y-8">
            {showWordlist && (
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
                <WordlistDebug />
              </div>
            )}
            {showSolver && (
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
                <SolverDebug />
              </div>
            )}
            {showSuggest && (
              <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
                <SuggestDebug />
              </div>
            )}
            {!showWordlist && !showSolver && !showSuggest && (
              <p className="text-[11px] text-neutral-500">Toggle panels above to load them.</p>
            )}
          </div>
        </section>
      </div>
      <div className="mt-auto text-[10px] text-neutral-400">Secret debug page – not linked in UI.</div>
    </div>
  )
}
