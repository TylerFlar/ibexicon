export type PatternValue = number | string

export const MAX_NUMERIC_TRITS = 33 // because 3^33 < 2^53 (safe integer) and 3^34 > 2^53

/** Return true if a word length should use numeric (base-3 packed) representation */
// Not a React hook; name chosen for semantic clarity. Disable hook lint rule.

export function useNumericPattern(length: number): boolean {
  return length <= MAX_NUMERIC_TRITS
}

/**
 * Encode an array of trits (values 0|1|2) into either a number (little-endian base-3) or a string fallback.
 * Lowest index (position 0) becomes the least-significant trit.
 */
export function encodeTrits(trits: number[]): PatternValue {
  const L = trits.length
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (useNumericPattern(L)) {
    let value = 0
    let mul = 1
    for (let i = 0; i < L; i++) {
      const t = trits[i]! // defined because i < L
      // Assume caller ensures 0/1/2; keep function tight (hot path).
      value += t * mul
      mul *= 3
    }
    return value
  }
  // String fallback: join digits as characters '0','1','2'. Order preserved (index order left->right).
  return trits.join('')
}

/** Decode a pattern value back into its trit array of given length */
export function decodePattern(p: PatternValue, length: number): number[] {
  const out = new Array<number>(length)
  // eslint-disable-next-line react-hooks/rules-of-hooks
  if (useNumericPattern(length)) {
    let v: number
    if (typeof p === 'number') {
      v = p
    } else {
      // Accept string numeric representation defensively.
      v = Number(p)
    }
    for (let i = 0; i < length; i++) {
      out[i] = v % 3
      v = Math.trunc(v / 3)
    }
    return out
  }
  // String path; ensure we can handle number input for robustness (pad/truncate).
  if (typeof p === 'string') {
    for (let i = 0; i < length; i++) {
      const ch = p[i]
      out[i] = ch === undefined ? 0 : ch.charCodeAt(0) - 48 // '0' => 0 etc.
    }
  } else {
    // numeric but expecting string fallback: reconstruct by repeated mod (rare path)
    let v = p
    for (let i = 0; i < length; i++) {
      out[i] = v % 3
      v = Math.trunc(v / 3)
    }
  }
  return out
}

export function patternEquals(a: PatternValue, b: PatternValue): boolean {
  return a === b
}
