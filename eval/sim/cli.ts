#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-console */
/**
 * Ibexicon Simulator CLI
 * Orchestrates evaluation across (length × policy) shards using worker threads.
 */

import { Command } from 'commander'
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { execSync } from 'node:child_process'

type Policy = 'composite' | 'pure-eig' | 'pure-solve' | 'unique-letters'

interface ManifestSet {
  id: string
  length: number
  category: string
  displayName?: string
  wordsFile: string
  priorsFile: string
  size?: number
}

interface Job {
  datasetId: string
  length: number
  policy: Policy
  trials: number
  attempts: number
  seed: number
  wordsFile: string
  priorsFile: string
}

interface ShardResult {
  datasetId: string
  length: number
  policy: Policy
  trials: number
  successes: number
  failCount: number
  attemptHist: number[]
  totalAttemptsSuccess: number
  totalTimeMs: number
  totalTimeSuccessMs: number
  remainingOnFailAccum: number
}

interface RowSummary {
  datasetId: string
  policy: Policy
  length: number
  trials: number
  solved: number
  failRate: number
  avgAttempts: number
  avgTimeMs: number
  avgFinalS_whenFailed: number
}

function parseCsvNums(csv: string): number[] {
  if (csv.includes('-') && !csv.includes(',')) {
    const [a, b] = csv.split('-').map((n) => Number(n.trim()))
    const out: number[] = []
    for (let x = a; x <= b; x++) out.push(x)
    return out
  }
  return csv
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
}

function parsePolicies(csv: string): Policy[] {
  return csv
    .split(',')
    .map((s) => s.trim() as Policy)
    .filter(Boolean)
}

function gitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return null
  }
}

async function runJobs(jobs: Job[], concurrency: number): Promise<ShardResult[]> {
  const results: ShardResult[] = []
  let active = 0
  let idx = 0
  let completed = 0

  return await new Promise<ShardResult[]>((resolve, reject) => {
    const next = () => {
      if (completed === jobs.length) return resolve(results)
      while (active < concurrency && idx < jobs.length) {
        const job = jobs[idx++]!
        active++
        const startTs = Date.now()
        process.stdout.write(
          `Start ${job.policy}@${job.datasetId} (L${job.length}, seed=${job.seed})\n`,
        )
        // Determine how to preload tsx depending on Node version.
        // CI failure (Node 24.6) showed: "tsx must be loaded with --import instead of --loader".
        // The --loader flag was deprecated in Node v20.6.0 and v18.19.0. Newer tsx versions now
        // require --import where available. We choose --import if the running Node version
        // is >= 20.6 or >= 18.19 (mirroring deprecation) and fall back to --loader for older
        // environments (e.g., local older LTS) where --import might not exist.
        const [vMaj, vMin] = process.versions.node.split('.').map((n) => Number(n))
        const useImport =
          vMaj > 20 ||
          (vMaj === 20 && vMin >= 6) ||
          vMaj === 19 || // 19.x (non-LTS) had the newer loader behavior
          (vMaj === 18 && vMin >= 19)
        const tsxPreload = useImport ? ['--import', 'tsx'] : ['--loader', 'tsx']
        const worker = new Worker(new URL('./worker.ts', import.meta.url), {
          // Preload tsx so subsequent TypeScript imports (worker.ts and its deps) work.
          execArgv: tsxPreload,
          workerData: job,
        })
        worker.once('message', (msg: any) => {
          active--
          msg && msg.shardResult ? results.push(msg.shardResult as ShardResult) : null
          if (msg && msg.error) {
            console.error(`Shard error for ${job.policy}@${job.datasetId}: ${msg.error}`)
            return reject(new Error(msg.error))
          }
          completed++
          const elapsed = Date.now() - startTs
          process.stdout.write(`Done  ${job.policy}@${job.datasetId} in ${elapsed}ms\n`)
          next()
        })
        worker.once('error', (err) => {
          active--
          console.error(`Worker crash for ${job.policy}@${job.datasetId}:`, err)
          reject(err)
        })
      }
    }
    next()
  })
}

function aggregate(shards: ShardResult[]): RowSummary[] {
  const rows: RowSummary[] = []
  for (const s of shards) {
    const solved = s.successes
    const failRate = s.trials > 0 ? s.failCount / s.trials : 0
    const avgAttempts = solved > 0 ? s.totalAttemptsSuccess / solved : 0
    // Average time per game (success + fail)
    const avgTimeMs = s.trials > 0 ? s.totalTimeMs / s.trials : 0
    const avgFinalS_whenFailed = s.failCount > 0 ? s.remainingOnFailAccum / s.failCount : 0
    rows.push({
      datasetId: s.datasetId,
      policy: s.policy,
      length: s.length,
      trials: s.trials,
      solved,
      failRate,
      avgAttempts,
      avgTimeMs,
      avgFinalS_whenFailed,
    })
  }
  // Deterministic sort
  rows.sort((a, b) => a.policy.localeCompare(b.policy) || a.datasetId.localeCompare(b.datasetId))
  return rows
}

function formatCsv(rows: RowSummary[]): string {
  const header =
    'datasetId,policy,length,trials,solved,failRate,avgAttempts,avgTimeMs,avgFinalS_whenFailed'
  const lines = rows.map((r) =>
    [
      r.datasetId,
      r.policy,
      r.length,
      r.trials,
      r.solved,
      r.failRate.toFixed(6),
      r.avgAttempts.toFixed(4),
      r.avgTimeMs.toFixed(2),
      r.avgFinalS_whenFailed.toFixed(2),
    ].join(','),
  )
  return [header, ...lines].join('\n') + '\n'
}

function printTable(rows: RowSummary[]): void {
  const cols = [
    'DATASET',
    'POLICY',
    'L',
    'TRIALS',
    'SOLVED',
    'FAIL%',
    'AVG_ATT',
    'AVG_MS',
    'AVG_REM_FAIL',
  ]
  const pad = (s: string, w: number) => s.padEnd(w)
  const widths = [12, 10, 3, 8, 8, 8, 9, 8, 14]
  const out: string[] = []
  out.push(cols.map((c, i) => pad(c, widths[i]!)).join(' '))
  for (const r of rows) {
    out.push(
      [
        pad(r.datasetId, widths[0]!),
        pad(r.policy, widths[1]!),
        pad(String(r.length), widths[2]!),
        pad(String(r.trials), widths[3]!),
        pad(String(r.solved), widths[4]!),
        pad((r.failRate * 100).toFixed(2), widths[5]!),
        pad(r.avgAttempts.toFixed(2), widths[6]!),
        pad(r.avgTimeMs.toFixed(1), widths[7]!),
        pad(r.avgFinalS_whenFailed.toFixed(1), widths[8]!),
      ].join(' '),
    )
  }
  console.log('\n' + out.join('\n') + '\n')
}

async function main() {
  const program = new Command()
  program
    .option('--lengths <csv>', 'Comma CSV or range (a-b) of word lengths', '4,5,6,7,8')
    .option('--ids <csv>', 'Explicit dataset ids (overrides --lengths)')
    .option('--trials <n>', 'Trials per (length,policy)', (v) => Number(v), 1000)
    .option('--attempts <n>', 'Max attempts per game', (v) => Number(v), 6)
    .option('--policies <csv>', 'Policies CSV', 'composite,pure-eig,pure-solve,unique-letters')
    .option(
      '--concurrency <n>',
      'Max parallel workers',
      (v) => Number(v),
      Math.min(8, os.cpus().length),
    )
    .option('--seed <n>', 'Base RNG seed (default: timestamp)', (v) => Number(v))
  program.parse(process.argv)
  const opts = program.opts<{
    lengths: string
    ids?: string
    trials: number
    attempts: number
    policies: string
    concurrency: number
    seed?: number
  }>()
  // Load manifest sets
  const manifestPath = path.resolve('public', 'wordlists', 'en', 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('Manifest not found at', manifestPath)
    process.exit(1)
  }
  const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { sets?: ManifestSet[] }
  const sets: ManifestSet[] = Array.isArray(manifestRaw.sets) ? manifestRaw.sets : []

  let selectedSets: ManifestSet[] = []
  if (opts.ids) {
    const want = opts.ids
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    selectedSets = sets.filter((s) => want.includes(s.id))
    const missing = want.filter((w) => !selectedSets.some((s) => s.id === w))
    if (missing.length) console.warn('[warn] missing dataset ids:', missing.join(','))
  } else {
    const lengths = parseCsvNums(opts.lengths)
    selectedSets = lengths
      .map((L) => sets.find((s) => s.id === `en-${L}`))
      .filter((s): s is ManifestSet => !!s)
    if (!selectedSets.length) {
      console.error('No matching datasets for lengths', opts.lengths)
      process.exit(1)
    }
  }

  const policies = parsePolicies(opts.policies)
  if (policies.length === 0) {
    console.error('No policies specified')
    process.exit(1)
  }
  const concurrency = Math.max(1, opts.concurrency || 1)
  const baseSeed = opts.seed ?? Date.now()
  const jobs: Job[] = []
  let shardIndex = 0
  for (const set of selectedSets) {
    for (const policy of policies) {
      const shardSeed = (baseSeed + shardIndex * 1000003) >>> 0
      jobs.push({
        datasetId: set.id,
        length: set.length,
        policy,
        trials: opts.trials,
        attempts: opts.attempts,
        seed: shardSeed,
        wordsFile: set.wordsFile,
        priorsFile: set.priorsFile,
      })
      shardIndex++
    }
  }

  console.log(
    `Running ${jobs.length} shard(s) across datasets=[${selectedSets.map((s) => s.id).join(',')}] concurrency=${concurrency}`,
  )
  const shardResults = await runJobs(jobs, concurrency)
  const rows = aggregate(shardResults)
  const csv = formatCsv(rows)
  const now = new Date()
  const tsBase = now.toISOString().replace(/[-:]/g, '').replace(/\..+/, '') // YYYYMMDDTHHMMSS
  const ts = tsBase.replace('T', '-')
  const sha = gitSha() || 'nogit'
  const outDir = path.resolve('eval', 'results')
  fs.mkdirSync(outDir, { recursive: true })
  const baseName = `run-${ts}-${sha}`
  const csvPath = path.join(outDir, `${baseName}.csv`)
  const jsonPath = path.join(outDir, `${baseName}.json`)
  fs.writeFileSync(csvPath, csv, 'utf8')
  const summary = {
    meta: {
      timestamp: now.toISOString(),
      gitSha: sha,
      datasets: selectedSets.map((s) => ({ id: s.id, length: s.length, category: s.category })),
      policies,
      trialsPerShard: opts.trials,
      attempts: opts.attempts,
      concurrency,
      baseSeed,
    },
    rows,
  }
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2) + '\n', 'utf8')
  // latest copies
  fs.copyFileSync(csvPath, path.join(outDir, 'latest.csv'))
  fs.copyFileSync(jsonPath, path.join(outDir, 'latest.json'))

  printTable(rows)
  console.log('Results written to:')
  console.log('  ' + csvPath)
  console.log('  ' + jsonPath)
}

main().catch((err) => {
  console.error('[fatal]', err)
  process.exit(1)
})
