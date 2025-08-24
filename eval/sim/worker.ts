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
export type Policy =
  | 'composite'
  | 'pure-eig'
  | 'pure-solve'
  | 'unique-letters'
  | 'in-set-only'
  | 'bandit'

/** Data passed from the main thread */
export interface WorkerInput {
  datasetId: string
  length: number
  policy: Policy
  trials: number
  attempts: number
  seed: number // base seed for deterministic RNG
  wordsFile: string
  priorsFile: string
  banditResetPerTrial?: boolean
  halfLifeUpdates?: number
}

/** Aggregate statistics returned to the parent */
export interface ShardResult {
  datasetId: string
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
function loadPriorData(wordsFile: string, priorsFile: string): PriorData {
  const root = process.cwd()
  const wordsPath = path.resolve(root, 'public', 'wordlists', 'en', wordsFile)
  const priorsPath = path.resolve(root, 'public', 'wordlists', 'en', priorsFile)
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

// base (non-meta) policies bandit may choose among
type BaseBanditPolicy = 'composite' | 'pure-eig' | 'in-set-only' | 'unique-letters'

function pickGuess(
  policy: Policy | BaseBanditPolicy,
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
          {
            attemptsLeft,
            attemptsMax,
            topK: 1,
            sampleCutoff: 5000,
            sampleSize: 3000,
            tau: null,
            alphaOverride: 1,
          },
        )[0]?.guess || words[0]!
      )
    case 'pure-solve':
      return (
        suggestNext(
          { words, priors },
          {
            attemptsLeft,
            attemptsMax,
            topK: 1,
            sampleCutoff: 5000,
            sampleSize: 3000,
            tau: null,
            alphaOverride: 0,
          },
        )[0]?.guess || words[0]!
      )
    case 'in-set-only': {
      // pick highest prior mass (renorm not needed for argmax)
      let best = words[0]!
      let bestP = -1
      for (const w of words) {
        const p = priors[w] ?? 0
        if (p > bestP || (p === bestP && w < best)) {
          best = w
          bestP = p
        }
      }
      return best
    }
    case 'unique-letters':
      return pickUniqueLetters(words, priors)
    case 'bandit':
      throw new Error('Internal error: meta-policy bandit should not be directly guessed')
  }
}

// --- Bandit state (in-memory) ---
interface ArmState {
  a: number
  b: number
  updates: number
}
interface BanditState {
  arms: Record<BaseBanditPolicy, ArmState>
  totalUpdates: number
}
function emptyBanditState(): BanditState {
  return {
    totalUpdates: 0,
    arms: {
      composite: { a: 1, b: 1, updates: 0 },
      'pure-eig': { a: 1, b: 1, updates: 0 },
      'in-set-only': { a: 1, b: 1, updates: 0 },
      'unique-letters': { a: 1, b: 1, updates: 0 },
    },
  }
}
function decayGamma(halfLife: number): number {
  return Math.pow(0.5, 1 / Math.max(1, halfLife))
}
function sampleArm(state: BanditState): BaseBanditPolicy {
  const draws: Array<[BaseBanditPolicy, number]> = []
  for (const id of Object.keys(state.arms) as BaseBanditPolicy[]) {
    const { a, b } = state.arms[id]!
    // Approximate Beta sampling (same heuristic as browser side)
    const u1 = Math.random() || 1e-12
    const u2 = Math.random() || 1e-12
    const x = Math.pow(u1, 1 / a)
    const y = Math.pow(u2, 1 / b)
    const theta = x / (x + y)
    draws.push([id, theta])
  }
  draws.sort((a, b) => b[1] - a[1])
  return draws[0]![0]
}
function updateArm(state: BanditState, id: BaseBanditPolicy, reward01: number, halfLife: number) {
  const g = decayGamma(halfLife)
  const arm = state.arms[id]!
  const r = Math.max(0, Math.min(1, reward01))
  arm.a = Math.max(1, 1 + (arm.a - 1) * g + r)
  arm.b = Math.max(1, 1 + (arm.b - 1) * g + (1 - r))
  arm.updates++
  state.totalUpdates++
}
function rewardFromSizes(Sbefore: number, Safter: number): number {
  const b = Math.max(1, Sbefore | 0)
  const a = Math.max(1, Safter | 0)
  if (b <= 1) return a === 1 ? 1 : 0
  const num = Math.log2(b) - Math.log2(a)
  const den = Math.log2(b)
  return den > 0 ? Math.max(0, Math.min(1, num / den)) : 0
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
  const prior = loadPriorData(input.wordsFile, input.priorsFile)
  const rng = makeRng(input.seed)
  const attemptsMax = input.attempts
  const attemptHist = new Array<number>(attemptsMax + 1).fill(0) // last index for fails
  let successes = 0
  let totalAttemptsSuccess = 0
  let failCount = 0
  let totalTimeMs = 0
  let totalTimeSuccessMs = 0
  let remainingOnFailAccum = 0

  // Bandit state (per length) only if meta-policy used
  let banditState: BanditState | null = input.policy === 'bandit' ? emptyBanditState() : null
  const halfLife = input.halfLifeUpdates ?? 20

  for (let t = 0; t < input.trials; t++) {
    if (input.policy === 'bandit' && input.banditResetPerTrial) {
      banditState = emptyBanditState()
    }
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
      let chosenPolicy: Policy | BaseBanditPolicy = input.policy
      if (input.policy === 'bandit') {
        if (!banditState) banditState = emptyBanditState()
        chosenPolicy = sampleArm(banditState)
      }
      const Sbefore = cs.aliveCount()
      const guess = pickGuess(chosenPolicy, aliveWords, alivePriors, attemptsLeft, attemptsMax)
      const pat = feedbackPattern(guess, secret)
      if (patternAllGreen(pat as any, input.length)) {
        solved = true
        const attemptsUsed = attemptsMax - attemptsLeft + 1
        attemptHist[attemptsUsed - 1]!++
        successes++
        totalAttemptsSuccess += attemptsUsed
        if (input.policy === 'bandit') {
          // Reward on solving: after state would be 1
          const r = rewardFromSizes(Sbefore, 1)
          updateArm(banditState!, chosenPolicy as BaseBanditPolicy, r, halfLife)
        }
        break
      } else {
        cs.applyFeedback(guess, pat)
        if (input.policy === 'bandit') {
          const Safter = cs.aliveCount()
          const r = rewardFromSizes(Sbefore, Safter)
          updateArm(banditState!, chosenPolicy as BaseBanditPolicy, r, halfLife)
        }
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
    datasetId: input.datasetId,
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
