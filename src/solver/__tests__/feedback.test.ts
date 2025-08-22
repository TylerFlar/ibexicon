import { describe, it, expect } from 'vitest'
import { feedbackTrits, feedbackPattern } from '../feedback'
import { decodePattern } from '../pattern'

function toPatternArray(p: ReturnType<typeof feedbackPattern>, length: number) {
  return decodePattern(p, length)
}

describe('feedback basic cases', () => {
  it('all greens when guess == secret', () => {
    const g = 'crane'
    const pat = feedbackTrits(g, g)
    expect(pat).toEqual(new Array(g.length).fill(2))
  })

  it('all grays when no overlap', () => {
    const guess = 'aaaaa'
    const secret = 'bcdfg'
    const pat = feedbackTrits(guess, secret)
    expect(pat).toEqual(new Array(guess.length).fill(0))
  })
})

describe('duplicate handling cases', () => {
  it('secret cigar, guess civic', () => {
    // secret: c i g a r
    // guess:  c i v i c
    // expect: g g ? y ?
    const guess = 'civic'
    const secret = 'cigar'
    const trits = feedbackTrits(guess, secret) // compute
    // Derive expected manually:
    // pos0 c = c green (2)
    // pos1 i = i green (2)
    // pos2 v not in secret -> 0
    // pos3 i: only one i in secret and already used by green -> 0 (gray)
    // pos4 c: second c not in secret (only one c) -> 0
    expect(trits).toEqual([2, 2, 0, 0, 0])
  })

  it('secret allee, guess eagle', () => {
    // secret: a l l e e
    // guess:  e a g l e
    // Manual evaluation with algorithm:
    // Greens first: only pos4 e matches (e) -> green at index 4 (2)
    // Remaining secret letter counts after greens: a:1,l:2,e:1
    // Now yellows:
    // pos0 e -> counts.e=1 -> yellow (1) counts.e->0
    // pos1 a -> counts.a=1 -> yellow (1) counts.a->0
    // pos2 g -> absent -> gray (0)
    // pos3 l -> counts.l=2 -> yellow (1) counts.l->1
    // pos4 already green
    // Final trits: [1,1,0,1,2]
    const guess = 'eagle'
    const secret = 'allee'
    const trits = feedbackTrits(guess, secret)
    expect(trits).toEqual([1, 1, 0, 1, 2])
  })

  it('secret abbey, guess cabal', () => {
    // secret: a b b e y
    // guess:  c a b a l
    // Greens first: only pos2 b (guess b vs secret b) -> green at 2
    // Counts after greens: a:1, b:1 (one used), e:1, y:1
    // Yellows:
    // pos0 c -> gray
    // pos1 a -> yellow (consume a)
    // pos3 a -> no remaining a -> gray
    // pos4 l -> gray
    // Final: [0,1,2,0,0]
    const guess = 'cabal'
    const secret = 'abbey'
    const trits = feedbackTrits(guess, secret)
    expect(trits).toEqual([0, 1, 2, 0, 0])
  })
})

describe('consistency oracle small set', () => {
  // Tiny toy set; ensure feedbackPattern + decode = feedbackTrits
  const words = ['aaaa', 'aaab', 'aaba', 'abaa', 'baaa']
  it('pattern decode matches direct trits for all pairs', () => {
    for (const g of words) {
      for (const s of words) {
        const direct = feedbackTrits(g, s)
        const pat = feedbackPattern(g, s)
        const decoded = toPatternArray(pat, g.length)
        expect(decoded).toEqual(direct)
      }
    }
  })
})
