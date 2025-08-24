import { useState } from 'react'
import { track } from '@/telemetry'
import { SolverWorkerClient } from '@/worker/client'

interface WasmBenchProps {
  client: SolverWorkerClient
  defaultLength?: number
}

export function WasmBench({ client, defaultLength = 5 }: WasmBenchProps) {
  const [length, setLength] = useState(defaultLength)
  const [N, setN] = useState(10000)
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<null | { jsMs: number; wasmMs: number | null }>(null)
  const [error, setError] = useState<string | null>(null)

  async function run() {
    setRunning(true)
    setResult(null)
    setError(null)
    try {
      const r = await client.benchPatternRow(length, N)
      setResult(r)
      track({ name: 'bench_run', props: { length, N, wasm: r.wasmMs != null } })
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setRunning(false)
    }
  }

  let speedup: string | null = null
  if (result && result.wasmMs != null) {
    const s = result.jsMs / result.wasmMs
    speedup = s.toFixed(2) + 'x'
  }

  return (
    <div className="text-xs space-y-3">
      <h3 className="text-sm font-semibold">Pattern Row Bench (JS vs WASM)</h3>
      <div className="flex flex-wrap gap-4 items-end">
        <label className="flex flex-col gap-1">
          <span>L</span>
          <input
            type="number"
            min={1}
            max={32}
            value={length}
            onChange={(e) => setLength(Number(e.target.value) || 1)}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span>N (secrets)</span>
          <input
            type="number"
            min={10}
            step={100}
            value={N}
            onChange={(e) => setN(Number(e.target.value) || 10)}
            className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800"
          />
        </label>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className="px-4 py-2 rounded bg-indigo-600 text-white font-medium disabled:opacity-40"
        >
          {running ? 'Running…' : 'Run bench'}
        </button>
      </div>
      {error && <div className="text-red-600">Error: {error}</div>}
      {result && (
        <div className="space-y-1 font-mono">
          <div>JS: {result.jsMs.toFixed(2)} ms</div>
          <div>WASM: {result.wasmMs != null ? result.wasmMs.toFixed(2) + ' ms' : 'n/a'}</div>
          {speedup && <div>Speedup: {speedup}</div>}
          {result.wasmMs != null && result.wasmMs > result.jsMs && (
            <div className="text-[11px] text-neutral-500 max-w-sm">
              WASM pays an init cost; larger N shows the benefit.
            </div>
          )}
          {length > 10 && (
            <div className="text-[11px] text-neutral-500">Length &gt; 10 uses JS only.</div>
          )}
        </div>
      )}
    </div>
  )
}
