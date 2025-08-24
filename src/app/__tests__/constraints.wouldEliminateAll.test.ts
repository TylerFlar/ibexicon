import { describe, it, expect } from 'vitest'
import { wouldEliminateAll } from '@/app/logic/constraints'
import type { GuessEntry, Trit } from '@/app/state/session'

// Focused unit tests for wouldEliminateAll covering edge branches.

describe('wouldEliminateAll', () => {
  const words = ['aaaa', 'aaab', 'aaba']
  const history: GuessEntry[] = []

  it('returns false early for length mismatch', () => {
    const res = wouldEliminateAll(words, history, 'aaaa', [0, 0, 0] as Trit[])
    expect(res).toBe(false)
  })

  it('detects elimination of all candidates', () => {
    // Pattern all 0 (absent) would eliminate every word because all contain only a/b.
    const res = wouldEliminateAll(words, history, 'aaaa', [0, 0, 0, 0] as Trit[])
    expect(res).toBe(true)
  })

  it('non-eliminating feedback returns false', () => {
    // All greens keeps at least the exact word alive.
    const res = wouldEliminateAll(words, history, 'aaaa', [2, 2, 2, 2] as Trit[])
    expect(res).toBe(false)
  })
})
