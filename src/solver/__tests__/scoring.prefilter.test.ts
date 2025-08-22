import { describe, it, expect } from 'vitest'
import { suggestNext } from '@/solver/scoring'

// Helper to build random words with limited alphabet
function randomWords(count: number, length: number, alphabet: string, seed = 1234) {
  let t = seed >>> 0
  function rand() {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
  const words: string[] = []
  for (let i = 0; i < count; i++) {
    let w = ''
    for (let j = 0; j < length; j++) {
      const idx = Math.floor(rand() * alphabet.length)
      w += alphabet[idx]!
    }
    words.push(w)
  }
  return words
}

describe('scoring prefilter fidelity', () => {
  it('prefilter retains (or closely matches) best composite score', () => {
    const N = 2500 // keep runtime modest
    const length = 5
    const alphabet = 'abcdefghij' // 10 letters
    const words = randomWords(N, length, alphabet, 42)
    // Random priors, then normalize
    const priors: Record<string, number> = {}
    let sum = 0
    for (const w of words) {
      const r = Math.random() + 0.01 // avoid zeros
      priors[w] = r
      sum += r
    }
    for (const w of words) priors[w]! /= sum

    const base = suggestNext(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        prefilterLimit: Number.POSITIVE_INFINITY,
        sampleCutoff: 0, // force sampling
        sampleSize: 600,
        seed: 999,
      },
    )[0]!
    const filtered = suggestNext(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        prefilterLimit: 500,
        sampleCutoff: 0,
        sampleSize: 600,
        seed: 999,
      },
    )[0]!

    const baseScore = base.alpha * base.eig + (1 - base.alpha) * base.solveProb
    const filteredScore = filtered.alpha * filtered.eig + (1 - filtered.alpha) * filtered.solveProb

    const TOL = 5e-4 // heuristic prefilter can exclude a near-tied guess; keep tolerance small but realistic.
    if (filtered.guess === base.guess) {
      expect(filteredScore).toBeCloseTo(baseScore, 6)
    } else {
      const diff = Math.abs(baseScore - filteredScore)
      expect(diff).toBeLessThanOrEqual(TOL)
    }
  })
})
