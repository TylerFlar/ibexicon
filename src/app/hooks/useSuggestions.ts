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
    } catch {
      // eslint-disable-next-line no-console -- debug aid for unexpected scoring failures
      console.error('Suggestion scoring failed')
      return []
    }
  }, [candidateSet, priors, attemptsLeft, attemptsMax, topK, tau, seed, enabled])
}
