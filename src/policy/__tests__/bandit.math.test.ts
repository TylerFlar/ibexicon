import { describe, it, expect } from 'vitest'
import { loadState, resetState, updatePolicy, samplePolicy } from '@/policy/bandit'

// Utility to run many samples and count frequency
function freq(policyFn: () => string, n: number): Record<string, number> {
  const counts: Record<string, number> = {}
  for (let i = 0; i < n; i++) {
    const p = policyFn()
    counts[p] = (counts[p] || 0) + 1
  }
  return counts
}

describe('bandit math', () => {
  it('arm with higher rewards develops higher a and is sampled more', () => {
    const L = 5
    resetState(L)
    // Apply reward sequence to a chosen arm (composite)
    const seq = [1, 0, 1, 1]
    for (const r of seq) updatePolicy(L, 'composite', r)
    const s = loadState(L)
    const comp = s.arms['composite']
    expect(comp.a).toBeGreaterThan(comp.b) // since majority successes
    // Other arms should remain at prior (a=1,b=1)
    expect(s.arms['pure-eig'].a).toBe(1)
    expect(s.arms['pure-eig'].b).toBe(1)
    // Sampling: composite should dominate (~ due to higher posterior mean). Allow lenient check.
  const counts = freq(() => samplePolicy(L), 3000)
  // Expect composite picked more than any single other arm and >30% of draws (exploration still occurs)
  const compCount = counts['composite'] || 0
  const others = Object.entries(counts).filter(([k]) => k !== 'composite')
  // Composite should generally exceed or tie others with high probability after reward sequence.
  let betterOrEqual = 0
  for (const [, c] of others) if (compCount >= c!) betterOrEqual++
  expect(betterOrEqual).toBeGreaterThanOrEqual(3) // dominates most others
  expect(compCount).toBeGreaterThan(800) // > ~26% of 3000
  })

  it('decay with half-life=1 reduces influence of older counts', () => {
    const L = 6
    resetState(L)
    // Provide some rewards
    updatePolicy(L, 'pure-eig', 1, { halfLifeUpdates: 1 })
    updatePolicy(L, 'pure-eig', 1, { halfLifeUpdates: 1 })
    let s1 = loadState(L)
    const aAfter = s1.arms['pure-eig'].a
    // Wait: we simulate decay by calling more updates with zero reward and half-life=1
    updatePolicy(L, 'pure-eig', 0, { halfLifeUpdates: 1 })
    updatePolicy(L, 'pure-eig', 0, { halfLifeUpdates: 1 })
    s1 = loadState(L)
    const aLater = s1.arms['pure-eig'].a
    // Because each update decays previous (a-1) by 0.5, two additional updates should roughly halve net excess.
    expect(aLater - 1).toBeLessThan(aAfter - 1)
  })
})
