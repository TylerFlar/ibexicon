import { describe, it, expect } from 'vitest'
import { reducer, initialState, type Trit } from '@/app/state/session'

describe('session reducer extra coverage', () => {
  it('setDataset resets history & guessInput', () => {
    let s = initialState(5)
    s = {
      ...s,
      history: [{ guess: 'apple', trits: [0, 0, 0, 0, 0] as Trit[] }],
      guessInput: 'work',
    }
    const s2 = reducer(s, { type: 'setDataset', id: 'en-7', length: 7 })
    expect(s2.settings.datasetId).toBe('en-7')
    expect(s2.settings.length).toBe(7)
    expect(s2.history).toHaveLength(0)
    expect(s2.guessInput).toBe('')
  })

  it('setLength same value returns original state', () => {
    const s = initialState(5)
    const s2 = reducer(s, { type: 'setLength', length: 5 })
    expect(s2).toBe(s)
  })

  it('addGuess ignores invalid lengths & invalid trits', () => {
    const s = initialState(5)
    const bad1 = reducer(s, {
      type: 'addGuess',
      payload: { guess: 'toolong', trits: [0, 0, 0, 0, 0] as Trit[] },
    })
    expect(bad1).toBe(s)
    const bad2 = reducer(s, {
      type: 'addGuess',
      payload: { guess: 'short', trits: [0, 0, 0, 0] as Trit[] },
    })
    expect(bad2).toBe(s)
    const bad3 = reducer(s, {
      type: 'addGuess',
      payload: { guess: 'abcde', trits: [0, 0, 0, 0, 9] as any },
    })
    expect(bad3).toBe(s)
  })

  it('setPolicy and setAccelMode update when changed & ignore when same', () => {
    let s = initialState(5)
    // Default is now 'composite'; setting 'composite' again should return same reference
    const samePolicy = reducer(s, { type: 'setPolicy', value: 'composite' })
    expect(samePolicy).toBe(s)
    // Changing to 'auto' should produce a new state
    s = reducer(s, { type: 'setPolicy', value: 'auto' })
    expect(s.settings.policyMode).toBe('auto')
    const sameAccel = reducer(s, { type: 'setAccelMode', value: 'auto' })
    expect(sameAccel).toBe(s)
    s = reducer(s, { type: 'setAccelMode', value: 'js' })
    expect(s.settings.accelMode).toBe('js')
  })
})
