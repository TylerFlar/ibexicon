#!/usr/bin/env node
/**
 * Simulator CLI (Milestone 7 scaffolding)
 *
 * Placeholder implementation: currently just parses basic flags and echoes planned parameters.
 * Real simulation logic (policies, parallelism, prior-weighted sampling, metrics, output) to be implemented.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

interface Args {
  lengths: number[]
  trials: number
  attempts: number
  policies: string[]
  concurrency: number | null
  seed: number | null
  outDir: string
}

function parse(): Args {
  const argv = process.argv.slice(2)
  const out: Partial<Args> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--lengths') {
      const v = argv[++i]
      if (!v) throw new Error('--lengths requires a value')
      if (v.includes('-')) {
        const [lo, hi] = v.split('-').map(Number)
        out.lengths = []
        for (let L = lo; L <= hi; L++) out.lengths.push(L)
      } else {
        out.lengths = v.split(',').map(s => Number(s.trim())).filter(Boolean)
      }
    } else if (a === '--trials') {
      out.trials = Number(argv[++i])
    } else if (a === '--attempts') {
      out.attempts = Number(argv[++i])
    } else if (a === '--policies') {
      const v = argv[++i]
      if (!v) throw new Error('--policies requires CSV list')
      out.policies = v.split(',').map(s => s.trim()).filter(Boolean)
    } else if (a === '--concurrency') {
      out.concurrency = Number(argv[++i])
    } else if (a === '--seed') {
      out.seed = Number(argv[++i])
    } else if (a === '--outDir') {
      out.outDir = argv[++i]!
    } else if (a === '--help' || a === '-h') {
      usage()
      process.exit(0)
    }
  }
  return {
    lengths: out.lengths ?? [4,5,6,7,8],
    trials: out.trials ?? 1000,
    attempts: out.attempts ?? 6,
    policies: out.policies ?? ['composite','pure-eig','pure-solve','unique-letters'],
    concurrency: out.concurrency ?? null,
    seed: out.seed ?? null,
    outDir: out.outDir ?? 'eval/results'
  }
}

function usage() {
  console.log(`Ibexicon Simulator (scaffold)\n\nUsage: npm run eval:run -- [options]\n\nOptions:\n  --lengths 4-8 or CSV   Word lengths (default 4-8)\n  --trials N             Trials per length (default 1000)\n  --attempts N           Max attempts per game (default 6)\n  --policies CSV         Policies to evaluate (default composite,pure-eig,pure-solve,unique-letters)\n  --concurrency N        Max parallel workers (default min(8, cores))\n  --seed N               Deterministic RNG seed\n  --outDir PATH          Output directory (default eval/results)\n  -h, --help             Show help\n`)
}

async function main() {
  const args = parse()
  if (!existsSync(args.outDir)) mkdirSync(args.outDir, { recursive: true })
  const gitSha = await getGitSha()
  console.log('[scaffold] Parameters:')
  console.log(JSON.stringify({ ...args, gitSha }, null, 2))
  console.log('\nSimulation logic not yet implemented.')
}

async function getGitSha(): Promise<string|null> {
  try {
    const { execSync } = await import('node:child_process')
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore','pipe','ignore'] }).toString().trim()
    return sha
  } catch {
    return null
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
