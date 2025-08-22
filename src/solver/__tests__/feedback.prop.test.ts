import { describe, it } from 'vitest'
import fc from 'fast-check'
import { feedbackTrits, feedbackPattern } from '../feedback'
import { filterCandidatesArray } from '../filter'

// Helper to count letters (a-z) in a string
function letterCounts(s: string): number[] {
  const counts = new Array<number>(26).fill(0)
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 97
    if (c >= 0 && c < 26) counts[c]!++
  }
  return counts
}

// Generate lowercase strings of fixed length L
const letters = [...'abcdefghijklmnopqrstuvwxyz']

// Build a fixed-length lowercase string arbitrary for a given L using array of chars
const fixedLowerString = (L: number) =>
  fc.array(fc.constantFrom(...letters), { minLength: L, maxLength: L }).map((a) => a.join(''))

// Arbitrary producing triples (guess, secret, distractors[]) with consistent length 1..20
const feedbackCaseArb = fc.integer({ min: 1, max: 20 }).chain((L) =>
  fc
    .tuple(
      fixedLowerString(L), // guess
      fixedLowerString(L), // secret
      fc.array(fixedLowerString(L), { minLength: 0, maxLength: 5 }), // distractors
    )
    .map(([g, s, distractors]) => ({ g, s, distractors, L })),
)

describe('feedback property tests', () => {
  it('does not over-assign yellows+greens per letter and preserves secret under filtering', () => {
    fc.assert(
      fc.property(
        feedbackCaseArb,
        ({ g, s, distractors, L }: { g: string; s: string; distractors: string[]; L: number }) => {
          const trits = feedbackTrits(g, s)
          // Invariant 1: per-letter usage constraint
          const secretCounts = letterCounts(s)
          const used = new Array<number>(26).fill(0)
          for (let i = 0; i < L; i++) {
            const t = trits[i]! // 0/1/2
            if (t === 0) continue
            const c = g.charCodeAt(i) - 97
            if (c >= 0 && c < 26) used[c]!++
          }
          for (let c = 0; c < 26; c++) {
            if (used[c]! > secretCounts[c]!) {
              return false // violation
            }
          }

          // Invariant 2: filtering with the produced pattern keeps the secret
          const pat = feedbackPattern(g, s)
          // Build candidate pool: ensure secret present and unique
          const poolSet = new Set<string>([s, ...distractors])
          // Ensure distractors have same length—fast-check generation already ensures; still filter defensively
          const pool = Array.from(poolSet).filter((w) => w.length === L)
          const filtered = filterCandidatesArray(pool, g, pat)
          if (!filtered.includes(s)) {
            return false
          }
          return true
        },
      ),
      { numRuns: 200 },
    )
  })
})
