import { describe, it, expect } from 'vitest'
import { suggestNext, CanceledError } from '@/solver/scoring'

describe('scoring progress & cancellation', () => {
  it('reports progress and honors cancellation', () => {
    const words = Array.from({ length: 40 }, (_, i) =>
      `a${(i + 100).toString(36)}`.slice(0, 5).padEnd(5, 'a'),
    )
    const priors: Record<string, number> = {}
    for (const w of words) priors[w] = 1
    let progressCalls = 0
    let canceled = false
    const opts = {
      attemptsLeft: 4,
      attemptsMax: 6,
      tau: 1.5,
      chunkSize: 5,
      shouldCancel: () => canceled,
      onProgress: () => {
        progressCalls++
        canceled = true // cancel after first reported chunk
      },
    }
    expect(() => suggestNext({ words, priors }, opts)).toThrow(CanceledError)
    expect(progressCalls).toBeGreaterThan(0)
  })
})
