import React, { useEffect, useMemo, useState } from 'react'
import { loadWordlistSet } from '@/solver/data/loader'
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
  const length = session.settings.length
  const history = session.history
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [heatmap, setHeatmap] = useState<HeatmapResult | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  // (Manifest lengths not needed here; could be used for UI selection elsewhere.)

  // Load wordlist for current length
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoaded(null)
    setError(null)
    loadWordlistSet(length)
      .then((set) => {
        if (cancelled) return
        setLoaded({ length: set.length, words: set.words, priors: set.priors })
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setError(String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [length])

  // Candidate set from history
  const candidateSet = useMemo(() => (loaded ? buildCandidates(loaded.words, history) : null), [loaded, history])

  // Renormalized priors restricted to alive words
  const { aliveWords, renormPriorsArray, renormPriorsRecord } = useMemo(() => {
    if (!candidateSet || !loaded) return { aliveWords: [] as string[], renormPriorsArray: [] as number[], renormPriorsRecord: {} as Record<string, number> }
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
    <section className="analysis-section">
      <h2 className="analysis-heading">Letter Position Heatmap</h2>
      {loading && <div className="analysis-loading">Loading wordlist…</div>}
      {error && <div className="analysis-error">Error: {error}</div>}
      {!loading && !error && (
        <div className="analysis-inner">
          <div className="analysis-stats-row">
            <div><strong>Length:</strong> {length}</div>
            <div><strong>Candidates:</strong> {aliveWords.length.toLocaleString()}</div>
            <div><strong>Entropy H(S):</strong> {H.toFixed(3)} bits</div>
            <div><strong>Top letters:</strong> {topLetters.map((t) => `${t.pos}:${t.letter}(${t.mass.toFixed(2)})`).join(' ')}</div>
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
