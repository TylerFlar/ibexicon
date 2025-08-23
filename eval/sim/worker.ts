/* eslint-env node */
import { parentPort, workerData } from 'worker_threads'
import fs from 'node:fs'
import path from 'node:path'
import { CandidateSet } from '../../src/solver/filter.ts'
import { feedbackPattern } from '../../src/solver/feedback.ts'
import { encodeTrits } from '../../src/solver/pattern.ts'
import { suggestNext } from '../../src/solver/scoring.ts'
import { mulberry32 } from '../../src/solver/random.ts'

/** Policy identifiers supported by the simulator worker */
export type Policy = 'composite' | 'pure-eig' | 'pure-solve' | 'unique-letters'

/** Data passed from the main thread */
export interface WorkerInput {
  length: number
  policy: Policy
  trials: number
  attempts: number
  seed: number // base seed for deterministic RNG
}

/** Aggregate statistics returned to the parent */
export interface ShardResult {
  length: number
  policy: Policy
  trials: number
  successes: number
  failCount: number
  attemptHist: number[] // indices 0..attempts-1 for attempts used (success), last index = fails
  totalAttemptsSuccess: number
  totalTimeMs: number
  totalTimeSuccessMs: number
  // average remaining candidates on failure (accumulated)
  remainingOnFailAccum: number
}

interface PriorData {
  words: string[]
  priors: Record<string, number>
  cum: Float64Array // cumulative distribution (ascending) over words aligned with words[]
}

// ---- RNG ----
function makeRng(seed: number) {
  return mulberry32(seed >>> 0)
}

// ---- Load wordlist + priors for given length ----
function loadPriorData(length: number): PriorData {
  const root = process.cwd()
  const wordsPath = path.resolve(root, 'public', 'wordlists', 'en', `en-${length}.txt`)
  const priorsPath = path.resolve(root, 'public', 'wordlists', 'en', `en-${length}-priors.json`)
  if (!fs.existsSync(wordsPath)) throw new Error(`Wordlist not found: ${wordsPath}`)
  if (!fs.existsSync(priorsPath)) throw new Error(`Priors not found: ${priorsPath}`)
  const wordsRaw = fs.readFileSync(wordsPath, 'utf8').split(/\r?\n/).filter(Boolean)
  const priorsJson = JSON.parse(fs.readFileSync(priorsPath, 'utf8')) as Record<string, number>
  // Build aligned priors & cumulative distribution
  const priors: Record<string, number> = Object.create(null)
  const probs: number[] = []
  let sum = 0
  for (const w of wordsRaw) {
    const p = priorsJson[w] ?? 0
    priors[w] = p
    probs.push(p)
    sum += p
  }
  const cum = new Float64Array(wordsRaw.length)
  if (sum <= 0) {
    // uniform fallback
    for (let i = 0; i < cum.length; i++) cum[i] = (i + 1) / cum.length
  } else {
    let acc = 0
    for (let i = 0; i < probs.length; i++) {
      acc += probs[i]! / sum
      cum[i]! = acc
    }
  }
  return { words: wordsRaw, priors, cum }
}

function sampleSecret(prior: PriorData, rng: () => number): string {
  const r = rng()
  // binary search in cumulative
  const cum = prior.cum
  let lo = 0
  let hi = cum.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (cum[mid]! < r) lo = mid + 1
    else hi = mid
  }
  return prior.words[lo]!
}

// Unique letters policy selection
function pickUniqueLetters(words: string[], priors: Record<string, number>): string {
  let best: string | null = null
  let bestScore = -1
  let bestPrior = -1
  for (const w of words) {
    const unique = new Set(w).size
    const p = priors[w] ?? 0
    if (
      unique > bestScore ||
      (unique === bestScore && p > bestPrior) ||
      (unique === bestScore && p === bestPrior && best != null && w < best)
    ) {
      best = w
      bestScore = unique
      bestPrior = p
    }
  }
  return best || words[0]!
}

function pickGuess(
  policy: Policy,
  words: string[],
  priors: Record<string, number>,
  attemptsLeft: number,
  attemptsMax: number,
): string {
  switch (policy) {
    case 'composite': {
      const s = suggestNext(
        { words, priors },
        { attemptsLeft, attemptsMax, topK: 1, sampleCutoff: 5000, sampleSize: 3000, tau: null },
      )
      return s[0]?.guess || words[0]!
    }
    case 'pure-eig':
      return (
        suggestNext(
          { words, priors },
          { attemptsLeft, attemptsMax, topK: 1, sampleCutoff: 5000, sampleSize: 3000, tau: null, alphaOverride: 1 },
        )[0]?.guess || words[0]!
      )
    case 'pure-solve':
      return (
        suggestNext(
          { words, priors },
          { attemptsLeft, attemptsMax, topK: 1, sampleCutoff: 5000, sampleSize: 3000, tau: null, alphaOverride: 0 },
        )[0]?.guess || words[0]!
      )
    case 'unique-letters':
      return pickUniqueLetters(words, priors)
  }
}

function patternAllGreen(pat: ReturnType<typeof encodeTrits>, length: number): boolean {
  if (typeof pat === 'number') {
    // numeric representation: all greens => trit=2 for each => value = Σ 2*3^i
    // Precompute maximum? Simpler loop.
    let v = pat
    for (let i = 0; i < length; i++) {
      if (v % 3 !== 2) return false
      v = Math.trunc(v / 3)
    }
    return true
  } else {
    for (let i = 0; i < length; i++) if (pat[i] !== '2') return false
    return true
  }
}

function runTrials(input: WorkerInput): ShardResult {
  const prior = loadPriorData(input.length)
  const rng = makeRng(input.seed)
  const attemptsMax = input.attempts
  const attemptHist = new Array<number>(attemptsMax + 1).fill(0) // last index for fails
  let successes = 0
  let totalAttemptsSuccess = 0
  let failCount = 0
  let totalTimeMs = 0
  let totalTimeSuccessMs = 0
  let remainingOnFailAccum = 0

  for (let t = 0; t < input.trials; t++) {
    const secret = sampleSecret(prior, rng)
    const cs = new CandidateSet(prior.words)
    let solved = false
    let attemptsLeft = attemptsMax
    const start = Date.now()
    while (attemptsLeft > 0) {
      const aliveWords = cs.getAliveWords()
      // Build renormalized priors object on alive set only (suggestNext does internal renorm, but unique policy uses raw)
      const alivePriors: Record<string, number> = Object.create(null)
      for (const w of aliveWords) alivePriors[w] = prior.priors[w] ?? 0
      const guess = pickGuess(input.policy, aliveWords, alivePriors, attemptsLeft, attemptsMax)
      const pat = feedbackPattern(guess, secret)
      if (patternAllGreen(pat as any, input.length)) {
        solved = true
        const attemptsUsed = attemptsMax - attemptsLeft + 1
        attemptHist[attemptsUsed - 1]!++
        successes++
        totalAttemptsSuccess += attemptsUsed
        break
      } else {
        cs.applyFeedback(guess, pat)
        attemptsLeft--
      }
    }
    const dt = Date.now() - start
    totalTimeMs += dt
    if (solved) totalTimeSuccessMs += dt
    if (!solved) {
      failCount++
      attemptHist[attemptsMax]!++
      remainingOnFailAccum += cs.aliveCount()
    }
  }

  return {
    length: input.length,
    policy: input.policy,
    trials: input.trials,
    successes,
    failCount,
    attemptHist,
    totalAttemptsSuccess,
    totalTimeMs,
    totalTimeSuccessMs,
    remainingOnFailAccum,
  }
}

function main() {
  if (!parentPort) return
  const input = workerData as WorkerInput
  try {
    const shardResult = runTrials(input)
    parentPort.postMessage({ done: true, shardResult })
  } catch (err) {
    parentPort.postMessage({ done: true, error: (err as Error).message })
  }
}

main()
