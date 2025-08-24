import { describe, it, expect } from 'vitest'
import { Bitset } from '@/solver/bitset'

describe('Bitset edge cases', () => {
  it('fillAll then count equals size; clearAll resets', () => {
    const bs = new Bitset(10)
    bs.fillAll()
    expect(bs.count()).toBe(10)
    bs.clearAll()
    expect(bs.count()).toBe(0)
  })

  it('set/clear/get individual bits and indices iteration', () => {
    const bs = new Bitset(40) // spans multiple words & partial last word masking
    bs.fillAll()
    // Clear a few bits
    bs.clear(0)
    bs.clear(39)
    expect(bs.get(1)).toBe(true)
    expect(bs.get(0)).toBe(false)
    const idxs = [...bs.indices()]
    expect(idxs.includes(0)).toBe(false)
    expect(idxs.includes(1)).toBe(true)
    expect(idxs.includes(39)).toBe(false)
  })

  it('and with size mismatch throws', () => {
    const a = new Bitset(5)
    const b = new Bitset(6)
    expect(() => a.and(b as any)).toThrow()
  })

  it('out of range access throws RangeError', () => {
    const a = new Bitset(3)
    expect(() => a.get(3)).toThrow(RangeError)
    expect(() => a.set(3)).toThrow(RangeError)
    expect(() => a.clear(3)).toThrow(RangeError)
  })

  it('clone produces independent copy', () => {
    const a = new Bitset(5)
    a.fillAll()
    const b = a.clone()
    a.clear(1)
    expect(b.get(1)).toBe(true)
  })
})
