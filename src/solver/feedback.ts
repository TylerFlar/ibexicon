import { encodeTrits, type PatternValue } from './pattern'

// Trit meanings: 0=gray,1=yellow,2=green

export function feedbackTrits(guess: string, secret: string): number[] {
  if (guess.length !== secret.length) {
    throw new Error('Guess and secret must have same length')
  }
  const L = guess.length
  const result = new Array<number>(L)

  // Letter counts for secret (assuming lowercase a-z). If broader charset needed, adjust.
  const counts = new Array<number>(26).fill(0)
  for (let i = 0; i < L; i++) {
    const ch = secret[i]! // i<L
    const c = ch.charCodeAt(0) - 97
    if (c >= 0 && c < 26) counts[c]!++
  }

  // First pass: greens
  for (let i = 0; i < L; i++) {
    const g = guess[i]!
    if (g === secret[i]) {
      result[i] = 2 // green
      const c = g.charCodeAt(0) - 97
      if (c >= 0 && c < 26) counts[c]!-- // counts index exists
    } else {
      result[i] = 0 // provisional gray
    }
  }

  // Second pass: yellows (non-green positions)
  for (let i = 0; i < L; i++) {
    if (result[i] !== 0) continue // already green
    const g = guess[i]!
    const c = g.charCodeAt(0) - 97
    if (c >= 0 && c < 26 && counts[c]! > 0) {
      result[i] = 1 // yellow
      counts[c]!--
    } else {
      result[i] = 0 // gray remains
    }
  }

  return result
}

export function feedbackPattern(guess: string, secret: string): PatternValue {
  return encodeTrits(feedbackTrits(guess, secret))
}
