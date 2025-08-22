import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadEnManifest } from '@/solver/data/manifest'
import { loadWordlistSet } from '@/solver/data/loader'
import { CandidateSet, feedbackPattern, decodePattern } from '@/solver'
import { suggestNext } from '@/solver/scoring'

interface LoadedSet {
  length: number
  words: string[]
  priors: Record<string, number>
}

interface PatternRow {
  pattern: string
  prob: number
  count: number
  estRemaining: number
}

export function SuggestDebug() {
  const [manifestLengths, setManifestLengths] = useState<number[]>([])
  const [length, setLength] = useState<number>(5)
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState(6)
  const [attemptsMax, setAttemptsMax] = useState(6)
  const [tauInput, setTauInput] = useState<string>('') // blank means no override
  const [seed, setSeed] = useState<number>(12345)
  const [suggestions, setSuggestions] = useState<ReturnType<typeof suggestNext>>([])
  const [selectedGuess, setSelectedGuess] = useState<string | null>(null)
  const [patternPreview, setPatternPreview] = useState<PatternRow[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)

  // Load manifest once
  useEffect(() => {
    loadEnManifest().then((m) => {
      if (m.lengths.length) setManifestLengths(m.lengths)
    })
  }, [])

  // Load chosen length wordlist
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setErr(null)
    setLoaded(null)
    loadWordlistSet(length)
      .then((set) => {
        if (cancelled) return
        setLoaded({ length: set.length, words: set.words, priors: set.priors })
        setLoading(false)
      })
      .catch((e) => {
        if (cancelled) return
        setErr(String(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [length])

  const candidateSet = useMemo(() => (loaded ? new CandidateSet(loaded.words) : null), [loaded])

  const tau = useMemo(() => {
    const trimmed = tauInput.trim()
    if (!trimmed) return null
    const v = Number(trimmed)
    return isFinite(v) && v > 0 ? v : null
  }, [tauInput])

  const onSuggest = useCallback(() => {
    if (!candidateSet || !loaded) return
    const words = candidateSet.getAliveWords()
    const res = suggestNext(
      { words, priors: loaded.priors },
      { attemptsLeft, attemptsMax, tau, seed, topK: 3 },
    )
    setSuggestions(res)
    setSelectedGuess(null)
    setPatternPreview([])
  }, [candidateSet, loaded, attemptsLeft, attemptsMax, tau, seed])

  const onSelectGuess = useCallback(
    (g: string) => {
      setSelectedGuess(g)
      if (!loaded || !candidateSet) return
      const words = candidateSet.getAliveWords()
      if (words.length > 2500) {
        setPatternPreview([
          {
            pattern: '(too many candidates to enumerate patterns safely)',
            prob: 1,
            count: words.length,
            estRemaining: words.length,
          },
        ])
        return
      }
      setPreviewLoading(true)
      setTimeout(() => {
        // enumerate patterns
        const L = g.length
        const priors = loaded.priors
        // renormalize priors over words
        let sum = 0
        const masses = new Map<string, number>()
        const counts = new Map<string, number>()
        for (const w of words) sum += priors[w] || 0
        for (const w of words) {
          const mass = sum > 0 ? (priors[w] || 0) / sum : 1 / words.length
          const pat = feedbackPattern(g, w)
          const decoded = decodePattern(pat, L).join('')
          ;(masses.set(decoded, (masses.get(decoded) || 0) + mass),
            counts.set(decoded, (counts.get(decoded) || 0) + 1))
        }
        const rows: PatternRow[] = [...masses.entries()].map(([pattern, pmass]) => {
          const count = counts.get(pattern) || 0
          return { pattern, prob: pmass, count, estRemaining: pmass * count }
        })
        rows.sort((a, b) => b.prob - a.prob)
        setPatternPreview(rows)
        setPreviewLoading(false)
      }, 10)
    },
    [candidateSet, loaded],
  )

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ margin: '0 0 0.25rem' }}>Suggest Debug</h2>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>
        Explore scoring (EIG vs solve probability) directly on real wordlists.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem' }}>
        <label style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Length
          <select value={length} onChange={(e) => setLength(Number(e.target.value))}>
            {manifestLengths.length === 0 && <option value={length}>{length}</option>}
            {manifestLengths.map((L) => (
              <option key={L} value={L}>
                {L}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Attempts Left
          <input
            type="number"
            value={attemptsLeft}
            min={1}
            max={attemptsMax}
            onChange={(e) => setAttemptsLeft(Number(e.target.value))}
          />
        </label>
        <label style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Attempts Max
          <input
            type="number"
            value={attemptsMax}
            min={1}
            onChange={(e) => setAttemptsMax(Number(e.target.value))}
          />
        </label>
        <label style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Tau (blank=none)
          <input
            type="text"
            value={tauInput}
            placeholder="auto"
            onChange={(e) => setTauInput(e.target.value)}
          />
        </label>
        <label style={{ fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: 4 }}>
          Seed
          <input type="number" value={seed} onChange={(e) => setSeed(Number(e.target.value))} />
        </label>
        <button
          onClick={onSuggest}
          disabled={loading || !loaded}
          style={{ alignSelf: 'flex-end', padding: '0.5rem 0.75rem' }}
        >
          Suggest next guess
        </button>
      </div>
      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
        {loading && <div>Loading length {length} …</div>}
        {err && <div style={{ color: 'crimson' }}>Error: {err}</div>}
        {loaded && !loading && (
          <div style={{ marginBottom: '0.5rem' }}>
            Words: {loaded.words.length.toLocaleString()} (length {loaded.length})
          </div>
        )}
        {suggestions.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                minWidth: '600px',
                fontSize: '0.7rem',
              }}
            >
              <thead>
                <tr>
                  {['guess', 'eig (bits)', 'solveProb', 'alpha', 'expectedRemaining'].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: 'left',
                        borderBottom: '1px solid #ccc',
                        padding: '0.25rem 0.5rem',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => (
                  <tr
                    key={s.guess}
                    onClick={() => onSelectGuess(s.guess)}
                    style={{
                      cursor: 'pointer',
                      background: selectedGuess === s.guess ? '#eef' : undefined,
                    }}
                  >
                    <td style={{ padding: '0.25rem 0.5rem', fontFamily: 'monospace' }}>
                      {s.guess}
                    </td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{s.eig.toFixed(3)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{s.solveProb.toExponential(2)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{s.alpha.toFixed(3)}</td>
                    <td style={{ padding: '0.25rem 0.5rem' }}>{s.expectedRemaining.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ margin: '0.4rem 0 0', color: '#555' }}>
              Click a row to enumerate its feedback pattern distribution (small sets only).
            </p>
          </div>
        )}
        {selectedGuess && patternPreview.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ margin: '0 0 0.25rem' }}>What-if: {selectedGuess}</h3>
            {previewLoading && <div>Building pattern distribution…</div>}
            {!previewLoading && (
              <table style={{ borderCollapse: 'collapse', fontSize: '0.65rem' }}>
                <thead>
                  <tr>
                    {['pattern', 'prob', 'count', 'prob*count'].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: 'left',
                          borderBottom: '1px solid #ccc',
                          padding: '0.25rem 0.5rem',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {patternPreview.map((r) => (
                    <tr key={r.pattern}>
                      <td style={{ padding: '0.25rem 0.5rem', fontFamily: 'monospace' }}>
                        {r.pattern}
                      </td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{r.prob.toFixed(4)}</td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{r.count}</td>
                      <td style={{ padding: '0.25rem 0.5rem' }}>{r.estRemaining.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
