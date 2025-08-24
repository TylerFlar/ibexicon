// Core reusable builder utilities (extracted from build.ts) for tests & CLI.
import { feedbackPattern } from '../../src/solver/feedback.ts'
import { fnv1a32 } from './fnv1a.js'
import * as fs from 'node:fs'

export interface SeedInfo {
  word: string
  index: number
  seedScore: number
}

export function pickSeeds(
  words: string[],
  priors: Record<string, number>,
  L: number,
  M: number,
): SeedInfo[] {
  const N = words.length
  const withPrior: { word: string; prior: number }[] = words.map((w) => ({
    word: w,
    prior: priors[w] ?? 0,
  }))
  withPrior.sort((a, b) => (b.prior !== a.prior ? b.prior - a.prior : a.word.localeCompare(b.word)))
  const rankMap = new Map<string, number>()
  for (let i = 0; i < withPrior.length; i++) rankMap.set(withPrior[i]!.word, i)
  const denom = N > 1 ? N - 1 : 1
  const seeds: SeedInfo[] = words.map((w, idx) => {
    const r = rankMap.get(w) ?? N - 1
    const priorRankScore = (N - 1 - r) / denom
    const distinct = new Set(w.split('')).size
    const uniqueLettersScore = distinct / L
    const seedScore = 0.7 * priorRankScore + 0.3 * uniqueLettersScore
    return { word: w, index: idx, seedScore }
  })
  seeds.sort((a, b) =>
    b.seedScore !== a.seedScore ? b.seedScore - a.seedScore : a.word.localeCompare(b.word),
  )
  return seeds.slice(0, Math.min(M, seeds.length))
}

export function buildPatterns(
  L: number,
  words: string[],
  seeds: SeedInfo[],
): { patterns: Uint16Array; M: number } {
  const N = words.length
  const M = seeds.length
  const patArr = new Uint16Array(M * N)
  for (let m = 0; m < M; m++) {
    const seedWord = seeds[m]!.word
    const rowOffset = m * N
    for (let s = 0; s < N; s++) {
      const p = feedbackPattern(seedWord, words[s]!)
      const val = typeof p === 'number' ? p : Number(p)
      if (val > 0xffff) throw new Error(`Pattern overflow L=${L} value=${val}`)
      patArr[rowOffset + s] = val
    }
  }
  return { patterns: patArr, M }
}

export function writeBinary(
  outPath: string,
  L: number,
  N: number,
  M: number,
  hash32: number,
  seeds: SeedInfo[],
  patterns: Uint16Array,
) {
  const HEADER_SIZE = 4 + 2 + 1 + 1 + 4 + 4 + 4
  const size = HEADER_SIZE + M * 4 + patterns.byteLength
  const buf = Buffer.allocUnsafe(size)
  let off = 0
  const MAGIC = 0x49585054
  buf.writeUInt32LE(MAGIC, off)
  off += 4
  buf.writeUInt16LE(1, off)
  off += 2
  buf.writeUInt8(L, off)
  off += 1
  buf.writeUInt8(0, off)
  off += 1
  buf.writeUInt32LE(N >>> 0, off)
  off += 4
  buf.writeUInt32LE(hash32 >>> 0, off)
  off += 4
  buf.writeUInt32LE(M >>> 0, off)
  off += 4
  for (let i = 0; i < M; i++) {
    buf.writeUInt32LE(seeds[i]!.index >>> 0, off)
    off += 4
  }
  const patBytes = Buffer.from(patterns.buffer, patterns.byteOffset, patterns.byteLength)
  patBytes.copy(buf, off)
  fs.writeFileSync(outPath, buf)
  return size
}

export function hashWords(words: string[]): number {
  return fnv1a32(words.join('\n'))
}
