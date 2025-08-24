#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * Pattern Table Precomputation
 * ---------------------------
 * Generates compact binary pattern tables for any dataset declared in the
 * unified manifest (public/wordlists/en/manifest.json) whose length ≤ --maxLen
 * and whose vocabulary size ≤ --maxWords (unless overridden).
 *
 * Output naming (new):
 *   public/wordlists/en/ptab-<datasetId>.bin
 * Examples:
 *   ptab-en-5.bin      (core English length-5 list)
 *   ptab-nyt-5.bin     (NYT Wordle 5-letter list)
 *
 * Legacy compatibility: we no longer emit ibxptab-<L>.bin. If you wish to keep
 * them around for caching you can run a separate legacy build, but the runtime
 * loader now prefers the new naming convention.
 *
 * Binary layout (little-endian):
 *   u32 magic   = 0x49585054  // 'IXPT'
 *   u16 version = 1
 *   u8  L
 *   u8  reserved = 0
 *   u32 N          // number of secrets (size of word list)
 *   u32 hash32     // FNV-1a hash of canonical word list (joined by '\n')
 *   u32 M          // number of stored seed rows (≤ requested --seeds)
 *   u32 seedIndex[M]  // indices referencing the canonical ordering
 *   u16 patterns[M][N] // row-major feedback patterns for seed vs secret
 *
 * CLI flags:
 *   --ids <csv>        Only build for these dataset ids (default: all)
 *   --maxWords <n>     Skip any dataset with size > n (default 20000)
 *   --maxLen <L>       Skip any dataset with length > L (default 10)
 *   --seeds <M>        Target number of seed guesses to retain (default 1500)
 *   --ignoreCore       If set, skip core (en-*) ids
 *   --ignoreNonCore    If set, skip non-core ids
 *
 * Seed selection heuristic:
 *   0. Given word list W, priors P, length L.
 *   1. priorRankScore = normalized descending prior rank in [0,1].
 *   2. uniqueLettersScore = (#unique letters)/L.
 *   3. seedScore = 0.7*priorRankScore + 0.3*uniqueLettersScore.
 *   4. Take top M words by seedScore (tie break lexicographically) -> seeds.
 */

import { Command } from 'commander'
import { fnv1a32 } from './fnv1a.js'
// (feedbackPattern import removed; logic now in core utilities)
// Reuse core utilities for easier testing.
import { pickSeeds, buildPatterns, writeBinary } from './core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'

interface Options {
  ids?: string
  maxWords: number
  maxLen: number
  seeds: number
  ignoreCore?: boolean
  ignoreNonCore?: boolean
}

const program = new Command()
program
  .option('--ids <csv>', 'dataset ids to build (comma-separated)')
  .option('--maxWords <n>', 'skip datasets where size > n', (v) => parseInt(v, 10), 20000)
  .option('--maxLen <L>', 'only build for lengths ≤ L', (v) => parseInt(v, 10), 10)
  .option('--seeds <M>', 'seed rows to retain', (v) => parseInt(v, 10), 1500)
  .option('--ignoreCore', 'skip core en-* datasets')
  .option('--ignoreNonCore', 'skip non-core datasets')
  .parse(process.argv)

const opts = program.opts<Options>()

// ESM-safe __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(path.join(__dirname, '..', '..'))
const WORD_DIR = path.join(ROOT, 'public', 'wordlists', 'en')
const MANIFEST_PATH = path.join(WORD_DIR, 'manifest.json')

function exists(p: string) {
  try {
    fs.accessSync(p, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

interface ManifestSet {
  id: string
  length: number
  category: string
  displayName?: string
  wordsFile: string
  priorsFile: string
  size?: number
}

function loadManifestSets(): ManifestSet[] {
  if (!exists(MANIFEST_PATH)) throw new Error('Manifest not found at ' + MANIFEST_PATH)
  const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  if (!Array.isArray(raw.sets)) throw new Error('Manifest missing sets[]')
  return raw.sets as ManifestSet[]
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

function loadWordList(set: ManifestSet): {
  words: string[]
  priors: Record<string, number>
  hash32: number
} {
  const txtPath = path.join(WORD_DIR, set.wordsFile)
  const priorsPath = path.join(WORD_DIR, set.priorsFile)
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

// (pickSeeds, buildPatterns, writeBinary) now imported.

async function main() {
  const sets = loadManifestSets()
  const includeIds = opts.ids
    ? new Set(
        opts.ids
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null
  const buildTargets = sets.filter((s) => {
    if (includeIds && !includeIds.has(s.id)) return false
    if (opts.ignoreCore && s.id.startsWith('en-')) return false
    if (opts.ignoreNonCore && !s.id.startsWith('en-')) return false
    if (s.length > opts.maxLen) return false
    if ((s.size ?? Infinity) > opts.maxWords) return false
    return true
  })
  if (!buildTargets.length) {
    console.error('No dataset targets after filtering.')
    process.exit(1)
  }
  console.log('[ptab] datasets target =', buildTargets.map((s) => s.id).join(','))
  for (const set of buildTargets) {
    if (set.length > 10) {
      console.log(`[skip] ${set.id} L=${set.length} > 10 (u16 encoding limit)`) // safety
      continue
    }
    let words: string[]
    let priors: Record<string, number>
    let hash32: number
    try {
      const wl = loadWordList(set)
      words = wl.words
      priors = wl.priors
      hash32 = wl.hash32
    } catch (e) {
      console.warn(`[skip] ${set.id} load failed:`, e)
      continue
    }
    const N = words.length
    if (!N) {
      console.log(`[skip] ${set.id} empty list`)
      continue
    }
    const t0 = performance.now()
    console.log(
      `[build] ${set.id} L=${set.length} N=${N} selecting seeds (target ${opts.seeds}) ...`,
    )
    const seeds = pickSeeds(words, priors, set.length, opts.seeds)
    console.log(
      `[build] ${set.id} seeds chosen M=${seeds.length}; computing pattern matrix (${seeds.length} × ${N}) ...`,
    )
    const { patterns, M } = buildPatterns(set.length, words, seeds)
    const safeId = set.id.replace(/[^A-Za-z0-9_-]/g, '_')
    const outPath = path.join(WORD_DIR, `ptab-${safeId}.bin`)
    const bytes = writeBinary(outPath, set.length, N, M, hash32, seeds, patterns)
    const dt = performance.now() - t0
    console.log(
      `[done] ${set.id} N=${N} M=${M} size=${fmtBytes(bytes)} time=${dt.toFixed(1)}ms hash=0x${hash32.toString(16).padStart(8, '0')}`,
    )
  }
  console.log('[ptab] complete')
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
