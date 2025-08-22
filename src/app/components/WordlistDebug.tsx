import { useEffect, useState } from 'react'
import { loadEnManifest } from '../../solver/data/manifest'
import { loadWordlistSet } from '../../solver/data/loader'
import type { WordlistSet } from '../../solver/data/loader'

interface LengthState {
  loading: boolean
  error?: string
  data?: WordlistSet
}

export function WordlistDebug() {
  const [lengths, setLengths] = useState<number[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [state, setState] = useState<LengthState | null>(null)

  useEffect(() => {
    ;(async () => {
      const m = await loadEnManifest()
      setLengths(m.lengths || [])
      setMeta(m.meta || null)
    })()
  }, [])

  const pick = async (L: number) => {
    setSelected(L)
    setState({ loading: true })
    try {
      const data = await loadWordlistSet(L)
      setState({ loading: false, data })
    } catch (e: any) {
      setState({ loading: false, error: e.message || String(e) })
    }
  }

  const renderSet = () => {
    if (!state) return null
    if (state.loading) return <p style={{ color: '#888' }}>Loading length {selected}…</p>
    if (state.error) return <p style={{ color: 'crimson' }}>Error: {state.error}</p>
    if (!state.data) return null
    const { words, priors, length } = state.data
    const top = [...Object.entries(priors)]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
    const sum = Object.values(priors).reduce((s, v) => s + v, 0)
    return (
      <div style={{ marginTop: '1rem' }}>
        <h3 style={{ margin: '0.25rem 0' }}>Length {length}</h3>
        <p style={{ margin: '0.25rem 0', fontSize: '0.9rem' }}>
          Words: {words.length.toLocaleString()} | Sum priors: {sum.toFixed(6)}
        </p>
        <table style={{ borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={th}>Word</th>
              <th style={th}>Prior</th>
            </tr>
          </thead>
          <tbody>
            {top.map(([w, p]) => (
              <tr key={w}>
                <td style={td}>{w}</td>
                <td style={td}>{p.toExponential(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div style={{ marginTop: '2rem' }}>
      <h2 style={{ margin: '0 0 0.5rem' }}>Wordlist Debug</h2>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        {lengths.map(L => (
          <button
            key={L}
            onClick={() => pick(L)}
            style={{
              padding: '0.4rem 0.65rem',
              borderRadius: 4,
              cursor: 'pointer',
              background: selected === L ? '#1565c0' : '#1976d2',
              color: 'white',
              border: 'none',
              fontSize: '0.75rem',
            }}
          >
            {L}
          </button>
        ))}
        {!lengths.length && <span style={{ color: '#888' }}>Loading manifest…</span>}
      </div>
      {meta && (
        <p style={{ margin: '0.5rem 0', fontSize: '0.75rem', color: '#555' }}>
          α={meta.alpha} μMode={meta.muMode || 'piecewise'} τ={meta.tau} short={meta.muFactorShort} long={meta.muFactorLong}
        </p>
      )}
      {renderSet()}
    </div>
  )
}

const th: React.CSSProperties = { textAlign: 'left', padding: '2px 4px', borderBottom: '1px solid #ccc' }
const td: React.CSSProperties = { padding: '2px 4px', borderBottom: '1px solid #eee', fontFamily: 'monospace' }

export default WordlistDebug
