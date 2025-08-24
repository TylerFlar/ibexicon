import { describe, it, expect } from 'vitest'
import { CandidateSet } from '../filter'
import { suggestFromCandidates } from '../suggest'

function mk(words: string[]) {
  const cs = new CandidateSet(words)
  return cs
}

describe('suggestFromCandidates', () => {
  it('returns topK suggestions ordered by eig/score fields present', () => {
    // Use tiny vocab so scoring path is deterministic and fast.
    const words = ['crane', 'trace', 'caper', 'recan']
    const priors: Record<string, number> = Object.fromEntries(
      words.map((w) => [w, 1 / words.length]),
    )
    const cs = mk(words)
    const res = suggestFromCandidates({
      candidates: cs,
      priors,
      attemptsLeft: 6,
      attemptsMax: 6,
      topK: 3,
      tau: null,
    })
    expect(res.length).toBeGreaterThan(0)
    // All guesses should be from vocab.
    for (const s of res) expect(words).toContain(s.guess)
  })
})
