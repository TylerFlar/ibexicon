import { describe, it, expect } from 'vitest'
import { decodePattern, encodeTrits, MAX_NUMERIC_TRITS } from '@/solver/pattern'

describe('pattern decode long-length fallbacks', () => {
  const L = MAX_NUMERIC_TRITS + 1
  const trits = Array.from({ length: L }, (_, i) => (i % 3) as 0 | 1 | 2)

  it('decode string fallback produced by encodeTrits', () => {
    const enc = encodeTrits(trits)
    expect(typeof enc).toBe('string')
    const dec = decodePattern(enc, L)
    expect(dec.slice(0, 5)).toEqual(trits.slice(0, 5))
    expect(dec.length).toBe(L)
  })

  it('decode numeric provided for long length (robustness path)', () => {
    const dec = decodePattern(5, L) // numeric input with long length triggers numeric->trits rebuild path
    expect(dec.length).toBe(L)
    // The first trit equals 5 % 3 = 2
    expect(dec[0]).toBe(2)
  })
})
