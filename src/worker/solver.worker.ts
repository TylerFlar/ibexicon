/* Solver Web Worker (module) providing scoring RPC with progress & cancellation */
import { suggestNextWithProvider, CanceledError } from '@/solver/scoring'
import { letterPositionHeatmap, explainGuess } from '@/solver/analysis'
import { createPatternProvider } from './ptabCache'

// Message definitions (incoming)
export type Msg =
  | { id: number; type: 'warmup'; payload?: { length?: number; words?: string[] } }
  | {
      id: number
      type: 'score'
      payload: {
        words: string[]
        priors: [string, number][] | Record<string, number>
        attemptsLeft: number
        attemptsMax: number
        topK?: number
        tau?: number | null
        seed?: number
        sampleCutoff?: number
        sampleSize?: number
        prefilterLimit?: number
        chunkSize?: number
        earlyCut?: boolean
        epsilon?: number
      }
    }
  | {
      id: number
      type: 'analyze:heatmap'
      payload: { words: string[]; priors: [string, number][] | Record<string, number> }
    }
  | {
      id: number
      type: 'analyze:guess'
      payload: {
        guess: string
        words: string[]
        priors: [string, number][] | Record<string, number>
        sampleCutoff?: number
        sampleSize?: number
      }
    }
  | { id: number; type: 'cancel' }
  | { id: number; type: 'dispose' }

// Outgoing messages (replies / events)
export type OutMsg =
  | { id: number; type: 'warmup:ok' }
  | { id: number; type: 'progress'; p: number }
  | { id: number; type: 'result'; suggestions: unknown }
  | { id: number; type: 'analyze:heatmap:result'; result: unknown }
  | { id: number; type: 'analyze:guess:result'; result: unknown }
  | { id: number; type: 'canceled' }
  | { id: number; type: 'error'; error: { message: string; stack?: string } }
  | { id: number; type: 'disposed' }

let canceled = false
const patternProvider = createPatternProvider()

function normalizePriors(
  priors: [string, number][] | Record<string, number>,
): Record<string, number> {
  if (Array.isArray(priors)) {
    const out: Record<string, number> = Object.create(null)
    for (const [w, v] of priors) out[w] = v
    return out
  }
  return priors
}

function alignPriorsArray(words: string[], priorsRec: Record<string, number>): Float64Array {
  const arr = new Float64Array(words.length)
  for (let i = 0; i < words.length; i++) {
    const v = priorsRec[words[i]!] // may be undefined
    arr[i] = v && v > 0 && Number.isFinite(v) ? v : 0
  }
  return arr
}

// Simple noop to allow warmup verifying tree-shaking boundaries.
function warmupNoop(): void {
  // Intentionally empty.
}

self.onmessage = async (e: MessageEvent<Msg>) => {
  const msg = e.data
  switch (msg.type) {
    case 'cancel': {
      canceled = true
      return
    }
    case 'dispose': {
      const out: OutMsg = { id: msg.id, type: 'disposed' }
      ;(self as unknown as Worker).postMessage(out)
      self.close()
      return
    }
    case 'warmup': {
      try {
        warmupNoop()
        if (msg.payload?.length && msg.payload.words) {
          // Preload pattern asset (non-blocking but awaited here for determinism)
          try {
            await patternProvider.ensureForLength(msg.payload.length, msg.payload.words)
          } catch {/* ignore */}
        }
        const out: OutMsg = { id: msg.id, type: 'warmup:ok' }
        ;(self as unknown as Worker).postMessage(out)
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) }
        const out: OutMsg = { id: msg.id, type: 'error', error }
        ;(self as unknown as Worker).postMessage(out)
      }
      return
    }
    case 'score': {
      canceled = false // reset cancellation for new job
      const {
        words,
        priors,
        attemptsLeft,
        attemptsMax,
        topK,
        tau,
        seed,
        sampleCutoff,
        sampleSize,
        prefilterLimit,
        chunkSize,
        earlyCut,
        epsilon,
      } = msg.payload
      try {
        const priorsRecord = normalizePriors(priors)
        // Ensure potential asset present
        try { await patternProvider.ensureForLength(words[0]?.length || 0, words) } catch {/* ignore */}
        const suggestions = await suggestNextWithProvider(
          { words, priors: priorsRecord },
          {
            attemptsLeft,
            attemptsMax,
            topK,
            tau: tau ?? null,
            seed,
            sampleCutoff,
            sampleSize,
            prefilterLimit,
            chunkSize,
            earlyCut,
            epsilon,
            onProgress: (p) => {
              const out: OutMsg = { id: msg.id, type: 'progress', p }
              ;(self as unknown as Worker).postMessage(out)
            },
            shouldCancel: () => canceled,
            getPrecomputedPatterns: async (guess: string) => {
              try {
                const L = words[0]?.length || 0
                const arr = await patternProvider.getPatterns(L, words, guess)
                return arr
              } catch {
                return null
              }
            },
          },
        )
        if (canceled) {
          const out: OutMsg = { id: msg.id, type: 'canceled' }
          ;(self as unknown as Worker).postMessage(out)
          return
        }
        const out: OutMsg = { id: msg.id, type: 'result', suggestions }
        ;(self as unknown as Worker).postMessage(out)
      } catch (err) {
        if (err instanceof CanceledError) {
          const out: OutMsg = { id: msg.id, type: 'canceled' }
          ;(self as unknown as Worker).postMessage(out)
          return
        }
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) }
        const out: OutMsg = { id: msg.id, type: 'error', error }
        ;(self as unknown as Worker).postMessage(out)
      }
      return
    }
    case 'analyze:heatmap': {
      try {
        const priorsRecord = normalizePriors(msg.payload.priors)
        const pArr = alignPriorsArray(msg.payload.words, priorsRecord)
        const result = letterPositionHeatmap(msg.payload.words, pArr)
        const out: OutMsg = { id: msg.id, type: 'analyze:heatmap:result', result }
        ;(self as unknown as Worker).postMessage(out)
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) }
        const out: OutMsg = { id: msg.id, type: 'error', error }
        ;(self as unknown as Worker).postMessage(out)
      }
      return
    }
    case 'analyze:guess': {
      try {
        const { guess, words, priors, sampleCutoff, sampleSize } = msg.payload
        const priorsRecord = normalizePriors(priors)
        const pArr = alignPriorsArray(words, priorsRecord)
        const cutoff = sampleCutoff ?? 20000
        const size = sampleSize ?? 5000
        const useSample = words.length > cutoff
        const sample = useSample ? { size } : undefined
        const result = explainGuess(guess, words, pArr, sample)
        const out: OutMsg = { id: msg.id, type: 'analyze:guess:result', result }
        ;(self as unknown as Worker).postMessage(out)
      } catch (err) {
        const error =
          err instanceof Error
            ? { message: err.message, stack: err.stack }
            : { message: String(err) }
        const out: OutMsg = { id: msg.id, type: 'error', error }
        ;(self as unknown as Worker).postMessage(out)
      }
      return
    }
  }
}
