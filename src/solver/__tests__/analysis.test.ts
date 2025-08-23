import { describe, it, expect } from 'vitest'
import { letterPositionHeatmap, explainGuess } from '@/solver/analysis'

// Tiny 3-letter toy set with uneven priors to test normalization & explain metrics
// Words chosen so letters distributions differ per position
const words = ['cat', 'car', 'cot', 'dog', 'dig']
// Assign priors (unnormalized) intentionally varied
// cat highest, then car, others small
const rawPriors = new Float64Array(words.length)
const priormap: Record<string, number> = { cat: 5, car: 3, cot: 2, dog: 1, dig: 1 }
for (let i = 0; i < words.length; i++) rawPriors[i] = priormap[words[i]!] || 0

function renormSubset(list: string[]): Float64Array {
  let sum = 0
  for (const w of list) sum += priormap[w] || 0
  const out = new Float64Array(list.length)
  for (let i = 0; i < list.length; i++) {
    out[i] = sum > 0 ? (priormap[list[i]!] || 0) / sum : 1 / list.length
  }
  return out
}

describe('letterPositionHeatmap', () => {
  it('columns sum to ~1', () => {
    const heat = letterPositionHeatmap(words, rawPriors)
    expect(heat.length).toBe(3)
    for (let pos = 0; pos < heat.length; pos++) {
      const colSum = heat.mass[pos]!.reduce((a, b) => a + b, 0)
      expect(colSum).toBeGreaterThan(0.999)
      expect(colSum).toBeLessThan(1.001)
    }
  })
})

describe('explainGuess basics', () => {
  const norm = renormSubset(words)
  it('MAP word identical guess yields higher expectedGreens vs disjoint guess', () => {
    const mapGuess = 'cat'
    const disjoint = 'zzz' // all letters absent
    const egMap = explainGuess(mapGuess, words, norm).expectedGreens
    const egDisjoint = explainGuess(disjoint, words, norm).expectedGreens
    expect(egMap).toBeGreaterThan(egDisjoint)
    expect(egDisjoint).toBe(0) // no overlap => 0 greens expected
  })

  it('coverageMass within [0,1]', () => {
    const g = 'car'
    const res = explainGuess(g, words, norm)
    expect(res.coverageMass).toBeGreaterThanOrEqual(0)
    expect(res.coverageMass).toBeLessThanOrEqual(1)
  })

  it('coverageMass increases for common letters', () => {
    const commonGuess = 'car' // letters appear in higher-prior words
    const rareGuess = 'zzz'
    const normRes = explainGuess(commonGuess, words, norm)
    const rareRes = explainGuess(rareGuess, words, norm)
    expect(normRes.coverageMass).toBeGreaterThan(rareRes.coverageMass)
  })

  it('splits probabilities sum to ~1 (sampling off)', () => {
    const res = explainGuess('car', words, norm)
    const total = res.splits.reduce((a, b) => a + b.prob, 0)
    expect(total).toBeGreaterThan(0.999)
    expect(total).toBeLessThan(1.001)
  })
})
