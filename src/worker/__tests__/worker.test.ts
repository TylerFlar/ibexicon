import { describe, it, expect } from 'vitest'
import { SolverWorkerClient } from '@/worker/client'

// Helper: generate random 5-letter lowercase words
function genWords(n: number): string[] {
  const words: string[] = []
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  for (let i = 0; i < n; i++) {
    let w = ''
    for (let j = 0; j < 5; j++) w += letters.charAt((i * 7 + j * 11 + j + i) % 26) // deterministic-ish
    words.push(w)
  }
  return words
}

function uniformPriors(words: string[]): Record<string, number> {
  const w = 1 / words.length
  return Object.fromEntries(words.map((x) => [x, w]))
}

describe('Solver worker integration', () => {
  it('happy path scoring returns topK suggestions', async () => {
    const client = new SolverWorkerClient()
    await client.warmup()
    const words = genWords(200)
    const priors = uniformPriors(words)
    const res = await client.score({
      words,
      priors,
      attemptsLeft: 6,
      attemptsMax: 6,
      topK: 2,
      sampleCutoff: 1_000_000, // force exact path
    })
    expect(res.canceled).toBeFalsy()
    expect(res.suggestions.length).toBe(2)
    for (const s of res.suggestions) {
      expect(typeof s.guess).toBe('string')
      expect(Number.isFinite(s.eig)).toBe(true)
      expect(Number.isFinite(s.solveProb)).toBe(true)
      expect(Number.isFinite(s.alpha)).toBe(true)
      expect(Number.isFinite(s.expectedRemaining)).toBe(true)
    }
    client.dispose()
  }, 10_000)

  it('cancellation yields canceled=true', async () => {
    const client = new SolverWorkerClient()
    await client.warmup()
    // Large secret set to ensure multiple chunks (default chunkSize 8000)
    const words = genWords(20000) // > 8000 so at least 3 chunks per guess
    const priors = uniformPriors(words)
    const scorePromise = client.score({
      words,
      priors,
      attemptsLeft: 6,
      attemptsMax: 6,
      topK: 2,
      sampleCutoff: 1_000_000, // exact path
      prefilterLimit: 50, // keep candidate guesses small but still produce chunked secret iteration
    })
    // Cancel immediately
    client.cancel()
    const res = await scorePromise
    expect(res.canceled).toBeTruthy()
    expect(res.suggestions.length).toBe(0)
    client.dispose()
  }, 10_000)
})
