import { suggestNext } from '@/solver/scoring'

export type PolicyId = 'composite' | 'pure-eig' | 'in-set-only' | 'unique-letters'

export interface PolicyInput {
  words: string[]
  priors: Record<string, number> // unnormalized; function will renorm on S if needed
  attemptsLeft: number
  attemptsMax: number
  topK: number
  tau: number | null
  seed?: number
}

export interface PolicySuggestion {
  guess: string
  score: number // comparable within-policy only; we’ll still show eig/solve when available
  eig?: number
  solveProb?: number
  expectedRemaining?: number
  alpha?: number
}

function renormOnS(words: string[], priors: Record<string, number>): Float64Array {
  const p = new Float64Array(words.length)
  let sum = 0
  for (let i = 0; i < words.length; i++) {
    const m = priors[words[i]!] ?? 0
    p[i]! = m > 0 ? m : 0
    sum += p[i]!
  }
  if (sum <= 0) {
    const u = 1 / Math.max(1, words.length)
    for (let i = 0; i < p.length; i++) p[i]! = u
  } else {
    const inv = 1 / sum
    for (let i = 0; i < p.length; i++) p[i]! *= inv
  }
  return p
}

function uniqueLetterScore(w: string): number {
  const set = new Set<number>()
  for (let i = 0; i < w.length; i++) {
    const c = w.charCodeAt(i) - 97
    if (c >= 0 && c < 26) set.add(c)
  }
  // favor variety; tiny tie-break by lexicographic order is added later by sort stability
  return set.size
}

export async function suggestByPolicy(
  id: PolicyId,
  input: PolicyInput,
): Promise<PolicySuggestion[]> {
  const { words, priors, attemptsLeft, attemptsMax, topK, tau, seed } = input
  if (!words.length) return []
  switch (id) {
    case 'composite': {
      const res = suggestNext({ words, priors }, { attemptsLeft, attemptsMax, topK, tau, seed })
      return res.map((r) => ({
        guess: r.guess,
        score: r.eig * (r.alpha ?? 0.5) + (r.solveProb ?? 0) * (1 - (r.alpha ?? 0.5)),
        eig: r.eig,
        solveProb: r.solveProb,
        expectedRemaining: r.expectedRemaining,
        alpha: r.alpha,
      }))
    }
    case 'pure-eig': {
      const res = suggestNext(
        { words, priors },
        { attemptsLeft, attemptsMax, topK, tau, seed, alphaOverride: 1 },
      )
      return res.map((r) => ({
        guess: r.guess,
        score: r.eig,
        eig: r.eig,
        solveProb: r.solveProb,
        expectedRemaining: r.expectedRemaining,
        alpha: 1,
      }))
    }
    case 'in-set-only': {
      // pure solve probability
      const p = renormOnS(words, priors)
      const idxs = [...words.keys()]
      idxs.sort((a, b) => {
        const diff = p[b]! - p[a]!
        if (diff !== 0) return diff
        return words[a]! < words[b]! ? -1 : 1
      })
      return idxs
        .slice(0, topK)
        .map((i) => ({ guess: words[i]!, score: p[i]!, solveProb: p[i]!, alpha: 0 }))
    }
    case 'unique-letters': {
      const p = renormOnS(words, priors)
      const idxs = [...words.keys()]
      idxs.sort((a, b) => {
        const ub = uniqueLetterScore(words[b]!)
        const ua = uniqueLetterScore(words[a]!)
        if (ub !== ua) return ub - ua
        // tie-break by prior, then lexicographic
        const pb = p[b]!
        const pa = p[a]!
        if (pb !== pa) return pb - pa
        return words[a]! < words[b]! ? -1 : 1
      })
      return idxs
        .slice(0, topK)
        .map((i) => ({ guess: words[i]!, score: uniqueLetterScore(words[i]!) }))
    }
  }
}
