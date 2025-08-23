// Inline Web Worker polyfill for Vitest (jsdom) environment.
// Emulates minimal postMessage/onmessage contract used by SolverWorkerClient.
import { suggestNext, CanceledError } from './src/solver/scoring'

if (typeof Worker === 'undefined') {
  interface PendingScore {
    id: number
    payload: any
  }
  class InlineWorker {
    onmessage: ((e: MessageEvent<any>) => void) | null = null
    onerror: ((e: any) => void) | null = null
    private canceled = false
    private disposed = false
    private current: PendingScore | null = null
    constructor(_url: URL, _opts?: any) {}
    postMessage(msg: any) {
      if (this.disposed) return
      switch (msg.type) {
        case 'dispose':
          this.disposed = true
          this.emit({ id: msg.id, type: 'disposed' })
          return
        case 'cancel':
          this.canceled = true
          return
        case 'warmup':
          this.emit({ id: msg.id, type: 'warmup:ok' })
          return
        case 'score': {
          this.canceled = false
          this.current = { id: msg.id, payload: msg.payload }
          // Defer heavy compute to allow cancel to arrive first in tests
          setTimeout(() => this.runScore(), 0)
          return
        }
      }
    }
    private runScore() {
      const job = this.current
      if (!job) return
      const { id, payload } = job
      try {
        const { words, priors, attemptsLeft, attemptsMax, topK, tau, seed, sampleCutoff, sampleSize, prefilterLimit, chunkSize } = payload
        const priorsRecord: Record<string, number> = Array.isArray(priors) ? Object.fromEntries(priors) : priors
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
            onProgress: (p: number) => this.emit({ id, type: 'progress', p }),
            shouldCancel: () => this.canceled,
          },
        )
        if (this.canceled) {
          this.emit({ id, type: 'canceled' })
        } else {
          this.emit({ id, type: 'result', suggestions })
        }
      } catch (err) {
        if (err instanceof CanceledError || (err as any)?.name === 'CanceledError') {
          this.emit({ id, type: 'canceled' })
        } else {
          const e = err as any
            this.emit({ id, type: 'error', error: { message: String(e?.message || e), stack: e?.stack } })
        }
      } finally {
        this.current = null
      }
    }
    private emit(data: any) {
      this.onmessage?.({ data } as MessageEvent)
    }
    terminate() {
      this.disposed = true
      this.canceled = true
      this.current = null
    }
  }
  // @ts-ignore
  globalThis.Worker = InlineWorker as any
}
