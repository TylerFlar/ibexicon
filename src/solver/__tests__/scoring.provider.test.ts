import { describe, it, expect } from 'vitest'
import { suggestNextWithProvider, alphaFor, applyTemperature } from '@/solver/scoring'
import { feedbackPattern } from '@/solver/feedback'

// Build a small synthetic corpus where provider precomputed patterns path and sampling path are exercised.

describe('suggestNextWithProvider provider + sampling paths', () => {
  const words = Array.from({ length: 30 }, (_, i) =>
    `w${(i + 100).toString(36)}`.slice(0, 5).padEnd(5, 'a'),
  )
  const priors: Record<string, number> = {}
  for (const w of words) priors[w] = 1

  // Precompute pattern rows for each possible guess.
  const patternMap: Record<string, Uint16Array> = {}
  for (const guess of words) {
    const arr = new Uint16Array(words.length)
    for (let i = 0; i < words.length; i++) {
      arr[i] = feedbackPattern(guess, words[i]!) as number
    }
    patternMap[guess] = arr
  }

  it('returns suggestions using provider patterns (sampling on)', async () => {
    const res = await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 4,
        attemptsMax: 6,
        sampleCutoff: 10, // force sampling path (N=30 > 10)
        sampleSize: 15,
        getPrecomputedPatterns: (g) => patternMap[g]!,
        chunkSize: 8,
        seed: 42,
      },
    )
    expect(res.length).toBeGreaterThan(0)
    expect(res[0]!.guess).toBeTypeOf('string')
  })
})

describe('alphaFor & applyTemperature edge cases', () => {
  it('alphaFor bounded between 0.1 and 0.95', () => {
    const small = alphaFor(1, 10, 10)
    const huge = alphaFor(1000000, 1, 10)
    expect(small).toBeGreaterThanOrEqual(0.1)
    expect(huge).toBeLessThanOrEqual(0.95)
  })

  it('applyTemperature no-op for non-positive tau', () => {
    const arr = new Float64Array([0.2, 0.3, 0.5])
    applyTemperature(arr, 0)
    expect([...arr]).toEqual([0.2, 0.3, 0.5])
    applyTemperature(arr, -1)
    expect([...arr]).toEqual([0.2, 0.3, 0.5])
  })
})
