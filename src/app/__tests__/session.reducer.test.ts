import { describe, it, expect } from 'vitest'
import { reducer, initialState, type Trit } from '../state/session'

function mk(len = 5) {
  return initialState(len)
}

describe('session reducer', () => {
  it('addGuess appends and clears guessInput', () => {
    let s = mk(5)
    s = { ...s, guessInput: 'crane' }
    const trits: Trit[] = [0, 1, 2, 0, 1]
    const s2 = reducer(s, { type: 'addGuess', payload: { guess: 'crane', trits } })
    expect(s2.history).toHaveLength(1)
    expect(s2.history[0]!.guess).toBe('crane')
    expect(s2.history[0]!.trits).toEqual(trits)
    expect(s2.guessInput).toBe('')
  })

  it('editTrit updates only targeted trit', () => {
    const trits: Trit[] = [0, 0, 0, 0, 0]
    let s = mk(5)
    s = reducer(s, { type: 'addGuess', payload: { guess: 'arise', trits } })
    const s2 = reducer(s, { type: 'editTrit', payload: { row: 0, col: 2, value: 2 } })
    expect(s2.history[0]!.trits[2]).toBe(2)
    // others unchanged
    const rest = s2.history[0]!.trits.filter((_, i) => i !== 2)
    expect(rest.every((t) => t === 0)).toBe(true)
    // immutability: original state's history should remain unchanged
    expect(s.history[0]!.trits[2]).toBe(0)
  })

  it('undo removes last guess', () => {
    let s = mk(5)
    const trits: Trit[] = [0, 0, 0, 0, 0]
    s = reducer(s, { type: 'addGuess', payload: { guess: 'apple', trits } })
    s = reducer(s, { type: 'addGuess', payload: { guess: 'bloom', trits } })
    expect(s.history).toHaveLength(2)
    const s2 = reducer(s, { type: 'undo' })
    expect(s2.history.map((h) => h.guess)).toEqual(['apple'])
  })

  it('clear wipes history and guessInput', () => {
    let s = mk(5)
    const trits: Trit[] = [0, 0, 0, 0, 0]
    s = reducer(s, { type: 'addGuess', payload: { guess: 'cigar', trits } })
    s = { ...s, guessInput: 'other' }
    const s2 = reducer(s, { type: 'clear' })
    expect(s2.history).toHaveLength(0)
    expect(s2.guessInput).toBe('')
  })
})
