import { describe, it, expect, beforeEach } from 'vitest'
import { updatePolicy, loadState, resetState, rewardFromSizes } from '@/policy/bandit'
import { buildCandidates } from '@/app/logic/constraints'

// We simulate SuggestPanel bandit reward application logic without rendering React.
// Tiny vocab
const words = ['aaaa', 'aaab', 'aaba', 'abaa']

interface GuessEntry { guess: string; trits: (0|1|2)[] }

// Helper to generate fake history and compute alive counts
function aliveCount(history: GuessEntry[]) {
  const cs = buildCandidates(words, history as any)
  return cs.aliveCount()
}

describe('bandit integration (session-like history updates)', () => {
  const L = 4
  beforeEach(() => {
    resetState(L)
    // Clear localStorage manually to ensure isolation for test env
    if (typeof localStorage !== 'undefined') {
      localStorage.clear()
    }
  })

  it('updates bandit state across sequential guesses', () => {
    // Start with empty history
    const history: GuessEntry[] = []
    const before0 = aliveCount(history)
    expect(before0).toBe(words.length)

    // First guess eliminates something: fabricate pattern with one green to keep multiple candidates
    history.push({ guess: 'aaaa', trits: [2,0,0,0] })
    const before1 = words.length // size before applying first guess was full set
    const after1 = aliveCount(history)
    const { r01: r1 } = rewardFromSizes(before1, after1)
    updatePolicy(L, 'composite', r1)

    // Second guess
    history.push({ guess: 'aaab', trits: [2,2,0,0] })
    const before2 = aliveCount(history.slice(0, history.length - 1))
    const after2 = aliveCount(history)
    const { r01: r2 } = rewardFromSizes(before2, after2)
    updatePolicy(L, 'composite', r2)

    // Third guess (solve)
    history.push({ guess: 'aaba', trits: [2,2,2,2] })
    const before3 = aliveCount(history.slice(0, history.length - 1))
    const after3 = 1 // solved
    const { r01: r3 } = rewardFromSizes(before3, after3)
    updatePolicy(L, 'composite', r3)

    const st = loadState(L)
    const arm = st.arms['composite']
    expect(arm.a).toBeGreaterThan(1)
    expect(arm.updates).toBe(3)
  })
})
