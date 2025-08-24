import React, { useEffect, useMemo, useState } from 'react'
import { loadWordlistSet, loadWordlistSetById } from '@/solver/data/loader'
import { buildCandidates } from '@/app/logic/constraints'
import { useSession } from '@/app/hooks/useSession'
import LetterHeatmap from './LetterHeatmap'
import { SolverWorkerClient } from '@/worker/client'
import type { HeatmapResult } from '@/worker/client'

// Utility: compute entropy (bits) of a mass array that sums to ~1
function entropy(masses: number[]): number {
  let H = 0
  for (const p of masses) {
    if (p > 0) H -= p * Math.log2(p)
  }
  return H
}

interface LoadedSet {
  length: number
  words: string[]
  priors: Record<string, number>
}

export const AnalysisPanel: React.FC<{ colorblind?: boolean }> = ({ colorblind = false }) => {
  const session = useSession()
  const { length, datasetId } = session.settings as any
  const history = session.history
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // (Manifest lengths not needed here; could be used for UI selection elsewhere.)

  // Load wordlist for current dataset (fallback to length core list)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(null)
    setError(null)
    const load = async () => {
      try {
        const set = datasetId ? await loadWordlistSetById(datasetId) : await loadWordlistSet(length)
        if (cancelled) return
        setLoaded({ length: set.length, words: set.words, priors: set.priors })
        setLoading(false)
      } catch (e: any) {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [length, datasetId])

  // Candidate set from history
  const candidateSet = useMemo(
    () => (loaded ? buildCandidates(loaded.words, history) : null),
    [loaded, history],
  )

  // Renormalized priors restricted to alive words
  const { aliveWords, renormPriorsArray, renormPriorsRecord } = useMemo(() => {
    if (!candidateSet || !loaded)
      return {
        aliveWords: [] as string[],
        renormPriorsArray: [] as number[],
        renormPriorsRecord: {} as Record<string, number>,
      }
    const words = candidateSet.getAliveWords()
    let sum = 0
    for (const w of words) sum += loaded.priors[w] || 0
    const record: Record<string, number> = {}
    if (sum > 0) {
      for (const w of words) record[w] = (loaded.priors[w] || 0) / sum
    } else {
      const u = 1 / (words.length || 1)
      for (const w of words) record[w] = u
    }
    const arr = words.map((w) => record[w]!)
    return { aliveWords: words, renormPriorsArray: arr, renormPriorsRecord: record }
  }, [candidateSet, loaded])

  const H = useMemo(() => entropy(renormPriorsArray), [renormPriorsArray])

  // Top letters per position (by mass)
  const topLetters = useMemo(() => {
    if (!heatmap) return [] as Array<{ pos: number; letter: string; mass: number }>
    const out: Array<{ pos: number; letter: string; mass: number }> = []
    for (let i = 0; i < heatmap.length; i++) {
      const col = heatmap.mass[i] || []
      let bestIdx = 0
      let bestVal = -1
      for (let l = 0; l < col.length; l++) {
        const v = col[l] || 0
        if (v > bestVal) {
          bestVal = v
          bestIdx = l
        }
      }
      out.push({ pos: i + 1, letter: heatmap.letterIndex[bestIdx]!, mass: bestVal })
    }
    return out
  }, [heatmap])

  // Analyze heatmap when candidate set changes
  useEffect(() => {
    if (!aliveWords.length) {
      setHeatmap(null)
      return
    }
    let cancelled = false
    setAnalyzing(true)
    const client = new SolverWorkerClient()
    client
      .analyzeHeatmap(aliveWords, renormPriorsRecord)
      .then((res) => {
        if (cancelled) return
        setHeatmap(res)
        setAnalyzing(false)
        client.dispose()
      })
      .catch((e) => {
        if (cancelled) return
        setAnalyzing(false)
        setError(String(e))
        client.dispose()
      })
    return () => {
      cancelled = true
    }
  }, [aliveWords, renormPriorsRecord])

  return (
    <section className="analysis-section space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="analysis-heading text-lg font-semibold tracking-tight">Pattern Analysis</h2>
        <span
          className="text-[10px] px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-200"
          title="Dataset / length currently analyzed"
        >
          {datasetId || `en-${length}`}
        </span>
      </div>
      <details
        className="rounded border border-neutral-300 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3 text-[11px] leading-relaxed"
        open
      >
        <summary className="cursor-pointer font-medium mb-1">What am I looking at?</summary>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>Candidates</strong>: words still consistent with feedback you entered.
          </li>
          <li>
            <strong>Entropy H(S)</strong>: how much uncertainty remains (in bits). 0 bits means one
            certain word; ~n bits means about 2^n equally likely words.
          </li>
          <li>
            <strong>Top letters per position</strong>: shows the most probable letter for each slot
            under the current candidate distribution.
          </li>
          <li>
            <strong>Heatmap</strong>: color / value encodes probability that a letter appears in a
            given position across all alive candidates (renormalized priors).
          </li>
        </ul>
      </details>
      {loading && <div className="analysis-loading">Loading wordlist…</div>}
      {error && <div className="analysis-error">Error: {error}</div>}
      {!loading && !error && (
        <div className="analysis-inner">
          <div className="analysis-stats-row">
            <div>
              <strong>Length:</strong> {length}
            </div>
            <div>
              <strong>Candidates:</strong> {aliveWords.length.toLocaleString()}
            </div>
            <div>
              <strong>Entropy H(S):</strong> {H.toFixed(3)} bits
            </div>
            <div className="flex flex-col gap-1">
              <strong>Top letters:</strong>
              <div className="flex flex-wrap gap-1 text-[10px]">
                {topLetters.map((t) => (
                  <span
                    key={t.pos}
                    className="px-1.5 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100"
                    title={`Position ${t.pos}: ${t.letter} has probability ${(t.mass * 100).toFixed(2)}%`}
                  >
                    {t.pos}:{t.letter}
                    <span className="opacity-60 ml-0.5">
                      {(t.mass * 100).toFixed(t.mass >= 0.1 ? 0 : 1)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          </div>
          {analyzing && <div className="analysis-analyzing">Analyzing…</div>}
          {heatmap && !analyzing && <LetterHeatmap result={heatmap} colorblind={colorblind} />}
          {!analyzing && !heatmap && aliveWords.length === 0 && (
            <div className="analysis-empty">No candidates.</div>
          )}
        </div>
      )}
    </section>
  )
}

export default AnalysisPanel
