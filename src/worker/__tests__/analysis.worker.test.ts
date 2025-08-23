import { describe, it, expect } from 'vitest'
import { SolverWorkerClient } from '@/worker/client'

const words = ['alpha', 'algae', 'altar', 'other', 'otter']
const priors: Record<string, number> = {
  alpha: 5,
  algae: 3,
  altar: 2,
  other: 1,
  otter: 1,
}

function renorm(words: string[]): Record<string, number> {
  let sum = 0
  for (const w of words) sum += priors[w] || 0
  const out: Record<string, number> = {}
  for (const w of words) out[w] = sum > 0 ? (priors[w] || 0) / sum : 1 / words.length
  return out
}

describe('analysis worker integration', () => {
  it('heatmap + guess explanation basic shape', async () => {
    const client = new SolverWorkerClient()
    await client.warmup()
    // Allow a microtask tick for worker module settle (some environments)
    await new Promise((r) => setTimeout(r, 5))
    const ren = renorm(words)
    const heat = await client.analyzeHeatmap(words, ren)
    expect(heat.length).toBe(words[0]!.length)
    expect(heat.mass.length).toBeGreaterThan(0)
    for (let i = 0; i < heat.length; i++) {
      const sum = heat.mass[i]!.reduce((a, b) => a + b, 0)
      expect(sum).toBeGreaterThan(0.999)
      expect(sum).toBeLessThan(1.001)
    }
    const gx = 'alpha'
    const exp = await client.analyzeGuess({ guess: gx, words, priors: ren })
    expect(exp.guess).toBe(gx)
    expect(exp.posMatchMass.length).toBe(gx.length)
    expect(exp.expectedGreens).toBeGreaterThanOrEqual(0)
    const splitProbTotal = exp.splits.reduce((a, b) => a + b.prob, 0)
    expect(splitProbTotal).toBeGreaterThan(0.999)
    expect(splitProbTotal).toBeLessThan(1.001)
    client.dispose()
  }, 10000)
})
