import { CandidateSet } from '@/solver/filter'
import { suggestNext, type Suggestion } from '@/solver/scoring'

export interface SuggestInput {
  candidates: CandidateSet
  priors: Record<string, number>
  attemptsLeft: number
  attemptsMax: number
  topK?: number
  tau?: number | null
  seed?: number
}

export function suggestFromCandidates(input: SuggestInput): Suggestion[] {
  const words = input.candidates.getAliveWords()
  return suggestNext(
    { words, priors: input.priors },
    {
      attemptsLeft: input.attemptsLeft,
      attemptsMax: input.attemptsMax,
      topK: input.topK ?? 3,
      tau: input.tau ?? null,
      seed: input.seed,
    },
  )
}
