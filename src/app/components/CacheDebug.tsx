import { useEffect, useState } from 'react'
import { SolverWorkerClient } from '@/worker/client'

interface Props {
  client: SolverWorkerClient
  length: number
}

export function CacheDebug({ client, length }: Props) {
  const [stats, setStats] = useState<{ length: number; memorySeedPlanes: number; memoryFallback: number; idbEntries: number } | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const s = await client.ptabStats(length)
      setStats(s)
    } catch (e) {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, length])

  return (
    <div className="mt-4 max-w-xl mx-auto text-[11px] font-mono">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="px-2 py-1 rounded border border-neutral-400 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      >
        {open ? 'Hide Cache Debug' : 'Show Cache Debug'}
      </button>
      {open && (
        <div className="mt-2 p-2 border border-neutral-300 dark:border-neutral-700 rounded bg-neutral-50 dark:bg-neutral-900/40">
          <div className="flex items-center gap-3 mb-2">
            <button
              type="button"
              onClick={refresh}
              className="px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-500"
              disabled={loading}
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={async () => {
                await client.clearPtabMemory(length)
                refresh()
              }}
              className="px-2 py-1 rounded bg-amber-600 text-white hover:bg-amber-500"
              disabled={loading}
            >
              Clear Memory
            </button>
            <button
              type="button"
              onClick={async () => {
                await client.clearPtabIDB(length)
                refresh()
              }}
              className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-500"
              disabled={loading}
            >
              Clear IDB
            </button>
            {loading && <span className="text-neutral-500">…</span>}
          </div>
          {stats && (
            <div className="grid grid-cols-2 gap-x-6 gap-y-1">
              <div>L: {stats.length}</div>
              <div>Seed planes (used): {stats.memorySeedPlanes}</div>
              <div>Fallback rows (mem): {stats.memoryFallback}</div>
              <div>IDB rows: {stats.idbEntries}</div>
            </div>
          )}
          {!stats && !loading && <div className="text-neutral-500">No stats</div>}
        </div>
      )}
    </div>
  )
}