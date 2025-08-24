import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  initialState,
  persist,
  loadPersisted,
  STORAGE_KEY,
  type SessionState,
} from '@/app/state/session'

// JSDOM provides localStorage; we stub requestIdleCallback to run immediately for deterministic tests.
beforeEach(() => {
  // Clear storage between tests
  window.localStorage.clear()
  ;(window as any).requestIdleCallback = (cb: any) => {
    cb()
    return 1
  }
})

describe('session persist/load', () => {
  it('persist writes only settings and is idempotent on unchanged state', () => {
    const state = initialState(5)
    const spy = vi.spyOn(window.localStorage.__proto__, 'setItem')
    persist(state)
    persist(state) // second call should be no-op
    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).toBeTruthy()
    const parsed = JSON.parse(raw!)
    // History should be dropped
    expect(parsed.history).toEqual([])
    expect(parsed.settings.length).toBe(5)
    // Only one write
    expect(spy.mock.calls.length).toBe(1)
  })

  it('loadPersisted returns sanitized state with cleared history/input', () => {
    const valid: SessionState = {
      settings: {
        length: 6,
        attemptsMax: 8,
        colorblind: true,
        datasetId: 'en-6',
        policyMode: 'composite',
        accelMode: 'js',
        theme: 'system',
      },
      history: [
        { guess: 'candle', trits: [0, 0, 0, 0, 0, 0] },
        { guess: 'planet', trits: [1, 1, 1, 1, 1, 1] },
      ],
      guessInput: 'working',
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(valid))
    const loaded = loadPersisted()!
    expect(loaded.settings.length).toBe(6)
    expect(loaded.history).toEqual([])
    expect(loaded.guessInput).toBe('')
    // policyMode/accelMode preserved
    expect(loaded.settings.policyMode).toBe('composite')
    expect(loaded.settings.accelMode).toBe('js')
  })

  it('loadPersisted returns null for invalid JSON / shape', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not-json')
    expect(loadPersisted()).toBeNull()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ foo: 'bar' }))
    expect(loadPersisted()).toBeNull()
  })
})
