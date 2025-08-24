import { describe, it, expect } from 'vitest'
import { suggestNextWithProvider, suggestNext } from '../scoring'

// Build a toy set where one word dominates prior mass to encourage pruning.
function buildSet(n: number): { words: string[]; priors: Record<string, number> } {
  const words = ['alpha']
  for (let i = 1; i < n; i++) words.push('w' + i.toString().padStart(4, '0'))
  const priors: Record<string, number> = {}
  priors['alpha'] = 0.9
  const rem = 0.1 / (n - 1)
  for (let i = 1; i < n; i++) priors[words[i]!] = rem
  return { words, priors }
}

describe('early-cut invariants', () => {
  it('top-1 suggestion stable with and without earlyCut and some guesses abort', async () => {
    const { words, priors } = buildSet(80)
    const base = suggestNext(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        chunkSize: 5,
      },
    )
    const aborted: string[] = []
    const guessesVisited: Record<string, number> = {}
    const withCut = await suggestNextWithProvider(
      { words, priors },
      {
        attemptsLeft: 6,
        attemptsMax: 6,
        topK: 1,
        chunkSize: 5,
        earlyCut: true,
        epsilon: 1e-6,
        onGuessDone: ({ guess, abortedEarly, secretsVisited }) => {
          guessesVisited[guess] = secretsVisited
          if (abortedEarly) aborted.push(guess)
        },
      },
    )
    expect(withCut[0]!.guess).toBe(base[0]!.guess)
    // Ensure at least one guess aborted early (heuristic expectation)
    expect(aborted.length).toBeGreaterThan(0)
    // Aborted guesses should have processed fewer than total words
    const total = words.length
    expect(aborted.some((g) => guessesVisited[g]! < total)).toBe(true)
  })
})
