// Seed format (hash):  "#ibx:v1;<L>;<T>;<g1>:<p1>,<g2>:<p2>,..."
// where p_k is the 0/1/2 pattern string of length L (e.g., "01220")
// Only safe ASCII; no base64 needed. Example: #ibx:v1;5;6;crane:00000,stare:00120
import type { GuessEntry } from '@/app/state/session'

export interface SeedV1 {
  length: number
  attemptsMax: number
  history: GuessEntry[]
}

export function toSeedV1(s: SeedV1): string {
  const L = s.length | 0,
    T = s.attemptsMax | 0
  const parts = s.history.map(
    (h) => `${h.guess}:${(h.trits || []).map((t) => String(t | 0)).join('')}`,
  )
  return `#ibx:v1;${L};${T};${parts.join(',')}`
}

export function fromSeed(hash: string): SeedV1 | null {
  if (!hash || !hash.startsWith('#ibx:v1;')) return null
  const body = hash.slice('#ibx:v1;'.length)
  const firstSep = body.indexOf(';')
  if (firstSep < 0) return null
  const secondSep = body.indexOf(';', firstSep + 1)
  if (secondSep < 0) return null
  const L = Number(body.slice(0, firstSep))
  const T = Number(body.slice(firstSep + 1, secondSep))
  const rest = body.slice(secondSep + 1)
  if (!Number.isFinite(L) || !Number.isFinite(T) || L <= 0 || T <= 0) return null
  const history: GuessEntry[] = []
  if (rest.trim().length) {
    for (const chunk of rest.split(',')) {
      const [g, p] = chunk.split(':')
      if (!g || !p || g.length !== L || p.length !== L) continue
      const trits = Array.from(p).map((c) =>
        c === '2' ? 2 : c === '1' ? 1 : 0,
      ) as GuessEntry['trits']
      history.push({ guess: g.toLowerCase(), trits })
    }
    // If there was a non-empty section but nothing valid parsed, treat as malformed
    if (history.length === 0) return null
  }
  return { length: L, attemptsMax: T, history }
}

export function makeShareURL(seed: SeedV1, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '')
  const path = typeof window !== 'undefined' ? window.location.pathname : '/'
  return `${base}${path}${toSeedV1(seed)}`
}
