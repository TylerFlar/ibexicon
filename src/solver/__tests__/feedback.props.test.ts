import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { feedbackPattern } from '@/solver/feedback'
import { encodeTrits, isNumericPattern, decodePattern } from '@/solver/pattern'
import { CandidateSet } from '@/solver/filter'

// Helpers
const alpha = 'abcdefghijklmnopqrstuvwxyz'

function genWord(len: number) {
  // Efficient fixed-length lowercase generator (no filtering / rejection)
  return fc
    .array(fc.constantFrom(...alpha.split('')), { minLength: len, maxLength: len })
    .map((a) => a.join(''))
}

// Detect coverage mode (heuristic): vitest sets V8 coverage via process.env.V8_COVERAGE or presence of globalThis.__coverage__
const UNDER_COVERAGE = !!(globalThis as any).__coverage__ || !!process.env.V8_COVERAGE
// Allow overriding via FAST_CHECK_RUNS env; fall back to fewer runs under coverage
const DEFAULT_RUNS = UNDER_COVERAGE ? 120 : 500
const RUNS = process.env.FAST_CHECK_RUNS ? Number(process.env.FAST_CHECK_RUNS) : DEFAULT_RUNS

for (const L of [3, 4, 5, 6, 7, 8, 9, 10, 12]) {
  describe(`feedback invariants L=${L}`, () => {
    it('greens equal position matches; numeric code in range; secret survives filter', () => {
      fc.assert(
        fc.property(genWord(L), genWord(L), (g: string, s: string) => {
          const pat = feedbackPattern(g, s)
          const trits = decodePattern(pat, L)
          const code = isNumericPattern(L) ? (pat as number) : encodeTrits(trits)
          // 1) greens = exact matches
          const greens = trits.filter((t) => t === 2).length
          let posMatches = 0
          for (let i = 0; i < L; i++) if (g[i] === s[i]) posMatches++
          expect(greens).toBe(posMatches)
          // 2) code bounds
          const maxCode = Math.pow(3, L) - 1
          expect(code).toBeGreaterThanOrEqual(0)
          expect(code).toBeLessThanOrEqual(maxCode)
          // 3) no over-assign yellows: counts per letter respected
          const need: Record<string, number> = {}
          for (const ch of s) need[ch] = (need[ch] || 0) + 1
          for (let i = 0; i < L; i++)
            if (g[i] === s[i]) {
              const ch = g[i]!
              need[ch]!--
            }
          for (let i = 0; i < L; i++) {
            if (trits[i] === 1) {
              const ch = g[i]!
              expect(need[ch]! > 0).toBe(true)
              need[ch]!--
            }
          }
          // 4) filtering with (g,pat) keeps secret alive
          const words: string[] = [s, g]
          const cs = new CandidateSet(words)
          cs.applyFeedback(g, code)
          expect(cs.getAliveWords().includes(s)).toBe(true)
        }),
        { numRuns: RUNS },
      )
    })
  })
}
