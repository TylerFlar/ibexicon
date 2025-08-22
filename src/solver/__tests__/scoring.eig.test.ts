import { describe, it, expect } from 'vitest'
import { suggestNext, type Suggestion } from '@/solver/scoring'

// Tiny vocab length 3 with uneven priors
// Chosen so that guess 'aaa' (MAP) merges patterns for two secrets, while 'abc' splits all.
const words = ['aaa', 'abb', 'abc']
const priors: Record<string, number> = { aaa: 0.6, abb: 0.25, abc: 0.15 }

function getByGuess<T extends { guess: string }>(arr: T[], guess: string): T {
  const f = arr.find((x) => x.guess === guess)
  if (!f) throw new Error('Missing guess ' + guess)
  return f
}

describe('scoring EIG sanity', () => {
  it('exact: split guess has higher EIG than MAP guess; MAP has highest solveProb', () => {
    const suggestions: Suggestion[] = suggestNext(
      { words, priors },
      { attemptsLeft: 5, attemptsMax: 6, topK: 3 },
    )
    const split = getByGuess(suggestions, 'abc') // splits all three
    const map = getByGuess(suggestions, 'aaa') // MAP guess merges patterns of 'abb' & 'abc'
    const mapSolveProb = map.solveProb
    for (const s of suggestions) {
      if (s.guess === 'aaa') continue
      expect(mapSolveProb).toBeGreaterThanOrEqual(s.solveProb - 1e-9)
    }
    expect(split.eig).toBeGreaterThan(map.eig + 1e-6)
  })

  it('sampling approximation close to exact (EIG within ±0.1 bits)', () => {
    const exact: Suggestion[] = suggestNext(
      { words, priors },
      { attemptsLeft: 5, attemptsMax: 6, topK: 3 },
    )
    const approx: Suggestion[] = suggestNext(
      { words, priors },
      { attemptsLeft: 5, attemptsMax: 6, topK: 3, sampleCutoff: 0, sampleSize: 2000, seed: 42 },
    )
    // Compare per guess EIG
    for (const e of exact) {
      const a = approx.find((x) => x.guess === e.guess)!
      const diff = Math.abs(e.eig - a.eig)
      expect(diff).toBeLessThanOrEqual(0.1)
    }
  })
})
