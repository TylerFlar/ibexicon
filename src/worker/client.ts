 
import type { Msg as WorkerMsg, OutMsg } from './solver.worker'

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

interface PendingEntry<T = unknown> {
  resolve: (value: T) => void
  reject: (error: unknown) => void
  onProgress?: ProgressHandler
  kind: 'warmup' | 'score' | 'dispose'
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
  this.pending.set(id, { resolve: resolve as (v: void) => void, reject: reject as (e: unknown) => void, kind: 'warmup' })
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
  this.pending.set(id, { resolve: resolve as (v: ScoreResult) => void, reject: reject as (e: unknown) => void, onProgress, kind: 'score' })
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
