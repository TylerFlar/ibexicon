import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCandidates } from '@/app/logic/constraints'
import type { SessionState } from '@/app/state/session'
import { SolverWorkerClient, type ScoreResult } from '@/worker/client'
import { alphaFor } from '@/solver/scoring'
import { loadWordlistSet } from '@/solver/data/loader'
import { useToasts } from '@/app/components/Toaster'
// Simplified; WhatIf / preview removed

export interface SuggestPanelProps {
  session: SessionState
}

interface WordData {
  words: string[]
  priors: Record<string, number>
}

export function SuggestPanel({ session }: SuggestPanelProps) {
  const { history, settings } = session
  const { length, attemptsMax } = settings
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

  const candidateWords = useMemo(() => candidates?.getAliveWords() ?? [], [candidates])
  const alpha = useMemo(() => {
    if (!candidates) return null
    return alphaFor(candidateWords.length, attemptsLeft, attemptsMax)
  }, [candidates, candidateWords.length, attemptsLeft, attemptsMax])

  const explorationState = useMemo(() => {
    if (alpha == null) return null
    if (alpha >= 0.6) return { label: 'Exploring', tone: 'info' as const }
    if (alpha <= 0.4) return { label: 'Exploiting', tone: 'success' as const }
    return { label: 'Balanced', tone: 'neutral' as const }
  }, [alpha])

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
          topK: 10,
          tau: null,
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
  }, [wordData, candidates, candidateWords, attemptsLeft, attemptsMax, push])

  const cancel = () => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    clientRef.current?.cancel()
  }

  // Auto-run scoring for smaller candidate sets
  useEffect(() => {
    if (!results && !inFlight && candidateWords.length > 0 && candidateWords.length <= 500) {
      startScoring()
    }
  }, [candidateWords.length, results, inFlight, startScoring])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 text-[0.65rem] text-neutral-500 dark:text-neutral-400">
        <span>{candidateWords.length.toLocaleString()} candidates</span>
        {alpha != null && explorationState && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800">
            <strong className="font-semibold tracking-tight">{explorationState.label}</strong>
            <span className="opacity-70 tabular-nums">{Math.round(alpha * 100)}%</span>
          </span>
        )}
      </div>
      {loading && <p className="text-xs text-neutral-500">Loading wordlist…</p>}
      {error && (
        <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {error}</p>
      )}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={inFlight ? cancel : startScoring}
          disabled={loading || !wordData || candidateWords.length === 0}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {inFlight ? 'Cancel' : 'Rank Suggestions'}
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
      {results && results.length > 0 && (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th className="text-left p-1 font-semibold">Guess</th>
                <th className="text-right p-1 font-semibold">EIG</th>
                <th className="text-right p-1 font-semibold">Solve%</th>
                <th className="text-right p-1 font-semibold">Remain</th>
              </tr>
            </thead>
            <tbody>
              {results.map((s) => (
                <tr key={s.guess} className="odd:bg-neutral-50 dark:odd:bg-neutral-900/30">
                  <td className="p-1 font-mono">
                    <button
                      type="button"
                      className="underline-offset-2 hover:underline"
                      onClick={() => window.dispatchEvent(new CustomEvent('ibx:set-guess-input', { detail: s.guess }))}
                    >
                      {s.guess}
                    </button>
                  </td>
                  <td className="p-1 text-right tabular-nums">{s.eig.toFixed(2)}</td>
                  <td className="p-1 text-right tabular-nums">{(s.solveProb * 100).toFixed(1)}</td>
                  <td className="p-1 text-right tabular-nums">{s.expectedRemaining.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
