import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { SolverWorkerClient, type GuessExplain } from '@/worker/client'
import { decodePattern } from '@/solver/pattern'
import { feedbackPattern } from '@/solver/feedback'
import { patternEquals } from '@/solver/pattern'

export interface WhyThisGuessProps {
  guess: string
  words: string[]
  priors: Record<string, number>
  client: SolverWorkerClient | null
}

interface PatternRow {
  pattern: number | string
  patternStr: string
  prob: number
  bucketCount: number
}

export const WhyThisGuess: React.FC<WhyThisGuessProps> = ({ guess, words, priors, client }) => {
  const [data, setData] = useState<GuessExplain | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const L = guess.length

  useEffect(() => {
    if (!client || !guess) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    client
      .analyzeGuess({ guess, words, priors })
      .then((res) => {
        if (cancelled) return
        setData(res)
      })
      .catch((e) => {
        if (cancelled) return
        setError(e.message || String(e))
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [client, guess, words, priors])

  const patternToString = useCallback(
    (p: number | string): string => {
      if (typeof p === 'string') {
        if (p.length === L) return p
        // fallback decode numeric-like string
        const num = Number(p)
        if (Number.isFinite(num)) return decodePattern(num, L).join('')
        return p
      }
      return decodePattern(p, L).join('')
    },
    [L],
  )

  const topPatterns: PatternRow[] = useMemo(() => {
    if (!data) return []
    return data.splits
      .slice(0, 6)
      .map((s) => ({
        pattern: s.pattern,
        patternStr: patternToString(s.pattern),
        prob: s.prob,
        bucketCount: s.bucketCount,
      }))
  }, [data, patternToString])

  const sumBucketCounts = useMemo(
    () => data?.splits.reduce((a, b) => a + b.bucketCount, 0) || 0,
    [data],
  )
  const approximateCounts = sumBucketCounts !== words.length && sumBucketCounts !== 0

  // Largest bucket first pattern (already sorted in worker by prob desc)
  const largestPattern = data?.splits[0]?.pattern

  const previewWords = useMemo(() => {
    if (!largestPattern || words.length > 40000) return [] // avoid heavy pass on huge sets
    const out: string[] = []
    for (let i = 0; i < words.length && out.length < 20; i++) {
      const w = words[i]!
      if (w.length !== L) continue
      const pat = feedbackPattern(guess, w)
      if (patternEquals(pat, largestPattern)) out.push(w)
    }
    return out
  }, [largestPattern, words, guess, L])

  // Per-position bars (match mass)
  const posBars = useMemo(() => data?.posMatchMass ?? [], [data])
  const maxPosMass = useMemo(() => posBars.reduce((m, v) => (v > m ? v : m), 0), [posBars])

  return (
    <div className="p-2 border border-neutral-300 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-900 space-y-2 text-[0.65rem] leading-tight">
      {loading && <div>Analyzing {guess}…</div>}
      {error && <div className="text-red-600 dark:text-red-400">{error}</div>}
      {!loading && !error && data && (
        <>
          <div className="flex flex-wrap gap-2">
            <div>
              <strong>Guess:</strong> <span className="font-mono">{guess}</span>
            </div>
            <div>
              <strong>Expected greens:</strong> {data.expectedGreens.toFixed(2)}
            </div>
            <div>
              <strong>Coverage:</strong> {(data.coverageMass * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <strong>Per-position match mass</strong>
            <div className="flex items-end gap-1 mt-1 h-10">
              {posBars.map((v, i) => {
                const h = maxPosMass > 0 ? (v / maxPosMass) * 100 : 0
                return (
                  <div
                    key={i}
                    className="relative flex-1 bg-neutral-200 dark:bg-neutral-800 rounded-sm overflow-hidden"
                  >
                    <div
                      className="absolute bottom-0 left-0 right-0 bg-indigo-500 dark:bg-indigo-400"
                      style={{ height: `${h}%` }}
                    />
                    <span className="absolute top-0 left-0 right-0 text-center text-[0.5rem] opacity-80">
                      {v.toFixed(2)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
          <div>
            <strong>Top patterns</strong>
            <ul className="mt-1 space-y-1">
              {topPatterns.map((p) => (
                <li key={p.patternStr} className="flex items-center gap-2">
                  <div className="font-mono text-[0.6rem] px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700">
                    {p.patternStr}
                  </div>
                  <div className="flex-1 h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-amber-500 dark:bg-amber-400"
                      style={{ width: `${(p.prob * 100).toFixed(2)}%` }}
                    />
                  </div>
                  <div className="tabular-nums w-14 text-right">{(p.prob * 100).toFixed(2)}%</div>
                  <div className="tabular-nums w-16 text-right">
                    {approximateCounts ? '~' : ''}
                    {p.bucketCount}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {previewWords.length > 0 && (
            <details>
              <summary className="cursor-pointer">
                Example bucket words (pattern {patternToString(largestPattern!)})
              </summary>
              <div className="mt-1 flex flex-wrap gap-1 font-mono">
                {previewWords.map((w) => (
                  <span
                    key={w}
                    className="px-1 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}

export default WhyThisGuess
