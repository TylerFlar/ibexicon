import { describe, it, expect } from 'vitest'
import { letterPositionHeatmap, explainGuess } from '@/solver/analysis'

describe('analysis normalization & sampling edge cases', () => {
  it('letterPositionHeatmap handles empty list', () => {
    const res = letterPositionHeatmap([], new Float64Array())
    expect(res.length).toBe(0)
    expect(res.mass).toEqual([])
  })

  it('letterPositionHeatmap normalizes with mismatched priors length', () => {
    const words = ['ab', 'cd']
    // priors length mismatch triggers uniform path
    const heat = letterPositionHeatmap(words, new Float64Array([1]))
    // Each column sums ~1
    for (let pos = 0; pos < heat.length; pos++) {
      const sum = heat.mass[pos]!.reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(0.999)
      expect(sum).toBeLessThan(1.001)
    }
  })

  it('explainGuess sampling path (subset sample) probabilities sum ~1', () => {
    const words = Array.from({ length: 30 }, (_, i) =>
      `w${(i + 1000).toString(36)}`.slice(0, 5).padEnd(5, 'a'),
    )
    const priors = new Float64Array(words.length).fill(1)
    const res = explainGuess(words[0]!, words, priors, { size: 5 })
    const total = res.splits.reduce((a, b) => a + b.prob, 0)
    expect(total).toBeGreaterThan(0.9) // sampling introduces small variance
    expect(total).toBeLessThan(1.1)
  })
})
