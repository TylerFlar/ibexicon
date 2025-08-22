import { useMemo } from 'react'
import { CandidateSet, suggestFromCandidates } from '@/solver'

interface UseSuggestionsParams {
  candidateSet: CandidateSet | null
  priors: Record<string, number>
  attemptsLeft: number
  attemptsMax: number
  topK?: number
  tau?: number | null
  seed?: number
  enabled?: boolean // allow disabling for performance while typing
}

export function useSuggestions(params: UseSuggestionsParams) {
  const {
    candidateSet,
    priors,
    attemptsLeft,
    attemptsMax,
    topK,
    tau,
    seed,
    enabled = true,
  } = params

  return useMemo(() => {
    if (!enabled || !candidateSet) return []
    if (candidateSet.aliveCount() === 0) return []
    try {
      return suggestFromCandidates({
        candidates: candidateSet,
        priors,
        attemptsLeft,
        attemptsMax,
        topK,
        tau: tau ?? null,
        seed,
      })
    } catch (e) {
      // Fail-safe: never crash UI; return empty list if scoring throws
      console.warn('Suggestion scoring failed', e)
      return []
    }
  }, [candidateSet, priors, attemptsLeft, attemptsMax, topK, tau, seed, enabled])
}
