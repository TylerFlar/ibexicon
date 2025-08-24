import { describe, it, expect } from 'vitest'
import { suggestNextWithProvider } from '../scoring'

// Build a synthetic vocabulary of size ~5100 to cross the default sampleCutoff (5000)
function buildVocab(N: number, L: number): { words: string[]; priors: Record<string, number> } {
  // Generate unique words by encoding i in base-26 (little-endian) then cycling a salt.
  const words: string[] = []
  const priors: Record<string, number> = {}
  for (let i = 0; i < N; i++) {
    let n = i
    let w = ''
    for (let pos = 0; pos < L; pos++) {
      const c = n % 26
      w += String.fromCharCode(97 + ((c + pos * 7) % 26))
      n = Math.floor(n / 26)
    }
    // If still too short, pad (shouldn't happen given loop)
    if (w.length < L) w = w.padEnd(L, 'a')
    words.push(w)
    priors[w] = 1
  }
  return { words, priors }
}

describe('scoring path coverage', () => {
  it('sampling path triggers when N > sampleCutoff and reduces secrets visited', async () => {
    const { words, priors } = buildVocab(5100, 5)
    // Force provider path with earlyCut disabled to focus on sampling difference.
    let withSamplingSecrets = 0
    let exactSecrets = 0
    await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        sampleCutoff: 5000, // ensure sampling
        sampleSize: 800, // keep test fast
        chunkSize: 400, // more progress ticks
        earlyCut: false,
        onGuessDone: ({ secretsVisited }) => {
          withSamplingSecrets += secretsVisited
        },
      },
    )
    await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        sampleCutoff: 10000, // force exact (N <= cutoff false -> exact)
        chunkSize: 400,
        earlyCut: false,
        onGuessDone: ({ secretsVisited }) => {
          exactSecrets += secretsVisited
        },
      },
    )
    expect(withSamplingSecrets).toBeGreaterThan(0)
    expect(exactSecrets).toBeGreaterThan(0)
    // Should visit far fewer secrets under sampling than exact (heuristic factor)
    expect(withSamplingSecrets).toBeLessThan(exactSecrets * 0.5)
  }, 8000)

  it('prefilter reduces candidate guesses processed', async () => {
    const { words, priors } = buildVocab(3000, 5)
    // prefilterLimit set low so candidateIdxs trimmed
    const visitedLow: Record<string, number> = {}
    const visitedHigh: Record<string, number> = {}
    await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        prefilterLimit: 100, // aggressively small
        chunkSize: 1000,
        earlyCut: false,
        onGuessDone: ({ guess, secretsVisited }) => {
          visitedLow[guess] = secretsVisited
        },
      },
    )
    await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        prefilterLimit: 10000, // effectively no prefilter
        chunkSize: 1000,
        earlyCut: false,
        onGuessDone: ({ guess, secretsVisited }) => {
          visitedHigh[guess] = secretsVisited
        },
      },
    )
    const lowCount = Object.keys(visitedLow).length
    const highCount = Object.keys(visitedHigh).length
    expect(lowCount).toBeGreaterThan(0)
    expect(highCount).toBeGreaterThan(0)
    expect(lowCount).toBeLessThan(highCount)
  }, 8000)

  it('earlyCut on/off does not change top-1 beyond epsilon tolerance', async () => {
    const { words, priors } = buildVocab(400, 5)
    const base = await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        chunkSize: 50,
        earlyCut: false,
        epsilon: 1e-6,
      },
    )
    const withCut = await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        chunkSize: 50,
        earlyCut: true,
        epsilon: 1e-6,
      },
    )
    expect(withCut[0]!.guess).toBe(base[0]!.guess)
  }, 4000)
})
