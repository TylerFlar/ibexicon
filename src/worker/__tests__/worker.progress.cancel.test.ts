import { describe, it, expect } from 'vitest'
import { SolverWorkerClient } from '@/worker/client'

function genWords(n: number, L = 5): string[] {
  const words: string[] = []
  const alpha = 'abcdefghijklmnopqrstuvwxyz'
  for (let i = 0; i < n; i++) {
    let w = ''
    for (let j = 0; j < L; j++) {
      const idx = (i * 19 + j * 7 + j + i) % 26
      w += alpha[idx]!
    }
    words.push(w)
  }
  return words
}

function uniformPriors(words: string[]): Record<string, number> {
  const w = 1 / words.length
  return Object.fromEntries(words.map((x) => [x, w]))
}

describe('worker progress + cancel', () => {
  it('emits progress ticks and can cancel scoring', async () => {
    const client = new SolverWorkerClient()
    await client.warmup()
    const words = genWords(12000) // larger than one chunk (default 8000) to ensure multiple progress events
    const priors = uniformPriors(words)
    const ticks: number[] = []
    const scorePromise = client.score({
      words,
      priors,
      attemptsLeft: 6,
      attemptsMax: 6,
      topK: 2,
      sampleCutoff: 1_000_000, // exact
      prefilterLimit: 60, // small candidate set -> still many secrets scanned
      chunkSize: 2000, // more frequent ticks
      onProgress: (p) => {
        ticks.push(p)
        if (ticks.length === 3) {
          // cancel after a few ticks
          client.cancel()
        }
      },
      earlyCut: false,
    })
    const res = await scorePromise
    expect(res.canceled).toBeTruthy()
    // ensure monotonic-ish increasing progress values
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]!).toBeGreaterThanOrEqual(ticks[i - 1]!)
    }
    expect(ticks.length).toBeGreaterThanOrEqual(2)
    client.dispose()
  }, 8000)
})
