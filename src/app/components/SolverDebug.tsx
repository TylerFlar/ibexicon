import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { loadWordlistSet } from '@/solver/data/loader'
import { feedbackPattern } from '@/solver'
import { CandidateSet } from '@/solver'
import { decodePattern } from '@/solver'

interface LoadState {
  loading: boolean
  error: string | null
  set?: { length: number; words: string[] }
}

const LENGTH_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 11]

export function SolverDebug() {
  const [length, setLength] = useState<number>(5)
  const [state, setState] = useState<LoadState>({ loading: true, error: null })
  const [guess, setGuess] = useState('')
  const [secret, setSecret] = useState('')
  const [patternDigits, setPatternDigits] = useState<number[] | null>(null)
  const [alivePreview, setAlivePreview] = useState<string[]>([])
  const [aliveCount, setAliveCount] = useState<number>(0)

  // Load list when length changes
  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    loadWordlistSet(length)
      .then((set) => {
        if (cancelled) return
        setState({ loading: false, error: null, set: { length: set.length, words: set.words } })
        setGuess('')
        setSecret('')
        setPatternDigits(null)
        setAlivePreview([])
        setAliveCount(set.words.length)
      })
      .catch((e) => {
        if (cancelled) return
        setState({ loading: false, error: String(e), set: undefined })
      })
    return () => {
      cancelled = true
    }
  }, [length])

  const words = useMemo(() => state.set?.words ?? [], [state.set?.words])

  const isValidLength = useCallback(
    (w: string) => w.length === length && /^[a-z]+$/.test(w),
    [length],
  )

  // Compute pattern + filter when guess/secret valid
  useEffect(() => {
    if (!isValidLength(guess) || !isValidLength(secret) || words.length === 0) {
      setPatternDigits(null)
      return
    }
    const pat = feedbackPattern(guess, secret)
    const decoded = decodePattern(pat, length)
    setPatternDigits(decoded)

    const cs = new CandidateSet(words)
    cs.applyFeedback(guess, pat)
    const aliveWords = cs.getAliveWords()
    setAliveCount(aliveWords.length)
    setAlivePreview(aliveWords.slice(0, 20))
  }, [guess, secret, words, length, isValidLength])

  return (
    <section style={{ marginTop: '2rem' }}>
      <h2 style={{ margin: '0 0 0.25rem' }}>Solver Debug</h2>
      <p style={{ margin: 0, fontSize: '0.8rem', color: '#555' }}>
        Type a guess & a secret (client-side) to see feedback pattern & filtered candidates.
      </p>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', gap: 4 }}>
          Length
          <select
            value={length}
            onChange={(e) => setLength(Number(e.target.value))}
            style={{ padding: '0.25rem' }}
          >
            {LENGTH_OPTIONS.map((L) => (
              <option key={L} value={L}>
                {L}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', gap: 4 }}>
          Guess
          <input
            value={guess}
            onChange={(e) => setGuess(e.target.value.toLowerCase())}
            placeholder={'word'}
            style={{ padding: '0.25rem', width: '10rem' }}
          />
          <SmallValidityHint ok={!guess || isValidLength(guess)}>
            len {length}, a-z only
          </SmallValidityHint>
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.75rem', gap: 4 }}>
          Secret
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value.toLowerCase())}
            placeholder={'word'}
            style={{ padding: '0.25rem', width: '10rem' }}
          />
          <SmallValidityHint ok={!secret || isValidLength(secret)}>
            len {length}, a-z only
          </SmallValidityHint>
        </label>
      </div>

      <div style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
        {state.loading && <div>Loading wordlist…</div>}
        {state.error && <div style={{ color: 'crimson' }}>Error: {state.error}</div>}
        {!state.loading && !state.error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div>Total words: {words.length}</div>
            {patternDigits && (
              <div>
                Pattern: {patternDigits.join(' ')} &nbsp;|&nbsp; Alive after filter: {aliveCount}
              </div>
            )}
            {patternDigits && (
              <div style={{ maxWidth: '600px' }}>
                <strong>First {alivePreview.length} alive words:</strong>
                <div
                  style={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {alivePreview.join(' ')}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function SmallValidityHint({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span style={{ color: ok ? 'green' : 'crimson' }}>
      {ok ? '✔' : '✖'} {children}
    </span>
  )
}
