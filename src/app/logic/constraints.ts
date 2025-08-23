import { CandidateSet } from '@/solver/filter'
import { encodeTrits } from '@/solver/pattern'
import type { GuessEntry, Trit } from '@/app/state/session'

/** Build a CandidateSet from an initial word list and prior guess history. */
export function buildCandidates(words: string[], history: GuessEntry[]): CandidateSet {
  const cs = new CandidateSet(words)
  for (const { guess, trits } of history) {
    if (guess.length !== trits.length) continue // ignore malformed rows defensively
    cs.applyFeedback(guess, encodeTrits(trits as number[]))
  }
  return cs
}

/**
 * Return true if applying the (nextGuess,nextTrits) feedback would eliminate all candidates.
 * Useful to warn user that a pattern combination is inconsistent with remaining possibility space.
 */
export function wouldEliminateAll(
  words: string[],
  history: GuessEntry[],
  nextGuess: string,
  nextTrits: Trit[],
): boolean {
  if (nextGuess.length !== nextTrits.length) return false // inconsistent input can't be evaluated meaningfully
  const cs = buildCandidates(words, history)
  cs.applyFeedback(nextGuess, encodeTrits(nextTrits as number[]))
  return cs.getAliveWords().length === 0
}
