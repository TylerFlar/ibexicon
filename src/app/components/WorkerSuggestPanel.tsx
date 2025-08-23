import { useEffect, useMemo, useRef, useState } from 'react'
import { loadManifest, loadWordlistSet } from '@/solver/data/loader'
import { SolverWorkerClient, makeAbortController } from '@/worker/client'

interface LoadedSet {
  length: number
  words: string[]
  priors: Record<string, number>
}

export function WorkerSuggestPanel() {
  const workerAvailable = typeof Worker !== 'undefined'
  const client = useMemo(
    () => (workerAvailable ? new SolverWorkerClient() : (null as any)),
    [workerAvailable],
  )
  const [manifestLengths, setManifestLengths] = useState<number[]>([])
  const [selectedLen, setSelectedLen] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<LoadedSet | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState(6)
  const [attemptsMax, setAttemptsMax] = useState(6)
  const [tauInput, setTauInput] = useState<string>('auto')
  const [seed, setSeed] = useState<number | undefined>(undefined)
  const [status, setStatus] = useState<string>('idle')
  const [progress, setProgress] = useState(0)
  const abortRef = useRef<AbortController | null>(null)
  const [suggestions, setSuggestions] = useState<
    { guess: string; eig: number; solveProb: number; alpha: number; expectedRemaining: number }[]
  >([])

  // Load manifest once
  useEffect(() => {
    let mounted = true
    loadManifest().then((m) => {
      if (!mounted) return
      setManifestLengths(m.lengths)
      if (m.lengths.length) setSelectedLen(m.lengths[0]!)
    })
    if (workerAvailable)
      client.warmup().catch(() => {
        /* ignore */
      })
    return () => {
      mounted = false
      if (workerAvailable) client.dispose()
    }
  }, [client, workerAvailable])

  // Load wordlist when length changes
  useEffect(() => {
    if (selectedLen == null) return
    let cancel = false
    setLoaded(null)
    setStatus('loading list')
    loadWordlistSet(selectedLen)
      .then((set) => {
        if (cancel) return
        setLoaded(set)
        setStatus('ready')
      })
      .catch((err) => {
        if (cancel) return
        setStatus('error: ' + err.message)
      })
    return () => {
      cancel = true
    }
  }, [selectedLen])

  function startScore() {
    if (!loaded || !workerAvailable) return
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const ac = makeAbortController()
    abortRef.current = ac
    setStatus('scoring...')
    setProgress(0)
    setSuggestions([])
    const tau = tauInput.trim().toLowerCase() === 'auto' ? null : Number(tauInput)
    client
      .score(
        {
          words: loaded.words,
          priors: loaded.priors,
          attemptsLeft,
          attemptsMax,
          tau,
          seed,
          onProgress: (p: number) => setProgress(p),
        },
        ac.signal,
      )
      .then((res: { suggestions: typeof suggestions; canceled?: boolean }) => {
        if (res.canceled) {
          setStatus('canceled')
        } else {
          setStatus('done')
          setSuggestions(res.suggestions)
        }
      })
      .catch((err: any) => setStatus('error: ' + (err?.message || String(err))))
  }

  function cancel() {
    abortRef.current?.abort()
    if (workerAvailable) client.cancel()
  }

  if (!workerAvailable) {
    return (
      <section style={{ marginTop: '2rem' }}>
        <h2>Worker Suggest Panel</h2>
        <p style={{ fontSize: '0.85rem', color: '#666' }}>
          Web Workers not available in this environment.
        </p>
      </section>
    )
  }
  return (
    <section style={{ marginTop: '2rem' }}>
      <h2>Worker Suggest Panel</h2>
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>
          Length:
          <select
            value={selectedLen ?? ''}
            onChange={(e) => setSelectedLen(Number(e.target.value) || null)}
            disabled={!manifestLengths.length}
          >
            {manifestLengths.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Attempts Left:
          <input
            type="number"
            value={attemptsLeft}
            min={1}
            onChange={(e) => setAttemptsLeft(Number(e.target.value) || 1)}
            style={{ width: '4rem' }}
          />
        </label>
        <label>
          Attempts Max:
          <input
            type="number"
            value={attemptsMax}
            min={1}
            onChange={(e) => setAttemptsMax(Number(e.target.value) || 1)}
            style={{ width: '4rem' }}
          />
        </label>
        <label>
          Tau (number or "auto"):
          <input
            value={tauInput}
            onChange={(e) => setTauInput(e.target.value)}
            style={{ width: '6rem' }}
          />
        </label>
        <label>
          Seed:
          <input
            type="number"
            value={seed ?? ''}
            onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : undefined)}
            style={{ width: '6rem' }}
          />
        </label>
        <button onClick={startScore} disabled={!loaded || status === 'scoring...'}>
          Score (Worker)
        </button>
        <button onClick={cancel} disabled={status !== 'scoring...'}>
          Cancel
        </button>
      </div>
      <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#444' }}>
        Status: {status}
      </div>
      <div
        style={{
          marginTop: '0.5rem',
          height: '8px',
          background: '#eee',
          borderRadius: '4px',
          position: 'relative',
          overflow: 'hidden',
          maxWidth: '400px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${Math.round(progress * 100)}%`,
            background: progress < 1 ? '#3b82f6' : '#16a34a',
            transition: 'width 120ms linear',
          }}
        />
      </div>
      {suggestions.length > 0 && (
        <table style={{ marginTop: '1rem', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #ccc' }}>
                Guess
              </th>
              <th
                style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}
              >
                EIG
              </th>
              <th
                style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}
              >
                SolveProb
              </th>
              <th
                style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}
              >
                Alpha
              </th>
              <th
                style={{ textAlign: 'right', padding: '4px 8px', borderBottom: '1px solid #ccc' }}
              >
                E[Remain]
              </th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s) => (
              <tr key={s.guess}>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #eee' }}>{s.guess}</td>
                <td
                  style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}
                >
                  {s.eig.toFixed(2)}
                </td>
                <td
                  style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}
                >
                  {(s.solveProb * 100).toFixed(2)}%
                </td>
                <td
                  style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}
                >
                  {s.alpha.toFixed(2)}
                </td>
                <td
                  style={{ padding: '4px 8px', borderBottom: '1px solid #eee', textAlign: 'right' }}
                >
                  {s.expectedRemaining.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
