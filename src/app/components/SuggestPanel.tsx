import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCandidates } from '@/app/logic/constraints'
import type { SessionState } from '@/app/state/session'
import { SolverWorkerClient, type ScoreResult } from '@/worker/client'
import { loadWordlistSet } from '@/solver/data/loader'
import { useToasts } from '@/app/components/Toaster'

export interface SuggestPanelProps {
  session: SessionState
}

interface WordData {
  words: string[]
  priors: Record<string, number>
}

export function SuggestPanel({ session }: SuggestPanelProps) {
  const { history, settings } = session
  const { length, attemptsMax, topK, tauAuto, tau } = settings
  const attemptsLeft = attemptsMax - history.length
  const { push } = useToasts()

  const [wordData, setWordData] = useState<WordData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load length-specific list + priors (dedicated; App also loads, but we keep self-contained)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setWordData(null)
    ;(async () => {
      try {
        const data = await loadWordlistSet(length)
        if (!cancelled) {
          setWordData({ words: data.words, priors: data.priors })
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [length])

  const candidates = useMemo(() => {
    if (!wordData) return null
    return buildCandidates(wordData.words, history)
  }, [wordData, history])

  const candidateWords = candidates?.getAliveWords() ?? []

  // Worker client lifecycle
  const clientRef = useRef<SolverWorkerClient | null>(null)
  useEffect(() => {
    const c = new SolverWorkerClient()
    clientRef.current = c
    c.warmup().catch(() => {})
    return () => c.dispose()
  }, [])

  // Suggest scoring state
  const [progress, setProgress] = useState(0)
  const [inFlight, setInFlight] = useState(false)
  const [results, setResults] = useState<ScoreResult['suggestions'] | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const startScoring = useCallback(() => {
    if (!clientRef.current || !wordData || !candidates) return
    if (candidateWords.length === 0) {
      push({
        message:
          'No candidates left. One of the patterns may be inconsistent with earlier feedback.',
        tone: 'warn',
      })
      return
    }
    // Cancel prior
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller
    setInFlight(true)
    setProgress(0)
    setResults(null)
    clientRef.current
      .score(
        {
          words: candidateWords,
          priors: wordData.priors,
          attemptsLeft,
          attemptsMax,
          topK,
          tau: tauAuto ? null : tau,
          onProgress: (p) => setProgress(p),
        },
        controller.signal,
      )
      .then((res) => {
        if (res.canceled) return
        setResults(res.suggestions)
      })
      .catch((e) => {
        push({ message: `Scoring error: ${e.message || e}`, tone: 'error' })
      })
      .finally(() => {
        setInFlight(false)
      })
  }, [wordData, candidates, candidateWords, attemptsLeft, attemptsMax, topK, tauAuto, tau, push])

  const cancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    clientRef.current?.cancel()
  }

  // Collapsible preview
  const [showPreview, setShowPreview] = useState(false)
  const previewList = candidateWords.slice(0, 20)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-neutral-600 dark:text-neutral-300">
          Suggestions
        </h2>
        <div className="text-[0.65rem] text-neutral-500 dark:text-neutral-400">
          {candidateWords.length.toLocaleString()} candidates
        </div>
      </div>
      {loading && <p className="text-xs text-neutral-500">Loading wordlist…</p>}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {error}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={inFlight ? cancel : startScoring}
          disabled={loading || !wordData || candidateWords.length === 0}
          className="px-3 py-1 rounded bg-indigo-600 text-white text-sm font-medium disabled:opacity-40"
        >
          {inFlight ? 'Cancel' : 'Suggest next guess'}
        </button>
        <button
          type="button"
          onClick={() => setShowPreview((s) => !s)}
          className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 text-xs"
        >
          {showPreview ? 'Hide preview' : 'Show preview'}
        </button>
      </div>
      {inFlight && (
        <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all" 
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      {showPreview && previewList.length > 0 && (
        <div className="text-[0.65rem] font-mono leading-snug flex flex-wrap gap-x-2 gap-y-1 max-h-24 overflow-y-auto border rounded p-2 border-neutral-200 dark:border-neutral-700">
          {previewList.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
      )}
      {results && results.length > 0 && (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th className="text-left p-1 font-semibold">Guess</th>
                <th className="text-right p-1 font-semibold">EIG (bits)</th>
                <th className="text-right p-1 font-semibold">SolveProb</th>
                <th className="text-right p-1 font-semibold">α</th>
                <th className="text-right p-1 font-semibold">ExpectedRemaining</th>
                <th className="p-1" />
              </tr>
            </thead>
            <tbody>
              {results.map((s) => (
                <tr key={s.guess} className="odd:bg-neutral-50 dark:odd:bg-neutral-900/30">
                  <td className="p-1 font-mono">{s.guess}</td>
                  <td className="p-1 text-right tabular-nums">{s.eig.toFixed(3)}</td>
                  <td className="p-1 text-right tabular-nums">{(s.solveProb * 100).toFixed(2)}%</td>
                  <td className="p-1 text-right tabular-nums">{s.alpha.toFixed(3)}</td>
                  <td className="p-1 text-right tabular-nums">{s.expectedRemaining.toFixed(1)}</td>
                  <td className="p-1 text-right">
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600 text-[0.65rem]"
                      onClick={() => {
                        // copy to active guess input (dispatch custom event consumed by App)
                        window.dispatchEvent(
                          new CustomEvent('ibx:set-guess-input', { detail: s.guess }),
                        )
                      }}
                    >
                      Try this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
