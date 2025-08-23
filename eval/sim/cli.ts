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

interface Job {
  length: number
  policy: Policy
  trials: number
  attempts: number
  seed: number
}

interface ShardResult {
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
    const [a, b] = csv.split('-').map(n => Number(n.trim()))
    const out: number[] = []
    for (let x = a; x <= b; x++) out.push(x)
    return out
  }
  return csv.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n))
}

function parsePolicies(csv: string): Policy[] {
  return csv.split(',').map(s => s.trim() as Policy).filter(Boolean)
}

function gitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore','pipe','ignore'] }).toString().trim()
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
        process.stdout.write(`Start ${job.policy}@L${job.length} (seed=${job.seed})\n`)
        // Determine how to preload tsx depending on Node version:
        // - Node >= 20 supports --import=specifier (preferred; keeps ESM semantics)
        // - Node 16/18 (LTS still present on some CI runners) lack stable --import, so we fall back to --loader.
  const tsxPreload = ['--loader', 'tsx']
  const worker = new Worker(new URL('./worker.ts', import.meta.url), {
          // Preload tsx so subsequent TypeScript imports (worker.ts and its deps) work.
          execArgv: tsxPreload,
          workerData: job,
        })
        worker.once('message', (msg: any) => {
          active--
            ;(msg && msg.shardResult ? results.push(msg.shardResult as ShardResult) : null)
          if (msg && msg.error) {
            console.error(`Shard error for ${job.policy}@L${job.length}: ${msg.error}`)
            return reject(new Error(msg.error))
          }
          completed++
          const elapsed = Date.now() - startTs
          process.stdout.write(`Done  ${job.policy}@L${job.length} in ${elapsed}ms\n`)
          next()
        })
        worker.once('error', (err) => {
          active--
          console.error(`Worker crash for ${job.policy}@L${job.length}:`, err)
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
  rows.sort((a, b) => a.policy.localeCompare(b.policy) || a.length - b.length)
  return rows
}

function formatCsv(rows: RowSummary[]): string {
  const header = 'policy,length,trials,solved,failRate,avgAttempts,avgTimeMs,avgFinalS_whenFailed'
  const lines = rows.map(r => [
    r.policy,
    r.length,
    r.trials,
    r.solved,
    r.failRate.toFixed(6),
    r.avgAttempts.toFixed(4),
    r.avgTimeMs.toFixed(2),
    r.avgFinalS_whenFailed.toFixed(2),
  ].join(','))
  return [header, ...lines].join('\n') + '\n'
}

function printTable(rows: RowSummary[]): void {
  const cols = ['POLICY', 'L', 'TRIALS', 'SOLVED', 'FAIL%', 'AVG_ATT', 'AVG_MS', 'AVG_REM_FAIL']
  const pad = (s: string, w: number) => s.padEnd(w)
  const widths = [10, 3, 8, 8, 8, 9, 8, 14]
  const out: string[] = []
  out.push(cols.map((c, i) => pad(c, widths[i]!)).join(' '))
  for (const r of rows) {
    out.push([
      pad(r.policy, widths[0]!),
      pad(String(r.length), widths[1]!),
      pad(String(r.trials), widths[2]!),
      pad(String(r.solved), widths[3]!),
      pad((r.failRate * 100).toFixed(2), widths[4]!),
      pad(r.avgAttempts.toFixed(2), widths[5]!),
      pad(r.avgTimeMs.toFixed(1), widths[6]!),
      pad(r.avgFinalS_whenFailed.toFixed(1), widths[7]!),
    ].join(' '))
  }
  console.log('\n' + out.join('\n') + '\n')
}

async function main() {
  const program = new Command()
  program
    .option('--lengths <csv>', 'Comma CSV or range (a-b) of word lengths', '4,5,6,7,8')
    .option('--trials <n>', 'Trials per (length,policy)', (v) => Number(v), 1000)
    .option('--attempts <n>', 'Max attempts per game', (v) => Number(v), 6)
    .option('--policies <csv>', 'Policies CSV', 'composite,pure-eig,pure-solve,unique-letters')
    .option('--concurrency <n>', 'Max parallel workers', (v) => Number(v), Math.min(8, os.cpus().length))
    .option('--seed <n>', 'Base RNG seed (default: timestamp)', (v) => Number(v))
  program.parse(process.argv)
  const opts = program.opts<{
    lengths: string
    trials: number
    attempts: number
    policies: string
    concurrency: number
    seed?: number
  }>()

  const lengths = parseCsvNums(opts.lengths)
  const policies = parsePolicies(opts.policies)
  if (policies.length === 0) {
    console.error('No policies specified')
    process.exit(1)
  }
  if (lengths.length === 0) {
    console.error('No lengths specified')
    process.exit(1)
  }
  const concurrency = Math.max(1, opts.concurrency || 1)
  const baseSeed = opts.seed ?? Date.now()
  const jobs: Job[] = []
  let shardIndex = 0
  for (const length of lengths) {
    for (const policy of policies) {
      const shardSeed = (baseSeed + shardIndex * 1000003) >>> 0
      jobs.push({ length, policy, trials: opts.trials, attempts: opts.attempts, seed: shardSeed })
      shardIndex++
    }
  }

  console.log(`Running ${jobs.length} shard(s) with concurrency=${concurrency}`)
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
      lengths,
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

main().catch(err => {
  console.error('[fatal]', err)
  process.exit(1)
})
