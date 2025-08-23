import { feedbackPattern } from '@/solver/feedback'
import type { PatternValue } from '@/solver/pattern'
import { useNumericPattern } from '@/solver/pattern'
import { mulberry32 } from './random'

export interface ScoringOpts {
  attemptsLeft: number
  attemptsMax: number
  topK?: number // default 3
  sampleCutoff?: number // exact if |S| <= sampleCutoff (default 5000)
  sampleSize?: number // when sampling, secrets drawn ~prior-weighted (default 3000)
  tau?: number | null // optional runtime temperature; if null -> no shaping
  seed?: number // optional RNG seed for sampling
  prefilterLimit?: number // when |S| is huge, score only top M (default 2000)
  onProgress?: (percent: number) => void // optional progress callback (0..1)
  shouldCancel?: () => boolean // return true to request cancellation
  chunkSize?: number // secrets per chunk for progress/cancel checks (default 8000)
}

export interface Suggestion {
  guess: string
  eig: number // bits
  solveProb: number // P(secret==guess)
  alpha: number
  expectedRemaining: number // E[|S'|]
}

export interface ScoringInput {
  words: string[] // current candidate set S (alive only)
  priors: Record<string, number> // prior mass over words; will be renormalized on S
}

export function alphaFor(size: number, attemptsLeft: number, attemptsMax: number): number {
  const s = 1 / (1 + Math.exp(-(Math.log10(Math.max(2, size)) - 3) / 1.2)) // size curve
  const t = 1 - attemptsLeft / Math.max(1, attemptsMax) // turn pressure
  const a = 0.15 + 0.7 * s + 0.15 * t
  return Math.min(0.95, Math.max(0.1, a))
}

/** In-place temperature shaping: p_i <- p_i^{1/tau}; then renormalize */
export function applyTemperature(mass: Float64Array, tau: number): void {
  if (!isFinite(tau) || tau <= 0) return
  const invT = 1 / tau
  let sum = 0
  for (let i = 0; i < mass.length; i++) {
    const m = mass[i]!
    const shaped = m <= 0 ? 0 : Math.pow(m, invT)
    mass[i]! = shaped
    sum += shaped
  }
  if (sum > 0) {
    const invSum = 1 / sum
    for (let i = 0; i < mass.length; i++) mass[i]! *= invSum
  }
}

export function computeSolveProbIndex(
  words: string[],
  renormPriors: Float64Array,
  guessIdx: number,
): number {
  if (guessIdx >= 0 && guessIdx < words.length) return renormPriors[guessIdx] || 0
  return 0
}

interface PatternAccum {
  mass: number
  massLog: number
  count: number
}

/** Quick heuristic used for prefiltering large candidate sets */
function heuristicOrder(words: string[], priors: Float64Array, limit: number): number[] {
  const N = words.length
  if (N <= limit) return [...Array(N).keys()]
  const L = words[0]?.length || 0
  // letter-position frequency weights
  const weights: number[][] = Array.from({ length: L }, () => Array(26).fill(0))
  for (let i = 0; i < N; i++) {
    const w = words[i]!
    const p = priors[i]!
    for (let pos = 0; pos < L; pos++) {
      const c = w.charCodeAt(pos) - 97
      if (c >= 0 && c < 26) {
        const row = weights[pos]!
        row[c]! += p
      }
    }
  }
  const scores = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const w = words[i]!
    let s = 0
    const seen = new Set<number>()
    for (let pos = 0; pos < L; pos++) {
      const c = w.charCodeAt(pos) - 97
      if (c >= 0 && c < 26) {
        const row = weights[pos]!
        s += row[c]! || 0
        seen.add(c)
      }
    }
    // unique letter bonus: proportional to coverage variety
    s += seen.size * 1e-6 // tiny tie-breaker scaling
    scores[i] = s
  }
  // Collect top indices: partial selection using simple nth_element style
  const idxs = [...Array(N).keys()]
  idxs.sort((a, b) => scores[b]! - scores[a]!)
  return idxs.slice(0, limit)
}

/** Select top M by prior mass */
function topByPrior(priors: Float64Array, m: number): number[] {
  const idxs = [...Array(priors.length).keys()]
  idxs.sort((a, b) => priors[b]! - priors[a]!)
  return idxs.slice(0, m)
}

export function suggestNext(input: ScoringInput, opts: ScoringOpts): Suggestion[] {
  const { words, priors } = input
  const N = words.length
  if (N === 0) return []
  const topK = opts.topK ?? 3
  const sampleCutoff = opts.sampleCutoff ?? 5000
  const sampleSize = opts.sampleSize ?? 3000
  const prefilterLimit = opts.prefilterLimit ?? 2000
  const chunkSize = opts.chunkSize && opts.chunkSize > 0 ? opts.chunkSize : DEFAULT_CHUNK_SIZE
  const reportProgress = opts.onProgress
  const checkCancel = opts.shouldCancel
  // Build renormalized prior array over S
  const p = new Float64Array(N)
  let sum = 0
  for (let i = 0; i < N; i++) {
    const mass = priors[words[i]!] ?? 0
    p[i]! = mass > 0 ? mass : 0
    sum += p[i]!
  }
  if (sum === 0) {
    const uniform = 1 / N
    for (let i = 0; i < N; i++) p[i]! = uniform
  } else {
    const inv = 1 / sum
    for (let i = 0; i < N; i++) p[i]! *= inv
  }
  // Optional temperature shaping
  if (opts.tau != null) applyTemperature(p, opts.tau)

  // Precompute entropy H(S)
  let H = 0
  for (let i = 0; i < N; i++) {
    const pi = p[i]!
    if (pi > 0) H -= pi * Math.log2(pi)
  }

  // Prefilter indices
  let candidateIdxs: number[]
  if (N > prefilterLimit) {
    const heur = heuristicOrder(words, p, prefilterLimit)
    const priorTop = topByPrior(p, 50)
    const set = new Set<number>([...heur, ...priorTop])
    candidateIdxs = [...set]
  } else {
    candidateIdxs = [...Array(N).keys()]
  }

  const alpha = alphaFor(N, opts.attemptsLeft, opts.attemptsMax)
  const L = words[0]!.length
  // eslint-disable-next-line react-hooks/rules-of-hooks -- this is a pure utility, not a React hook usage scenario.
  const numeric = useNumericPattern(L)

  const results: {
    idx: number
    eig: number
    solveProb: number
    expectedRemaining: number
    score: number
  }[] = []

  // Sampling setup (for secrets distribution only) when approximating entropy
  const useSampling = N > sampleCutoff
  let sampleIdxs: number[] = []
  if (useSampling) {
    // Build cumulative distribution
    const cum = new Float64Array(N)
    let acc = 0
    for (let i = 0; i < N; i++) {
      acc += p[i]!
      cum[i]! = acc
    }
    const rand = mulberry32(opts.seed ?? 123456789)
    for (let k = 0; k < sampleSize; k++) {
      const r = rand()
      // binary search
      let lo = 0
      let hi = N - 1
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (cum[mid]! < r) lo = mid + 1
        else hi = mid
      }
      sampleIdxs.push(lo)
    }
  }

  // Map: pattern -> accum; we use JS object (string keys) even when numeric to avoid Map overhead on small sets
  // Progress accounting: total chunks across all guesses * secrets iteration
  const perGuessSecretCount = N > sampleCutoff ? sampleSize : N
  const chunksPerGuess = Math.ceil(perGuessSecretCount / chunkSize)
  const totalChunks = candidateIdxs.length * chunksPerGuess
  let processedChunks = 0

  for (const guessIdx of candidateIdxs) {
    const guess = words[guessIdx]!
    const accum: Record<string, PatternAccum> = Object.create(null)
    if (!useSampling) {
      for (let start = 0; start < N; start += chunkSize) {
        const end = Math.min(N, start + chunkSize)
        for (let si = start; si < end; si++) {
          const secret = words[si]!
          const pat: PatternValue = feedbackPattern(guess, secret)
          const key = numeric ? String(pat) : (pat as string) // numeric path stringified
          let a = accum[key]
          if (!a) {
            a = accum[key] = { mass: 0, massLog: 0, count: 0 }
          }
          const w = p[si]!
          a.mass += w
          if (w > 0) a.massLog += w * Math.log2(w)
          a.count++
        }
        processedChunks++
        if (reportProgress) reportProgress(processedChunks / totalChunks)
        if (checkCancel && checkCancel()) throw new CanceledError()
      }
    } else {
      const nSamp = sampleIdxs.length
      const inc = 1 / sampleSize
      for (let start = 0; start < nSamp; start += chunkSize) {
        const end = Math.min(nSamp, start + chunkSize)
        for (let k = start; k < end; k++) {
          const si = sampleIdxs[k]!
          const secret = words[si]!
          const pat: PatternValue = feedbackPattern(guess, secret)
          const key = numeric ? String(pat) : (pat as string)
          let a = accum[key]
          if (!a) a = accum[key] = { mass: 0, massLog: 0, count: 0 }
          a.mass += inc // approximate pattern probability
          const w = p[si]!
          if (w > 0) a.massLog += inc * Math.log2(w) // approximates Σ p_i log p_i via expectation
          a.count++
        }
        processedChunks++
        if (reportProgress) reportProgress(processedChunks / totalChunks)
        if (checkCancel && checkCancel()) throw new CanceledError()
      }
    }
    // Compute expected entropy after guess
    let sumHpost = 0
    let expectedRemaining = 0
    for (const key in accum) {
      const a = accum[key]!
      const mass = a.mass
      if (mass <= 0) continue
      // H(S_p) = log2(mass) - massLog/mass
      const Hpost = Math.log2(mass) - a.massLog / mass
      sumHpost += mass * Hpost
      if (!useSampling) {
        expectedRemaining += mass * a.count
      } else {
        expectedRemaining += mass * (a.count / sampleSize) * N
      }
    }
    const eig = H - sumHpost
    const solveProb = computeSolveProbIndex(words, p, guessIdx)
    const score = alpha * eig + (1 - alpha) * solveProb
    results.push({ idx: guessIdx, eig, solveProb, expectedRemaining, score })
  }

  results.sort((a, b) => b.score - a.score || a.idx - b.idx)
  return results.slice(0, topK).map((r) => ({
    guess: words[r.idx]!,
    eig: r.eig,
    solveProb: r.solveProb,
    alpha,
    expectedRemaining: r.expectedRemaining,
  }))
}

export class CanceledError extends Error {
  constructor() {
    super('canceled')
    this.name = 'CanceledError'
  }
}

export const DEFAULT_CHUNK_SIZE = 8000
