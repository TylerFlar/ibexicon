#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * add-dataset.ts (moved to scripts/)
 * Unified automation script:
 *   1. Ingest a word list file (plain text, one word per line).
 *   2. Fetch Datamuse frequency metadata for each word (cached, resumable).
 *   3. Convert counts -> smoothed priors JSON (normalized probabilities).
 *   4. Append / update entry in manifest.json (public/wordlists/en/manifest.json).
 *   5. Invoke pattern table build for just this dataset id (ptab-<id>.bin).
 *
 * Usage example:
 *   tsx scripts/add-dataset.ts \
 *     --id=nyt-5 \
 *     --words=public/wordlists/en/nyt-wordle-5.txt \
 *     --category="NYT" \
 *     --displayName="NYT Wordle 5" \
 *     [--priorsOut=public/wordlists/en/nyt-wordle-5-priors.json] \
 *     [--concurrency=8] [--delay=80] [--addK=0.5] [--fallbackScale=0.1] \
 *     [--seeds=1500] [--skipPtab]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

interface Args {
  [k: string]: string | boolean | undefined
}
function parseArgs(): Args {
  const out: Args = {}
  for (const raw of process.argv.slice(2)) {
    const m = /^--([^=]+)(=(.*))?$/.exec(raw)
    if (m) out[m[1]] = m[3] === undefined ? true : m[3]
  }
  return out
}

const args = parseArgs()
function req(name: string): string {
  const v = args[name]
  if (!v || typeof v !== 'string') throw new Error(`Missing --${name}`)
  return v
}

const id = req('id')
const wordsFile = req('words')
const category = req('category')
const displayName =
  args['displayName'] && typeof args['displayName'] === 'string' ? args['displayName'] : id
const priorsOut =
  (args['priorsOut'] as string) ||
  path.join(
    path.dirname(wordsFile),
    `${path.basename(wordsFile, path.extname(wordsFile))}-priors.json`,
  )
const concurrency = parseInt(String(args['concurrency'] || 8), 10)
const delayMs = parseInt(String(args['delay'] || 80), 10)
const addK = parseFloat(String(args['addK'] || 0.5))
const fallbackScale = parseFloat(String(args['fallbackScale'] || 0.1))
const seeds = parseInt(String(args['seeds'] || 1500), 10)
const skipPtab = !!args['skipPtab']
const forcePriors = !!args['forcePriors']

// Adjusted ROOT because file moved up one directory (scripts/ instead of scripts/data/)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(path.join(__dirname, '..'))
const WORD_DIR = path.join(ROOT, 'public', 'wordlists', 'en')
const MANIFEST = path.join(WORD_DIR, 'manifest.json')

function readLines(p: string): string[] {
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
}

async function fetchDatamuse(word: string): Promise<number | null> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data: any = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    const tags: string[] = data[0].tags || []
    const tag = tags.find((t) => t.startsWith('f:'))
    if (!tag) return null
    const v = Number(tag.slice(2))
    return Number.isFinite(v) ? v : null
  } catch {
    return null
  }
}

async function buildPriors(words: string[]): Promise<Record<string, number>> {
  const cachePath = priorsOut + '.cache.json'
  let cache: Record<string, number | null> = {}
  if (fs.existsSync(cachePath)) {
    try {
      cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'))
    } catch {
      /* ignore */
    }
  }
  const pending = words.filter((w) => cache[w] == null)
  console.log(`[freq] total=${words.length} need=${pending.length}`)
  let completed = 0
  async function worker() {
    while (pending.length) {
      const w = pending.shift()!
      const c = await fetchDatamuse(w)
      cache[w] = c
      completed++
      if (completed % 250 === 0) {
        fs.writeFileSync(cachePath, JSON.stringify(cache))
        console.log(`[freq] fetched ${completed}/${words.length}`)
      }
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  fs.writeFileSync(cachePath, JSON.stringify(cache))
  const counts: number[] = []
  for (const w of words) {
    const c = cache[w]
    if (c != null) counts.push(c)
  }
  if (!counts.length) throw new Error('No frequencies retrieved')
  counts.sort((a, b) => a - b)
  const min = counts[0]
  const fallback = (min || 1) * fallbackScale
  let total = 0
  const priors: Record<string, number> = {}
  for (const w of words) {
    const raw = cache[w]
    const base = raw == null ? fallback : raw
    const mass = base + addK
    priors[w] = mass
    total += mass
  }
  for (const w of words) priors[w] = priors[w]! / total
  return priors
}

interface ManifestData {
  version: number
  sets: Array<{
    id: string
    length: number
    category: string
    displayName?: string
    wordsFile: string
    priorsFile: string
    size?: number
  }>
}

function loadManifest(): ManifestData {
  if (!fs.existsSync(MANIFEST)) throw new Error('Manifest not found: ' + MANIFEST)
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
}

function saveManifest(m: ManifestData) {
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n')
}

async function ensurePriors(words: string[]): Promise<void> {
  if (fs.existsSync(priorsOut) && !forcePriors) {
    console.log('[priors] existing priors file present (use --forcePriors to overwrite)')
    return
  }
  const priors = await buildPriors(words)
  fs.writeFileSync(priorsOut, JSON.stringify(priors, null, 2) + '\n')
  console.log('[priors] wrote', priorsOut)
}

async function updateManifest(length: number, size: number) {
  const manifest = loadManifest()
  const existing = manifest.sets.find((s) => s.id === id)
  if (existing) {
    existing.length = length
    existing.category = category
    existing.displayName = displayName
    existing.wordsFile = path.relative(WORD_DIR, path.resolve(wordsFile)).replace(/\\/g, '/')
    existing.priorsFile = path.relative(WORD_DIR, path.resolve(priorsOut)).replace(/\\/g, '/')
    existing.size = size
    console.log('[manifest] updated existing entry', id)
  } else {
    manifest.sets.push({
      id,
      length,
      category,
      displayName,
      wordsFile: path.basename(wordsFile),
      priorsFile: path.basename(priorsOut),
      size,
    })
    console.log('[manifest] added new entry', id)
  }
  saveManifest(manifest)
}

async function buildPtab() {
  console.log('[ptab] invoking build for', id)
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      process.execPath,
      ['node_modules/tsx/dist/cli.js', 'eval/ptab/build.ts', '--ids', id, '--seeds', String(seeds)],
      { cwd: ROOT, stdio: 'inherit' },
    )
    proc.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error('ptab build failed'))
    })
  })
}

async function main() {
  const words = readLines(wordsFile)
  if (!words.length) throw new Error('Word list is empty')
  const lengthSet = new Set(words.map((w) => w.length))
  if (lengthSet.size !== 1)
    throw new Error('Word list must be uniform length; got multiple lengths')
  const length = [...lengthSet][0]
  console.log(`[init] id=${id} length=${length} words=${words.length}`)
  await ensurePriors(words)
  await updateManifest(length, words.length)
  if (!skipPtab) await buildPtab()
  console.log('[done] dataset provision complete')
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
