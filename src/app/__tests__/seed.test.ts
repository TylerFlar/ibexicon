import { toSeedV1, fromSeed } from '@/app/seed'
import { describe, it, expect } from 'vitest'

describe('seed roundtrip', () => {
  it('encodes & decodes typical session', () => {
    const seed = {
      length: 5,
      attemptsMax: 6,
      history: [{ guess: 'crane', trits: [0, 1, 2, 0, 0] as any }],
    }
    const hash = toSeedV1(seed)
    const back = fromSeed(hash)!
    expect(back.length).toBe(5)
    expect(back.attemptsMax).toBe(6)
    expect(back.history[0]!.guess).toBe('crane')
    expect(back.history[0]!.trits.join('')).toBe('01200')
  })
  it('rejects malformed', () => {
    expect(fromSeed('#ibx:v1;5;6;bad')).toBeNull()
  })
})
