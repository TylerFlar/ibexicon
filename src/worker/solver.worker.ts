/* Solver Web Worker (module) providing scoring RPC with progress & cancellation */
import { suggestNextWithProvider, CanceledError } from '@/solver/scoring'
import { letterPositionHeatmap, explainGuess } from '@/solver/analysis'
import { createPatternProvider, setUserAccelMode } from './ptabCache'
import { countPtabForLength, deletePtabForLength } from './idb'

// Message definitions (incoming)
export type Msg =
  | {
      id: number
      type: 'warmup'
      payload?: { length?: number; words?: string[]; datasetId?: string }
    }
  | {
      id: number
      type: 'ptab:ensure'
      payload: { length: number; words: string[]; datasetId?: string }
    }
  | { id: number; type: 'ptab:stats'; payload: { length: number; datasetId?: string } }
  | { id: number; type: 'ptab:clearMemory'; payload: { length: number; datasetId?: string } }
  | { id: number; type: 'ptab:clearIDB'; payload: { length: number; datasetId?: string } }
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
  | { id: number; type: 'config:accel'; payload: { mode: 'auto' | 'js' | 'wasm' } }
  | { id: number; type: 'bench:patternRow'; payload: { length: number; N: number } }

// Outgoing messages (replies / events)
export type OutMsg =
  | { id: number; type: 'warmup:ok' }
  | { id: number; type: 'ptab:progress'; stage: string; percent: number }
  | { id: number; type: 'ptab:ready'; meta: { L: number; N: number; M: number; hash32: number } }
  | {
      id: number
      type: 'ptab:stats:result'
      stats: {
        length: number
        memorySeedPlanes: number
        memoryFallback: number
        idbEntries: number
      }
    }
  | { id: number; type: 'progress'; p: number }
  | { id: number; type: 'result'; suggestions: unknown }
  | { id: number; type: 'analyze:heatmap:result'; result: unknown }
  | { id: number; type: 'analyze:guess:result'; result: unknown }
  | { id: number; type: 'canceled' }
  | { id: number; type: 'error'; error: { message: string; stack?: string } }
  | { id: number; type: 'disposed' }
  | { id: number; type: 'bench:result'; jsMs: number; wasmMs: number | null }

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
          } catch {
            /* ignore */
          }
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
    case 'config:accel': {
      try {
        setUserAccelMode(msg.payload.mode)
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
    case 'ptab:ensure': {
      const { length, words, datasetId } = msg.payload
      try {
        const meta = await patternProvider.ensureForLength(
          length,
          words,
          (stage, percent) => {
            const out: OutMsg = { id: msg.id, type: 'ptab:progress', stage, percent }
            ;(self as unknown as Worker).postMessage(out)
          },
          datasetId,
        )
        const out: OutMsg = {
          id: msg.id,
          type: 'ptab:ready',
          meta: meta ? meta : { L: length, N: words.length, M: 0, hash32: 0 },
        }
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
    case 'ptab:stats': {
      const { length, datasetId } = msg.payload
      try {
        const statsMem = patternProvider.statsForLength(length, datasetId)
        const idbEntries = await countPtabForLength(length, datasetId)
        const out: OutMsg = {
          id: msg.id,
          type: 'ptab:stats:result',
          stats: {
            length,
            memorySeedPlanes: statsMem.memorySeedPlanes,
            memoryFallback: statsMem.memoryFallback,
            idbEntries,
          },
        }
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
    case 'ptab:clearMemory': {
      try {
        patternProvider.clearFallbackForLength(msg.payload.length, msg.payload.datasetId)
        const out: OutMsg = {
          id: msg.id,
          type: 'ptab:stats:result',
          stats: {
            length: msg.payload.length,
            memorySeedPlanes: 0,
            memoryFallback: 0,
            idbEntries: 0,
          },
        }
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
    case 'ptab:clearIDB': {
      try {
        await deletePtabForLength(msg.payload.length, msg.payload.datasetId)
        const statsMem = patternProvider.statsForLength(msg.payload.length, msg.payload.datasetId)
        const out: OutMsg = {
          id: msg.id,
          type: 'ptab:stats:result',
          stats: {
            length: msg.payload.length,
            memorySeedPlanes: statsMem.memorySeedPlanes,
            memoryFallback: statsMem.memoryFallback,
            idbEntries: 0,
          },
        }
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
        try {
          await patternProvider.ensureForLength(
            words[0]?.length || 0,
            words,
            undefined /* progress */,
            undefined /* datasetId (future threading) */,
          )
        } catch {
          /* ignore */
        }
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
                const arr = await patternProvider.getPatterns(
                  L,
                  words,
                  guess,
                  undefined /* datasetId future */,
                )
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
    case 'bench:patternRow': {
      // Pattern row micro-benchmark
      const { length, N } = msg.payload
      try {
        // Acquire words (ensure length asset or fallback) by attempting ensureForLength with dummy words list.
        // Instead, we just rely on patternProvider calling environment for precomputed; we need actual word list though.
        // Here we cannot fetch main thread words; so we synthesize pseudo-random words over alphabet.
        const L = length
        const alpha = 'abcdefghijklmnopqrstuvwxyz'
        function randWord(): string {
          let s = ''
            for (let i = 0; i < L; i++) s += alpha[(Math.random() * 26) | 0]!
          return s
        }
        const secrets: string[] = Array.from({ length: N }, randWord)
        const guess = secrets[(Math.random() * secrets.length) | 0] || randWord()
        // JS baseline
        const runs = 3
        const jsTimes: number[] = []
        for (let r = 0; r < runs; r++) {
          const t0 = performance.now()
          for (let i = 0; i < N; i++) {
            // local inline of feedbackPattern would avoid overhead, but we reuse provider path for integrity.
            // Direct compute replicating getPatterns fallback JS loop (simplified duplicates logic inside feedbackPattern).
            // We'll just call feedbackPattern via provider compute path by invoking feedbackPattern directly here.
            // We don't store results; we just ensure a similar number of operations.
            // Import local to avoid tree-shaking confusion.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            // NOOP here; compute pattern to number.
            // We'll implement our own quick duplicate-aware pass for speed parity.
            const g = guess
            const s = secrets[i]!
            if (g.length !== s.length) continue
            const counts = new Array(26).fill(0)
            const greens: boolean[] = []
            for (let k = 0; k < L; k++) {
              const c = s.charCodeAt(k) - 97
              if (c >= 0 && c < 26) counts[c]++
            }
            const trits = new Array(L).fill(0)
            for (let k = 0; k < L; k++) {
              if (g[k] === s[k]) {
                trits[k] = 2
                const c = g.charCodeAt(k) - 97
                if (c >= 0 && c < 26) counts[c]--
                greens[k] = true
              }
            }
            for (let k = 0; k < L; k++) {
              if (trits[k] === 0) {
                const c = g.charCodeAt(k) - 97
                if (c >= 0 && c < 26 && counts[c] > 0) {
                  trits[k] = 1
                  counts[c]--
                }
              }
            }
            // encode base3 (no storing)
            let code = 0
            let mul = 1
            for (let k = 0; k < L; k++) {
              code += trits[k] * mul
              mul *= 3
            }
            if (code === -1) console.log('impossible') // prevent aggressive elimination (never runs)
          }
          jsTimes.push(performance.now() - t0)
        }
        const jsMs = Math.min(...jsTimes)
        let wasmMs: number | null = null
        if (L <= 10) {
          try {
            const { wasmPatternRowU16 } = await import('@/wasm')
            const wasmTimes: number[] = []
            for (let r = 0; r < runs; r++) {
              const t0 = performance.now()
              const arr = await wasmPatternRowU16(guess, secrets)
              if (!arr) throw new Error('WASM returned null')
              wasmTimes.push(performance.now() - t0)
            }
            wasmMs = Math.min(...wasmTimes)
          } catch {
            wasmMs = null
          }
        }
        const out: OutMsg = { id: msg.id, type: 'bench:result', jsMs, wasmMs }
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
