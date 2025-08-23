/* Solver Web Worker (module) providing scoring RPC with progress & cancellation */
import { suggestNext, CanceledError } from '@/solver/scoring'

// Message definitions (incoming)
export type Msg =
  | { id: number; type: 'warmup' }
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
      }
    }
  | { id: number; type: 'cancel' }
  | { id: number; type: 'dispose' }

// Outgoing messages (replies / events)
export type OutMsg =
  | { id: number; type: 'warmup:ok' }
  | { id: number; type: 'progress'; p: number }
  | { id: number; type: 'result'; suggestions: unknown }
  | { id: number; type: 'canceled' }
  | { id: number; type: 'error'; error: { message: string; stack?: string } }
  | { id: number; type: 'disposed' }

let canceled = false

function normalizePriors(priors: [string, number][] | Record<string, number>): Record<string, number> {
  if (Array.isArray(priors)) {
    const out: Record<string, number> = Object.create(null)
    for (const [w, v] of priors) out[w] = v
    return out
  }
  return priors
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
        const out: OutMsg = { id: msg.id, type: 'warmup:ok' }
        ;(self as unknown as Worker).postMessage(out)
      } catch (err) {
        const error = err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) }
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
      } = msg.payload
      try {
        const priorsRecord = normalizePriors(priors)
        const suggestions = suggestNext(
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
            onProgress: (p) => {
              const out: OutMsg = { id: msg.id, type: 'progress', p }
              ;(self as unknown as Worker).postMessage(out)
            },
            shouldCancel: () => canceled,
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
        const error = err instanceof Error ? { message: err.message, stack: err.stack } : { message: String(err) }
        const out: OutMsg = { id: msg.id, type: 'error', error }
        ;(self as unknown as Worker).postMessage(out)
      }
      return
    }
  }
}
