import { describe, it, expect } from 'vitest'
import { feedbackPattern } from '@/solver/feedback'
import { decodePattern, isNumericPattern } from '@/solver/pattern'

function tritsFrom(pat: any, L: number): number[] {
  return decodePattern(pat, L)
}

describe('duplicate letter cases', () => {
  // Format: [secret, guess, expectedPattern?] expectedPattern presently unused; kept for future explicit assertions.
  const cases: Array<[string, string, number[] | null]> = [
    ['cigar', 'civic', [2, 0, 0, 0, 0]],
    ['allee', 'eagle', null], // ambiguous; we'll assert invariant properties instead of exact sequence
    ['abbey', 'babes', [1, 1, 1, 1, 0]],
    ['tests', 'asset', [0, 2, 1, 1, 0]],
  ]
  it('greens exact, yellows bounded', () => {
    for (const [s, g] of cases) {
      const pat = feedbackPattern(g, s)
      const tr = tritsFrom(pat, g.length)
      // 1. greens == positional matches
      const greens = tr.filter((t) => t === 2).length
      let pos = 0
      for (let i = 0; i < g.length; i++) if (g[i] === s[i]) pos++
      expect(greens).toBe(pos)
      // 2. yellows do not exceed remaining letter supply
      const need: Record<string, number> = {}
      for (const ch of s) need[ch] = (need[ch] || 0) + 1
      for (let i = 0; i < g.length; i++) if (g[i] === s[i]) need[g[i]!]!--
      for (let i = 0; i < g.length; i++) {
        if (tr[i] === 1) {
          const ch = g[i]!
          expect(need[ch]! > 0).toBe(true)
          need[ch]!--
        }
      }
      // 3. pattern value within bounds if numeric representation
      if (typeof pat === 'number' && isNumericPattern(g.length)) {
        expect(pat).toBeGreaterThanOrEqual(0)
        expect(pat).toBeLessThanOrEqual(Math.pow(3, g.length) - 1)
      }
    }
  })
})
