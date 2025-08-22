import { describe, it, expect } from 'vitest'
import { alphaFor } from '@/solver/scoring'

describe('alpha schedule', () => {
  it('monotone increasing in size', () => {
    const attemptsLeft = 6
    const attemptsMax = 6
    let prev = 0
    for (const size of [2, 5, 10, 50, 100, 1000, 10000]) {
      const a = alphaFor(size, attemptsLeft, attemptsMax)
      expect(a).toBeGreaterThanOrEqual(prev - 1e-12)
      prev = a
    }
  })

  it('increases (or stays) as attemptsLeft decreases (more pressure)', () => {
    const size = 500
    const attemptsMax = 6
    const aStart = alphaFor(size, attemptsMax, attemptsMax)
    const aMid = alphaFor(size, 3, attemptsMax)
    const aEnd = alphaFor(size, 1, attemptsMax)
    expect(aMid).toBeGreaterThanOrEqual(aStart - 1e-12)
    expect(aEnd).toBeGreaterThanOrEqual(aMid - 1e-12)
  })
})
