import { describe, it, expect } from 'vitest'
import { applyTemperature } from '@/solver/scoring'

function clone(a: Float64Array) {
  return new Float64Array(a)
}

describe('temperature shaping', () => {
  it('tau < 1 sharpens distribution; tau > 1 flattens', () => {
    const base = new Float64Array([0.8, 0.2])
    const sharp = clone(base)
    applyTemperature(sharp, 0.9)
    const flat = clone(base)
    applyTemperature(flat, 1.1)
    // Sharp: first prob increases, second decreases
  expect(sharp[0]!).toBeGreaterThan(base[0]!)
  expect(sharp[1]!).toBeLessThan(base[1]!)
    // Flat: first prob decreases, second increases
  expect(flat[0]!).toBeLessThan(base[0]!)
  expect(flat[1]!).toBeGreaterThan(base[1]!)
    // Normalization maintained
  const sumSharp = sharp[0]! + sharp[1]!
  const sumFlat = flat[0]! + flat[1]!
    expect(Math.abs(sumSharp - 1)).toBeLessThan(1e-12)
    expect(Math.abs(sumFlat - 1)).toBeLessThan(1e-12)
  })
})
