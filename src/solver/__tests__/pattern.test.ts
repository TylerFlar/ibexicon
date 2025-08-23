import { describe, it, expect } from 'vitest'
import { encodeTrits, decodePattern, isNumericPattern, MAX_NUMERIC_TRITS, patternEquals } from '../pattern'
 

// Simple deterministic PRNG for reproducibility
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomTritArray(len: number, rnd: () => number): number[] {
  const arr = new Array<number>(len)
  for (let i = 0; i < len; i++) arr[i] = (rnd() * 3) | 0
  return arr
}

describe('pattern encode/decode round-trip', () => {
  it('round-trips for lengths 1..35 with representative samples', () => {
    for (let L = 1; L <= 35; L++) {
      const rnd = mulberry32(0xabc000 + L)
      const samples: number[][] = []
      samples.push(new Array<number>(L).fill(0)) // all gray
      samples.push(new Array<number>(L).fill(2)) // all green
      // 5 random samples
      for (let k = 0; k < 5; k++) samples.push(randomTritArray(L, rnd))

      for (const trits of samples) {
        const encoded = encodeTrits(trits)
        const decoded = decodePattern(encoded, L)
        expect(decoded).toEqual(trits)
        if (L <= MAX_NUMERIC_TRITS) {
          expect(typeof encoded).toBe('number')
          expect(isNumericPattern(L)).toBe(true)
        } else {
          expect(typeof encoded).toBe('string')
          expect(isNumericPattern(L)).toBe(false)
        }
      }
    }
  })
})

describe('patternEquals', () => {
  it('compares numeric patterns', () => {
    const a = encodeTrits([0, 1, 2])
    const b = encodeTrits([0, 1, 2])
    const c = encodeTrits([2, 1, 0])
    expect(patternEquals(a, b)).toBe(true)
    expect(patternEquals(a, c)).toBe(false)
  })
  it('compares string patterns (length > MAX_NUMERIC_TRITS)', () => {
    const L = MAX_NUMERIC_TRITS + 2 // 35
    const arr1 = new Array<number>(L).fill(0).map((_, i) => i % 3)
    const arr2 = [...arr1]
    arr2[L - 1]! = (arr2[L - 1]! + 1) % 3 // mutate last
    const p1 = encodeTrits(arr1)
    const p1b = encodeTrits(arr1)
    const p2 = encodeTrits(arr2)
    expect(typeof p1).toBe('string')
    expect(patternEquals(p1, p1b)).toBe(true)
    expect(patternEquals(p1, p2)).toBe(false)
  })
})
