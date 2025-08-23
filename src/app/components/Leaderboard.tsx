import { useEffect, useMemo, useRef, useState } from 'react'

interface Row {
  policy: string
  length: number
  trials: number
  solved: number
  failRate: number
  avgAttempts: number
  avgTimeMs: number
  avgFinalS_whenFailed: number
}

interface LoadedData {
  source: 'live-json' | 'uploaded-csv' | 'uploaded-json'
  rows: Row[]
  csvText?: string
  json?: any
}

const LATEST_JSON_URL = `${import.meta.env.BASE_URL}eval/results/latest.json`
const LATEST_CSV_URL = `${import.meta.env.BASE_URL}eval/results/latest.csv`

function parseCsv(text: string): Row[] {
  const lines = text.trim().split(/\r?\n/)
  if (!lines.length) return []
  const header = lines[0]!.split(',').map((h) => h.trim())
  const idx = (name: string) => header.indexOf(name)
  const req = [
    'policy',
    'length',
    'trials',
    'solved',
    'failRate',
    'avgAttempts',
    'avgTimeMs',
    'avgFinalS_whenFailed',
  ]
  for (const r of req) if (idx(r) === -1) throw new Error(`CSV missing column ${r}`)
  const out: Row[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!
    if (!line || !line.trim()) continue
    const parts = line.split(',')
    const get = (name: string) => parts[idx(name)]?.trim() ?? ''
    out.push({
      policy: get('policy'),
      length: Number(get('length')),
      trials: Number(get('trials')),
      solved: Number(get('solved')),
      failRate: Number(get('failRate')),
      avgAttempts: Number(get('avgAttempts')),
      avgTimeMs: Number(get('avgTimeMs')),
      avgFinalS_whenFailed: Number(get('avgFinalS_whenFailed')),
    })
  }
  return out
}

function rowsFromJson(json: any): Row[] {
  if (json && Array.isArray(json.rows)) {
    return json.rows
      .map((r: any) => ({
        policy: r.policy,
        length: r.length,
        trials: r.trials,
        solved: r.solved ?? r.successes ?? 0,
        failRate: r.failRate,
        avgAttempts: r.avgAttempts,
        avgTimeMs: r.avgTimeMs,
        avgFinalS_whenFailed: r.avgFinalS_whenFailed,
      }))
      .filter((r: Row) => r && typeof r.policy === 'string')
  }
  return []
}

type SortKey = 'solvedPct' | 'avgAttempts' | 'avgTimeMs' | 'failPct'

export default function Leaderboard() {
  const [data, setData] = useState<LoadedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sort, setSort] = useState<SortKey>('solvedPct')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Try to fetch latest JSON on mount
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(LATEST_JSON_URL, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (cancelled) return
        const rows = rowsFromJson(json)
        setData({ source: 'live-json', rows, json })
        // Also fetch CSV for download convenience (best effort)
        try {
          const csvRes = await fetch(LATEST_CSV_URL, { cache: 'no-store' })
          if (csvRes.ok) {
            const csvText = await csvRes.text()
            setData((prev) => (prev ? { ...prev, csvText } : prev))
          }
        } catch {}
      } catch (e: any) {
        if (cancelled) return
        setLoadError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const processed = useMemo(() => {
    if (!data) return []
    return data.rows.map((r) => ({
      ...r,
      solvedPct: r.trials > 0 ? (r.solved / r.trials) * 100 : 0,
      failPct: r.failRate * 100,
    }))
  }, [data])

  const sorted = useMemo(() => {
    const arr = [...processed]
    const dir = sortDir === 'asc' ? 1 : -1
    arr.sort((a, b) => {
      const keyMap: Record<SortKey, keyof typeof a> = {
        solvedPct: 'solvedPct',
        avgAttempts: 'avgAttempts',
        avgTimeMs: 'avgTimeMs',
        failPct: 'failPct',
      }
      const k = keyMap[sort]
      const av = a[k] as number
      const bv = b[k] as number
      if (av < bv) return -1 * dir
      if (av > bv) return 1 * dir
      // tie-breakers
      if (a.policy < b.policy) return -1
      if (a.policy > b.policy) return 1
      return a.length - b.length
    })
    return arr
  }, [processed, sort, sortDir])

  const grouped = useMemo(() => {
    const map = new Map<string, typeof sorted>()
    for (const r of sorted) {
      if (!map.has(r.policy)) map.set(r.policy, [])
      map.get(r.policy)!.push(r)
    }
    return [...map.entries()]
  }, [sorted])

  const triggerUpload = () => fileInputRef.current?.click()
  const onFiles = (files: FileList | null) => {
    if (!files || !files.length) return
    const f = files[0]!
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = String(reader.result)
        if (f.name.endsWith('.json')) {
          const json = JSON.parse(text)
            ;(json as any).rows ||= rowsFromJson(json) // ensure .rows populated
          const rows = rowsFromJson(json)
          setData({ source: 'uploaded-json', rows, json, csvText: undefined })
        } else {
          const rows = parseCsv(text)
          setData({ source: 'uploaded-csv', rows, csvText: text })
        }
        setLoadError(null)
      } catch (e: any) {
        setLoadError(e.message || String(e))
      }
    }
    reader.readAsText(f)
  }

  const allowDownload = data?.csvText && data.source === 'live-json'
  const downloadBlobUrl = useMemo(() => {
    if (!allowDownload || !data?.csvText) return null
    return URL.createObjectURL(new Blob([data.csvText], { type: 'text/csv' }))
  }, [allowDownload, data])

  return (
    <div className="flex flex-col gap-4" aria-label="Leaderboard">
      <div className="flex flex-wrap gap-3 items-center text-xs">
        <div className="font-semibold">Leaderboard</div>
        <div className="flex items-center gap-1">
          <label className="font-medium">Sort:</label>
          <select
            className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/70"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            <option value="solvedPct">Solved %</option>
            <option value="avgAttempts">Avg Attempts</option>
            <option value="avgTimeMs">Avg Time (ms)</option>
            <option value="failPct">Fail %</option>
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            className="px-2 py-1 rounded-md border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-700 hover:bg-neutral-200 dark:hover:bg-neutral-600"
          >
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <button
          type="button"
          onClick={triggerUpload}
          className="px-3 py-1 rounded-md bg-indigo-600 text-white font-medium hover:bg-indigo-500"
        >
          Upload CSV / JSON
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,text/csv,application/json"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        {allowDownload && downloadBlobUrl && (
          <a
            href={downloadBlobUrl}
            download="latest.csv"
            className="px-3 py-1 rounded-md bg-blue-500 text-white font-medium hover:bg-blue-400"
          >
            Download CSV
          </a>
        )}
      </div>
      {loading && <div className="text-xs text-neutral-500">Loading latest…</div>}
      {!loading && !data && (
        <div className="text-xs text-neutral-500">
          No live results found. Upload a CSV or JSON summary to view.
        </div>
      )}
      {loadError && (
        <div className="text-xs text-red-600 dark:text-red-400">Error: {loadError}</div>
      )}
      {grouped.length > 0 && (
        <div className="flex flex-col gap-6">
          {grouped.map(([policy, rows]) => (
            <div key={policy} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold tracking-tight">{policy}</h3>
              <div className="overflow-x-auto">
                <table className="text-xs w-full border-collapse">
                  <thead>
                    <tr className="bg-neutral-100 dark:bg-neutral-800">
                      <th className="p-1 text-left font-medium">Len</th>
                      <th className="p-1 text-left font-medium">Trials</th>
                      <th className="p-1 text-left font-medium">Solved%</th>
                      <th className="p-1 text-left font-medium">AvgAtt</th>
                      <th className="p-1 text-left font-medium">AvgTime(ms)</th>
                      <th className="p-1 text-left font-medium">Fail%</th>
                      <th className="p-1 text-left font-medium">Avg|S|Fail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={policy + '-' + r.length} className="odd:bg-white even:bg-neutral-50 dark:odd:bg-neutral-900 dark:even:bg-neutral-800">
                        <td className="p-1">{r.length}</td>
                        <td className="p-1">{r.trials}</td>
                        <td className="p-1">{r.solvedPct.toFixed(2)}</td>
                        <td className="p-1">{r.avgAttempts.toFixed(2)}</td>
                        <td className="p-1">{r.avgTimeMs.toFixed(1)}</td>
                        <td className="p-1">{r.failPct.toFixed(2)}</td>
                        <td className="p-1">{r.avgFinalS_whenFailed.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
