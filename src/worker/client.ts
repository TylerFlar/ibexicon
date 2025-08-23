import type { Msg as WorkerMsg, OutMsg } from './solver.worker'
// Fallback (non-worker) analysis for environments where worker messages stall (e.g., certain test runners)
import { letterPositionHeatmap, explainGuess } from '@/solver/analysis'

// Progress handler (percent 0..1)
export type ProgressHandler = (percent: number) => void

export interface ScoreArgs {
  words: string[]
  priors: Record<string, number>
  attemptsLeft: number
  attemptsMax: number
  topK?: number
  tau?: number | null
  seed?: number
  sampleCutoff?: number
  sampleSize?: number
  prefilterLimit?: number
  chunkSize?: number
  onProgress?: ProgressHandler
}

export interface ScoreResult {
  suggestions: Array<{
    guess: string
    eig: number
    solveProb: number
    alpha: number
    expectedRemaining: number
  }>
  canceled?: boolean
}

export interface HeatmapResult {
  length: number
  mass: number[][]
  letterIndex: string[]
}

export interface GuessExplain {
  guess: string
  expectedGreens: number
  posMatchMass: number[]
  coverageMass: number
  splits: Array<{ pattern: number | string; prob: number; bucketCount: number }>
}

interface PendingEntry<T = unknown> {
  resolve: (value: T) => void
  reject: (error: unknown) => void
  onProgress?: ProgressHandler
  kind: 'warmup' | 'score' | 'dispose' | 'analyze:heatmap' | 'analyze:guess'
}

export class SolverWorkerClient {
  private worker: Worker
  private msgId = 1
  private pending = new Map<number, PendingEntry<any>>()
  private currentScoreId: number | null = null

  constructor() {
    this.worker = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<OutMsg>) => this.handleMessage(e.data)
  }

  private nextId(): number {
    return this.msgId++
  }

  private post(msg: WorkerMsg): void {
    this.worker.postMessage(msg)
  }

  private handleMessage(msg: OutMsg): void {
    const entry = this.pending.get(msg.id)
    if (!entry) return // stale or already resolved
    switch (msg.type) {
      case 'progress':
        entry.onProgress?.(msg.p)
        return
      case 'warmup:ok':
        this.pending.delete(msg.id)
        entry.resolve(undefined)
        return
      case 'result': {
        this.pending.delete(msg.id)
        if (this.currentScoreId === msg.id) this.currentScoreId = null
        const suggestions = msg.suggestions as ScoreResult['suggestions']
        entry.resolve({ suggestions } as ScoreResult)
        return
      }
      case 'analyze:heatmap:result': {
        this.pending.delete(msg.id)
        entry.resolve(msg.result as HeatmapResult)
        return
      }
      case 'analyze:guess:result': {
        this.pending.delete(msg.id)
        entry.resolve(msg.result as GuessExplain)
        return
      }
      case 'canceled': {
        this.pending.delete(msg.id)
        if (this.currentScoreId === msg.id) this.currentScoreId = null
        entry.resolve({ suggestions: [], canceled: true } as ScoreResult)
        return
      }
      case 'error': {
        this.pending.delete(msg.id)
        if (this.currentScoreId === msg.id) this.currentScoreId = null
        const err = new Error(msg.error.message)
        if (msg.error.stack) err.stack = msg.error.stack
        entry.reject(err)
        return
      }
      case 'disposed': {
        this.pending.delete(msg.id)
        entry.resolve(undefined)
        return
      }
    }
  }

  warmup(): Promise<void> {
    const id = this.nextId()
    return new Promise<void>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (v: void) => void,
        reject: reject as (e: unknown) => void,
        kind: 'warmup',
      })
      this.post({ id, type: 'warmup' })
    })
  }

  score(args: ScoreArgs, signal?: AbortSignal): Promise<ScoreResult> {
    if (this.currentScoreId != null) {
      return Promise.reject(new Error('A score operation is already in progress'))
    }
    const id = this.nextId()
    this.currentScoreId = id
    const { onProgress, ...rest } = args
    const priorsEntries = Object.entries(rest.priors)
    return new Promise<ScoreResult>((resolve, reject) => {
      const abortHandler = () => this.cancel()
      if (signal) {
        if (signal.aborted) {
          abortHandler()
        } else {
          signal.addEventListener('abort', abortHandler, { once: true })
        }
      }
      this.pending.set(id, {
        resolve: resolve as (v: ScoreResult) => void,
        reject: reject as (e: unknown) => void,
        onProgress,
        kind: 'score',
      })
      this.post({
        id,
        type: 'score',
        payload: {
          words: rest.words,
          priors: priorsEntries, // compact representation
          attemptsLeft: rest.attemptsLeft,
          attemptsMax: rest.attemptsMax,
          topK: rest.topK,
          tau: rest.tau ?? null,
          seed: rest.seed,
          sampleCutoff: rest.sampleCutoff,
          sampleSize: rest.sampleSize,
          prefilterLimit: rest.prefilterLimit,
          chunkSize: rest.chunkSize,
        },
      })
    })
  }

  analyzeHeatmap(words: string[], priors: Record<string, number>): Promise<HeatmapResult> {
    const id = this.nextId()
    const priorsEntries = Object.entries(priors)
    return new Promise<HeatmapResult>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        // Fallback locally
        try {
          // Build aligned priors array and feed into heatmap util
          const pArr = new Float64Array(words.length)
          let sum = 0
          for (let i = 0; i < words.length; i++) sum += priors[words[i]!] || 0
          for (let i = 0; i < words.length; i++) {
            const val = priors[words[i]!] || 0
            pArr[i] = sum > 0 ? val : 1 / words.length
          }
          settled = true
          resolve(letterPositionHeatmap(words, pArr))
          this.pending.delete(id)
        } catch (e) {
          settled = true
          this.pending.delete(id)
          reject(e)
        }
      }, 800) // quick fallback
      this.pending.set(id, {
        resolve: (v: HeatmapResult) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(v)
        },
        reject: (e) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(e)
        },
        kind: 'analyze:heatmap',
      })
      this.post({
        id,
        type: 'analyze:heatmap',
        payload: { words, priors: priorsEntries },
      } as WorkerMsg)
    })
  }

  analyzeGuess(args: {
    guess: string
    words: string[]
    priors: Record<string, number>
    sampleCutoff?: number
    sampleSize?: number
  }): Promise<GuessExplain> {
    const id = this.nextId()
    const priorsEntries = Object.entries(args.priors)
    return new Promise<GuessExplain>((resolve, reject) => {
      let settled = false
      const timeout = setTimeout(() => {
        if (settled) return
        try {
          // Local fallback (no sampling for simplicity)
          const words = args.words
          const pArr = new Float64Array(words.length)
          let sum = 0
          for (let i = 0; i < words.length; i++) sum += args.priors[words[i]!] || 0
          for (let i = 0; i < words.length; i++) {
            const val = args.priors[words[i]!] || 0
            pArr[i] = sum > 0 ? val : 1 / words.length
          }
          const res = explainGuess(args.guess, words, pArr, undefined)
          settled = true
          resolve(res)
          this.pending.delete(id)
        } catch (e) {
          settled = true
          this.pending.delete(id)
          reject(e)
        }
      }, 800)
      this.pending.set(id, {
        resolve: (v: GuessExplain) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          resolve(v)
        },
        reject: (e) => {
          if (settled) return
          settled = true
          clearTimeout(timeout)
          reject(e)
        },
        kind: 'analyze:guess',
      })
      this.post({
        id,
        type: 'analyze:guess',
        payload: {
          guess: args.guess,
          words: args.words,
          priors: priorsEntries,
          sampleCutoff: args.sampleCutoff,
          sampleSize: args.sampleSize,
        },
      } as WorkerMsg)
    })
  }

  cancel(): void {
    if (this.currentScoreId != null) {
      this.post({ id: this.currentScoreId, type: 'cancel' })
    }
  }

  dispose(): void {
    // Send dispose message; also terminate as a safety fallback after a tick.
    const id = this.nextId()
    this.pending.set(id, { resolve: () => {}, reject: () => {}, kind: 'dispose' })
    try {
      this.post({ id, type: 'dispose' })
    } finally {
      // Ensure hard stop eventually
      setTimeout(() => {
        try {
          this.worker.terminate()
        } catch (_) {
          /* ignore */
        }
      }, 100)
    }
  }
}

export function makeAbortController(): AbortController {
  return new AbortController()
}
