#!/usr/bin/env tsx
/**
 * Precompute seed guess pattern tables and emit compact binary assets:
 *   public/wordlists/en/ibxptab-<L>.bin
 *
 * Binary layout (little-endian):
 *   u32 magic   = 0x49585054  // 'IXPT'
 *   u16 version = 1
 *   u8  L
 *   u8  reserved = 0
 *   u32 N          // number of secrets (size of word list)
 *   u32 hash32     // FNV-1a of canonical word list content (joined by '\n')
 *   u32 M          // number of seed guesses actually stored (≤ requested --seeds)
 *   u32 seedIndex[M]  // indices into [0..N-1] corresponding to the selected seeds
 *   u16 patterns[M][N] // row-major; for seed m then for each secret s the feedback pattern code
 *
 * Pattern codes are packed numeric base-3 values (little-endian trits) produced by feedbackPattern.
 * For L ≤ 10 these fit into a uint16 (3^10 - 1 = 59048 < 65535).
 *
 * Seed selection heuristic (documented):
 *   1. Prior ranking: sort all words by descending prior probability (tie -> lexicographic).
 *      Give each word a rank r in [0, N-1] (best prior => 0).
 *      priorRankScore = (N - 1 - r) / (N - 1)  (maps best to 1, worst to 0; if N=1 => 1)
 *   2. uniqueLettersScore = (# distinct letters in word) / L (∈ (0,1]).
 *   3. seedScore = 0.7 * priorRankScore + 0.3 * uniqueLettersScore.
 *   4. Order by (seedScore desc, word lex asc) and keep top M (flag --seeds).
 *
 * CLI flags:
 *   --lengths <csv>    (optional: explicit lengths; default discover) 
 *   --maxWords <n>     (default 20000) Skip any length where N > maxWords.
 *   --maxLen <L>       (default 10)    Skip lengths > maxLen.
 *   --seeds <M>        (default 1500)  Target number of seed guesses.
 *   --sizes <csv>      (ignored placeholder for future multi-table variants)
 *
 * Length discovery precedence:
 *   a) If manifest.json exists -> use manifest.lengths
 *   b) Else glob scan public/wordlists/en/en-*.txt
 */

import { Command } from 'commander'
import { fnv1a32 } from './fnv1a.js'
import { feedbackPattern } from '../../src/solver/feedback.ts'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

interface Options {
  lengths?: string
  maxWords: number
  maxLen: number
  seeds: number
  sizes?: string
}

const program = new Command()
program
  .option('--lengths <csv>', 'word lengths to build (comma-separated)')
  .option('--maxWords <n>', 'skip lengths where N > maxWords', (v) => parseInt(v, 10), 20000)
  .option('--maxLen <L>', 'only build for lengths ≤ maxLen', (v) => parseInt(v, 10), 10)
  .option('--seeds <M>', 'number of seed guesses to retain', (v) => parseInt(v, 10), 1500)
  .option('--sizes <csv>', 'placeholder (ignored) future size tiers')
  .parse(process.argv)

const opts = program.opts<Options>()

// ESM-safe __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(path.join(__dirname, '..', '..'))
const WORD_DIR = path.join(ROOT, 'public', 'wordlists', 'en')

function exists(p: string) {
  try {
    fs.accessSync(p, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

function discoverLengths(): number[] {
  const manifestPath = path.join(WORD_DIR, 'manifest.json')
  if (exists(manifestPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
      if (Array.isArray(manifest.lengths)) {
        return manifest.lengths.map((x: any) => Number(x)).filter((x: any) => Number.isFinite(x))
      }
    } catch (e) {
      console.warn('[warn] Failed to parse manifest.json, falling back to scan:', e)
    }
  }
  const lengths = new Set<number>()
  for (const fname of fs.readdirSync(WORD_DIR)) {
    const m = /^en-(\d+)\.txt$/.exec(fname)
    if (m) lengths.add(Number(m[1]))
  }
  return [...lengths].sort((a, b) => a - b)
}

function fmtBytes(n: number): string {
  if (n < 1024) return n + ' B'
  const units = ['KB', 'MB', 'GB']
  let u = -1
  let v = n
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return v.toFixed(2) + ' ' + units[u]
}

interface SeedInfo { word: string; index: number; seedScore: number }

function loadWordList(L: number): { words: string[]; priors: Record<string, number>; hash32: number } {
  const txtPath = path.join(WORD_DIR, `en-${L}.txt`)
  const priorsPath = path.join(WORD_DIR, `en-${L}-priors.json`)
  if (!exists(txtPath)) throw new Error(`Missing ${txtPath}`)
  if (!exists(priorsPath)) throw new Error(`Missing ${priorsPath}`)
  const raw = fs.readFileSync(txtPath, 'utf8')
  const words = raw
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
  const canonical = words.join('\n')
  const hash32 = fnv1a32(canonical)
  const priors = JSON.parse(fs.readFileSync(priorsPath, 'utf8')) as Record<string, number>
  return { words, priors, hash32 }
}

function pickSeeds(words: string[], priors: Record<string, number>, L: number, M: number): SeedInfo[] {
  const N = words.length
  // 1. Build prior-sorted list to derive ranks.
  const withPrior: { word: string; prior: number }[] = words.map((w) => ({ word: w, prior: priors[w] ?? 0 }))
  withPrior.sort((a, b) => {
    if (b.prior !== a.prior) return b.prior - a.prior
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
  })
  const rankMap = new Map<string, number>()
  for (let i = 0; i < withPrior.length; i++) rankMap.set(withPrior[i]!.word, i)
  const denom = N > 1 ? N - 1 : 1
  const seeds: SeedInfo[] = words.map((w, idx) => {
    const r = rankMap.get(w) ?? N - 1
    const priorRankScore = (N - 1 - r) / denom // best => 1, worst => 0
    let distinct = 0
    const seen = new Set<string>()
    for (let i = 0; i < L; i++) seen.add(w[i]!)
    distinct = seen.size
    const uniqueLettersScore = distinct / L
    const seedScore = 0.7 * priorRankScore + 0.3 * uniqueLettersScore
    return { word: w, index: idx, seedScore }
  })
  seeds.sort((a, b) => {
    if (b.seedScore !== a.seedScore) return b.seedScore - a.seedScore
    return a.word < b.word ? -1 : a.word > b.word ? 1 : 0
  })
  return seeds.slice(0, Math.min(M, seeds.length))
}

function buildPatterns(
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
      // Numeric path guaranteed for L ≤ 10; still coerce to number.
      const val = typeof p === 'number' ? p : Number(p)
      if (val > 0xffff) throw new Error(`Pattern overflow L=${L} value=${val}`)
      patArr[rowOffset + s] = val
    }
  }
  return { patterns: patArr, M }
}

function writeBinary(
  outPath: string,
  L: number,
  N: number,
  M: number,
  hash32: number,
  seeds: SeedInfo[],
  patterns: Uint16Array,
) {
  const HEADER_SIZE = 4 + 2 + 1 + 1 + 4 + 4 + 4 // 20 bytes
  const size = HEADER_SIZE + M * 4 + patterns.byteLength
  const buf = Buffer.allocUnsafe(size)
  let off = 0
  const MAGIC = 0x49585054 // 'IXPT'
  buf.writeUInt32LE(MAGIC, off)
  off += 4
  buf.writeUInt16LE(1, off) // version
  off += 2
  buf.writeUInt8(L, off)
  off += 1
  buf.writeUInt8(0, off) // reserved
  off += 1
  buf.writeUInt32LE(N >>> 0, off)
  off += 4
  buf.writeUInt32LE(hash32 >>> 0, off)
  off += 4
  buf.writeUInt32LE(M >>> 0, off)
  off += 4
  // seed indices
  for (let i = 0; i < M; i++) {
    buf.writeUInt32LE(seeds[i]!.index >>> 0, off)
    off += 4
  }
  // patterns (Uint16 LE already, but ensure copy)
  const patBytes = Buffer.from(patterns.buffer, patterns.byteOffset, patterns.byteLength)
  patBytes.copy(buf, off)
  fs.writeFileSync(outPath, buf)
  return size
}

async function main() {
  const lengths = opts.lengths
    ? opts.lengths.split(',').map((x) => parseInt(x.trim(), 10)).filter((x) => Number.isFinite(x))
    : discoverLengths()
  if (!lengths.length) {
    console.error('No lengths discovered. Ensure wordlists exist.')
    process.exit(1)
  }
  console.log('[ptab] lengths target =', lengths.join(','))
  for (const L of lengths) {
    if (L > opts.maxLen) {
      console.log(`[skip] L=${L} > maxLen=${opts.maxLen}`)
      continue
    }
    let words: string[]
    let priors: Record<string, number>
    let hash32: number
    try {
      const wl = loadWordList(L)
      words = wl.words
      priors = wl.priors
      hash32 = wl.hash32
    } catch (e) {
      console.warn(`[skip] L=${L} load failed:`, e)
      continue
    }
    const N = words.length
    if (N === 0) {
      console.log(`[skip] L=${L} empty word list`)
      continue
    }
    if (N > opts.maxWords) {
      console.log(`[skip] L=${L} N=${N} > maxWords=${opts.maxWords}`)
      continue
    }
    if (L > 10) {
      console.log(`[skip] L=${L} pattern > 10 not supported for precompute (fits u16 constraint)`) // explicit guard
      continue
    }
    const t0 = performance.now()
    console.log(`[build] L=${L} N=${N} selecting seeds (M target ${opts.seeds}) ...`)
    const seeds = pickSeeds(words, priors, L, opts.seeds)
    console.log(`[build] L=${L} seeds chosen M=${seeds.length}; computing pattern matrix (${seeds.length} × ${N}) ...`)
    const { patterns, M } = buildPatterns(L, words, seeds)
    const outPath = path.join(WORD_DIR, `ibxptab-${L}.bin`)
    const bytes = writeBinary(outPath, L, N, M, hash32, seeds, patterns)
    const dt = performance.now() - t0
    console.log(
      `[done] L=${L} N=${N} M=${M} size=${fmtBytes(bytes)} time=${dt.toFixed(1)}ms hash=0x${hash32
        .toString(16)
        .padStart(8, '0')}`,
    )
  }
  console.log('[ptab] complete')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
