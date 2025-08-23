import { feedbackPattern } from '@/solver/feedback'

// --- Heatmap ---
export interface HeatmapResult {
  length: number
  mass: number[][] // [position][letterIndex 0..25]
  letterIndex: string[]
}

// Normalize priors into a Float64Array that sums to 1. Falls back to uniform if invalid.
function normalizePriors(words: string[], priors: Float64Array): Float64Array {
  const n = words.length
  const out = new Float64Array(n)
  if (priors.length !== n) {
    // length mismatch; uniform
    const u = 1 / (n || 1)
    for (let i = 0; i < n; i++) out[i] = u
    return out
  }
  let sum = 0
  for (let i = 0; i < n; i++) {
    const v = priors[i]!
    if (v > 0 && Number.isFinite(v)) {
      out[i] = v
      sum += v
    } else {
      out[i] = 0
    }
  }
  if (sum <= 0) {
    const u = 1 / (n || 1)
    for (let i = 0; i < n; i++) out[i] = u
    return out
  }
  const inv = 1 / sum
  for (let i = 0; i < n; i++) out[i]! *= inv
  return out
}

export function letterPositionHeatmap(words: string[], priors: Float64Array): HeatmapResult {
  const n = words.length
  if (n === 0) {
    return { length: 0, mass: [], letterIndex: Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)) }
  }
  const L = words[0]!.length
  const p = normalizePriors(words, priors)
  // mass[pos][letter]
  const mass: number[][] = Array.from({ length: L }, () => new Array<number>(26).fill(0))
  for (let k = 0; k < n; k++) {
    const w = words[k]!
    if (w.length !== L) continue // skip inconsistent length
    const pk = p[k]!
    if (pk === 0) continue
    for (let i = 0; i < L; i++) {
      const c = w.charCodeAt(i) - 97
      if (c >= 0 && c < 26) {
        mass[i]![c]! += pk
      }
    }
  }
  // Normalize each position column to sum ~1 (may already be the case unless lengths inconsistent)
  for (let i = 0; i < L; i++) {
    let colSum = 0
    const row = mass[i]!
    for (let c = 0; c < 26; c++) colSum += row[c]!
    if (colSum > 0) {
      const inv = 1 / colSum
      for (let c = 0; c < 26; c++) row[c]! *= inv
    }
  }
  const letterIndex = Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i))
  return { length: L, mass, letterIndex }
}

// --- Guess Explanation ---
export interface GuessSplit {
  pattern: number | string
  prob: number // P(pattern | guess, S)
  bucketCount: number // #secrets with that pattern (or estimate if sampled)
}
export interface GuessExplain {
  guess: string
  expectedGreens: number
  posMatchMass: number[]
  coverageMass: number
  splits: GuessSplit[]
}

interface SampleSpec { size: number }

// Weighted sampling without replacement using Efraimidis-Spirakis algorithm.
function weightedSampleWithoutReplacement(weights: Float64Array, k: number): number[] {
  const n = weights.length
  if (k >= n) return Array.from({ length: n }, (_, i) => i)
  // Generate key = log(r)/w (more negative means higher priority) and select k smallest.
  const keys: { key: number; idx: number }[] = []
  for (let i = 0; i < n; i++) {
    const w = weights[i]!
    if (w <= 0) continue
    const r = Math.random()
    const key = Math.log(r) / w
    if (keys.length < k) {
      keys.push({ key, idx: i })
      if (keys.length === k) {
        // build max-heap like structure by simple sort (descending key so largest key removed first)
        keys.sort((a, b) => b.key - a.key)
      }
    } else if (key > keys[0]!.key) {
      // replace worst (largest key) then resort
      keys[0] = { key, idx: i }
      keys.sort((a, b) => b.key - a.key)
    }
  }
  return keys.map(kv => kv.idx)
}

export function explainGuess(guess: string, words: string[], priors: Float64Array, sample?: SampleSpec | null): GuessExplain {
  const n = words.length
  const L = guess.length
  if (n === 0) {
    return { guess, expectedGreens: 0, posMatchMass: new Array(L).fill(0), coverageMass: 0, splits: [] }
  }
  const p = normalizePriors(words, priors)

  // Position match masses
  const posMatchMass = new Array<number>(L).fill(0)
  // Coverage calculation: build bitmask of guess letters
  let guessMask = 0
  for (let i = 0; i < L; i++) {
    const c = guess.charCodeAt(i) - 97
    if (c >= 0 && c < 26) guessMask |= (1 << c)
  }

  let coverageMass = 0
  for (let k = 0; k < n; k++) {
    const w = words[k]!
    if (w.length !== L) continue
    const pk = p[k]!
    if (pk === 0) continue
    // pos matches
    for (let i = 0; i < L; i++) {
      if (w[i] === guess[i]) posMatchMass[i]! += pk
    }
    // coverage
    let mask = 0
    for (let i = 0; i < w.length; i++) {
      const c = w.charCodeAt(i) - 97
      if (c >= 0 && c < 26) mask |= (1 << c)
    }
    if ((mask & guessMask) !== 0) coverageMass += pk
  }
  let expectedGreens = 0
  for (let i = 0; i < L; i++) expectedGreens += posMatchMass[i]!

  // Splits
  const useSample = sample && sample.size > 0 && sample.size < n
  let indices: number[]
  if (useSample) {
    indices = weightedSampleWithoutReplacement(p, sample!.size)
  } else {
    indices = Array.from({ length: n }, (_, i) => i)
  }
  let sampleMass = 0
  if (useSample) {
    for (const idx of indices) sampleMass += p[idx]!
    if (sampleMass <= 0) sampleMass = 1 // avoid div by zero
  }
  const massScale = useSample ? 1 / sampleMass : 1
  const countScale = useSample ? (words.length / indices.length) : 1

  const bucketProb = new Map<number | string, number>()
  const bucketCount = new Map<number | string, number>()

  for (const idx of indices) {
    const secret = words[idx]!
    if (secret.length !== L) continue
    const pat = feedbackPattern(guess, secret)
    const pk = p[idx]!
    bucketProb.set(pat, (bucketProb.get(pat) || 0) + pk * massScale)
    bucketCount.set(pat, (bucketCount.get(pat) || 0) + 1)
  }

  const splits: GuessSplit[] = []
  bucketProb.forEach((prob, pat) => {
    const rawCount = bucketCount.get(pat) || 0
    const estCount = Math.max(1, Math.round(rawCount * countScale))
    splits.push({ pattern: pat, prob, bucketCount: estCount })
  })
  splits.sort((a, b) => b.prob - a.prob)

  return { guess, expectedGreens, posMatchMass, coverageMass, splits }
}
