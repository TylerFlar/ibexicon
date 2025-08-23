import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPatternProvider } from '../ptabCache'
import { pickSeeds, buildPatterns, hashWords } from '../../../eval/ptab/core'
import * as feedbackMod from '@/solver/feedback'
import { feedbackPattern } from '@/solver/feedback'

// Helper to build an in-memory binary and expose via mock fetch
function buildBinaryAsset(words: string[], seedCount: number) {
  const L = words[0]!.length
  const priors: Record<string, number> = Object.fromEntries(words.map((w) => [w, 1 / words.length]))
  const hash32 = hashWords(words)
  const seeds = pickSeeds(words, priors, L, seedCount)
  const { patterns, M } = buildPatterns(L, words, seeds)
  // Reconstruct binary in-memory (mirror writeBinary but in buffer we hold)
  const HEADER_SIZE = 4 + 2 + 1 + 1 + 4 + 4 + 4
  const size = HEADER_SIZE + M * 4 + patterns.byteLength
  const buf = Buffer.allocUnsafe(size)
  let off = 0
  const MAGIC = 0x49585054
  buf.writeUInt32LE(MAGIC, off); off += 4
  buf.writeUInt16LE(1, off); off += 2
  buf.writeUInt8(L, off); off += 1
  buf.writeUInt8(0, off); off += 1
  buf.writeUInt32LE(words.length >>> 0, off); off += 4
  buf.writeUInt32LE(hash32 >>> 0, off); off += 4
  buf.writeUInt32LE(M >>> 0, off); off += 4
  for (let i = 0; i < M; i++) { buf.writeUInt32LE(seeds[i]!.index >>> 0, off); off += 4 }
  Buffer.from(patterns.buffer, patterns.byteOffset, patterns.byteLength).copy(buf, off)
  return { buffer: buf, hash32, seeds }
}

describe('pattern provider', () => {
  const words = ['aaa', 'aab', 'aba', 'baa', 'bbb', 'abc', 'cab', 'bca']
  const L = 3
  let provider: ReturnType<typeof createPatternProvider>
  let feedbackSpy: any

  beforeEach(() => {
    provider = createPatternProvider({ memoryBudgetMB: 4 })
    feedbackSpy = vi.spyOn(feedbackMod, 'feedbackPattern')
    // Minimal indexedDB mock (in-memory map) for fallback path; provider test mainly needs get/put.
    const store = new Map<string, ArrayBuffer>()
    ;(globalThis as any).indexedDB = {
      open() {
        const req: any = {}
        setTimeout(() => {
          req.result = {
            objectStoreNames: { contains: () => true },
            transaction(_store: string) {
              return {
                objectStore() {
                  return {
                    get(key: string) {
                      const r: any = {}
                      setTimeout(() => { r.result = store.get(key) || undefined; r.onsuccess && r.onsuccess(new Event('success')) }, 0)
                      return r
                    },
                    put(val: ArrayBuffer, key: string) {
                      const r: any = {}
                      setTimeout(() => { store.set(key, val); r.onsuccess && r.onsuccess(new Event('success')) }, 0)
                      return r
                    },
                    clear() { const r: any = {}; setTimeout(() => { store.clear(); r.onsuccess && r.onsuccess(new Event('success')) }, 0); return r },
                    openCursor() { const r: any = {}; setTimeout(() => { r.result = null; r.onsuccess && r.onsuccess(new Event('success')) }, 0); return r },
                  }
                },
              }
            },
          }
          req.onsuccess && req.onsuccess(new Event('success'))
        }, 0)
        return req
      },
    }
    const asset = buildBinaryAsset(words, 3)
  global.fetch = vi.fn(async (url: any) => {
      const u = String(url)
      if (u.endsWith(`ibxptab-${L}.bin`)) {
        return new Response(asset.buffer, { status: 200 })
      }
      if (u.endsWith(`en-${L}.txt`)) {
        return new Response(words.join('\n'), { status: 200 })
      }
      return new Response('not found', { status: 404 })
    }) as any
  })

  it('returns precomputed plane for seed and caches fallback row for non-seed', async () => {
    // Seed guess (should not invoke feedbackPattern during retrieval)
    const seedGuess = words[0]!
    const arr1 = await provider.getPatterns(L, words, seedGuess)
    expect(arr1.length).toBe(words.length)
    const seedCalls = feedbackSpy.mock.calls.length
    // Spot-check pattern correctness for a secret
    const pat = feedbackPattern(seedGuess, words[1]!)
    const code = typeof pat === 'number' ? pat : Number(pat)
    expect(arr1[1]).toBe(code)

    // Non-seed guess triggers compute
    const nonSeed = words[words.length - 1]!
    const arr2 = await provider.getPatterns(L, words, nonSeed)
    const afterComputeCalls = feedbackSpy.mock.calls.length
  // Allow either words.length or words.length + a small constant (environment differences)
  expect(afterComputeCalls - seedCalls).toBeGreaterThanOrEqual(words.length)
  expect(afterComputeCalls - seedCalls).toBeLessThanOrEqual(words.length + 1)
    // Second call should hit cache / IDB (no new feedback calls)
    const arr3 = await provider.getPatterns(L, words, nonSeed)
    const afterSecond = feedbackSpy.mock.calls.length
    expect(afterSecond).toBe(afterComputeCalls)
    // Buffers should have same content
    for (let i = 0; i < words.length; i++) expect(arr2[i]).toBe(arr3[i])
  })
})
