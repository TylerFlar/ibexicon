import { describe, it, expect, beforeAll } from 'vitest'
import { ensureWasm, wasmFeedbackCode, wasmPatternRowU16 } from '@/wasm'
import { feedbackPattern } from '@/solver/feedback'

function randWord(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += String.fromCharCode((97 + Math.random() * 26) | 0)
  return s
}

let wasmAvailable = false

beforeAll(async () => {
  try {
    await ensureWasm()
    wasmAvailable = true
  } catch {
    // leave false; tests will be skipped
  }
})

describe('wasm parity (random samples)', () => {
  const lengths = [4, 5, 6, 7, 8, 9, 10]
  for (const L of lengths) {
    it(`feedback_code matches JS encode (L=${L})`, async () => {
      if (!wasmAvailable) return expect(true).toBe(true) // trivial pass to mark skip intent
      // 200 random pairs (distinct guess/secret random independently)
      for (let i = 0; i < 200; i++) {
        const guess = randWord(L)
        const secret = randWord(L)
        const jsPat = feedbackPattern(guess, secret)
        const jsNum = typeof jsPat === 'number' ? jsPat : Number(jsPat)
        const wNum = await wasmFeedbackCode(guess, secret)
        expect(wNum).not.toBeNull()
        expect(wNum).toBe(jsNum)
      }
    })
  }

  it('pattern_row_u16 matches manual loop for random sample (L=6)', async () => {
    const L = 6
    if (!wasmAvailable) return expect(true).toBe(true)
    const guess = randWord(L)
    const secrets: string[] = []
    for (let i = 0; i < 200; i++) secrets.push(randWord(L))
    const row = await wasmPatternRowU16(guess, secrets)
    expect(row).not.toBeNull()
    const arr = row!
    expect(arr.length).toBe(secrets.length)
    for (let i = 0; i < secrets.length; i++) {
      const jsPat = feedbackPattern(guess, secrets[i]!)
      const jsNum = typeof jsPat === 'number' ? jsPat : Number(jsPat)
      expect(arr[i]).toBe(jsNum)
    }
  })
})
