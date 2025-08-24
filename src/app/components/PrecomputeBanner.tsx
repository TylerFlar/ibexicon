import { useEffect, useRef, useState } from 'react'
import { SolverWorkerClient } from '@/worker/client'

interface Props {
  client: SolverWorkerClient
  length: number
  words: string[] | null
  datasetId?: string
}

interface ProgressState {
  stage: string
  percent: number
  meta?: { L: number; N: number; M: number; hash32: number }
}

const LS_KEY = 'ibx:ptab:ready:v2'

function keyFor(datasetId: string | undefined, length: number) {
  return datasetId ? `${datasetId}` : `en-${length}`
}

function hasSeen(length: number, datasetId?: string): boolean {
  if (typeof window === 'undefined') return true
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    if (!raw) return false
    const obj = JSON.parse(raw)
    return !!obj[keyFor(datasetId, length)]
  } catch {
    return false
  }
}

function markSeen(length: number, datasetId?: string) {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(LS_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    obj[keyFor(datasetId, length)] = true
    window.localStorage.setItem(LS_KEY, JSON.stringify(obj))
  } catch {
    /* ignore */
  }
}

export function PrecomputeBanner({ client, length, words, datasetId }: Props) {
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const startedRef = useRef(false)
  const [dismissed, setDismissed] = useState(() => hasSeen(length, datasetId))

  // Reset when length changes
  useEffect(() => {
    startedRef.current = false
    setProgress(null)
    setDismissed(hasSeen(length, datasetId))
  }, [length, datasetId])

  useEffect(() => {
    if (dismissed) return
    if (!words || words.length === 0) return
    if (startedRef.current) return
    startedRef.current = true
    let active = true
    setProgress({ stage: 'download', percent: 0 })
    client
      .ensurePtab(
        length,
        words,
        (stage, percent) => {
          if (!active) return
          setProgress((prev) => ({ stage, percent, meta: prev?.meta }))
        },
        datasetId,
      )
      .then((meta) => {
        if (!active) return
        setProgress({ stage: 'ready', percent: 1, meta })
        // If an asset exists (M>0) or we've attempted once, mark seen after brief delay
        setTimeout(() => {
          markSeen(length, datasetId)
          setDismissed(true)
        }, 1200)
      })
      .catch(() => {
        if (!active) return
        // Failure: silently hide (could surface toast if desired)
        markSeen(length, datasetId)
        setDismissed(true)
      })
    return () => {
      active = false
    }
  }, [client, length, words, dismissed, datasetId])

  if (dismissed || !progress) return null
  const pct = Math.min(1, Math.max(0, progress.percent))
  const showMeta = progress.meta && progress.meta.M > 0 && progress.stage === 'ready'
  return (
    <div className="mb-4 w-full max-w-xl mx-auto border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/40 rounded-md p-3 text-xs text-indigo-900 dark:text-indigo-100 shadow-sm">
      <div className="flex justify-between items-center mb-2">
        <span className="font-medium">Preparing acceleration ({datasetId || `L=${length}`})</span>
        <button
          type="button"
          onClick={() => {
            markSeen(length, datasetId)
            setDismissed(true)
          }}
          className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300"
          aria-label="Dismiss precompute progress"
        >
          ×
        </button>
      </div>
      <div className="h-2 w-full bg-indigo-200/60 dark:bg-indigo-800 rounded overflow-hidden mb-1">
        <div
          className="h-full bg-indigo-500 dark:bg-indigo-400 transition-all duration-300"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="flex justify-between items-center">
        <span className="capitalize">{progress.stage}</span>
        {showMeta && (
          <span className="text-[10px] opacity-80">
            {progress.meta!.M} seeds • {progress.meta!.N.toLocaleString()} words
          </span>
        )}
      </div>
    </div>
  )
}
