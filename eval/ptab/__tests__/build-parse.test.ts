import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pickSeeds, buildPatterns, writeBinary, hashWords } from '../core'
import { parsePtabBinary } from '../../../src/ptab/parse'
import { feedbackPattern } from '../../../src/solver/feedback'

describe('ptab build + parse integration', () => {
  it('builds and parses a tiny L=3 asset correctly', () => {
    const words = ['aaa', 'aab', 'aba', 'baa', 'bbb', 'abc', 'cab', 'bca']
    const priors: Record<string, number> = Object.fromEntries(words.map((w) => [w, 1 / words.length]))
    const L = 3
    const hash32 = hashWords(words)
    const seeds = pickSeeds(words, priors, L, 4) // choose top 4
    const { patterns, M } = buildPatterns(L, words, seeds)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ibxptab-'))
    const outPath = path.join(tmpDir, 'ibxptab-3.bin')
    writeBinary(outPath, L, words.length, M, hash32, seeds, patterns)
    const buf = fs.readFileSync(outPath)
    const parsed = parsePtabBinary(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), words, L, hash32)
    expect(parsed).not.toBeNull()
    if (!parsed) return
    expect(parsed.meta.L).toBe(L)
    expect(parsed.meta.N).toBe(words.length)
    expect(parsed.meta.M).toBe(M)
    // Spot-check first seed row few columns
    const firstRowWord = seeds[0]!.word
    const rowIdx = 0
    const N = words.length
    for (let s = 0; s < Math.min(5, N); s++) {
      const pat = feedbackPattern(firstRowWord, words[s]!)
      const code = typeof pat === 'number' ? pat : Number(pat)
      expect(parsed.bigMatrix[rowIdx * N + s]).toBe(code)
    }
  })
})
