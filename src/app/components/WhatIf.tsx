import { useMemo, useState } from 'react'
import { feedbackTrits } from '@/solver/feedback'

export interface WhatIfProps {
  guess: string
  candidates: string[]
  priors: Record<string, number>
  maxEnumerate?: number // safeguard (default 2000)
}

interface BucketInfo {
  pattern: string
  prob: number
  size: number
  words: string[]
}

export function WhatIf({ guess, candidates, priors, maxEnumerate = 2000 }: WhatIfProps) {
  const [openPattern, setOpenPattern] = useState<string | null>(null)

  const buckets = useMemo<BucketInfo[]>(() => {
    if (!guess || candidates.length === 0) return []
    if (candidates.length > maxEnumerate) return []
    const totalPrior = candidates.reduce((s, w) => s + (priors[w] ?? 0), 0) || 1
    const map = new Map<string, { mass: number; words: string[] }>()
    for (const secret of candidates) {
      const patternDigits = feedbackTrits(guess, secret).join('')
      const entry = map.get(patternDigits)
      const weight = (priors[secret] ?? 0) / totalPrior
      if (entry) {
        entry.mass += weight
        if (entry.words.length < 50) entry.words.push(secret) // keep small sample
      } else {
        map.set(patternDigits, { mass: weight, words: [secret] })
      }
    }
    const out: BucketInfo[] = []
    for (const [pattern, { mass, words }] of map.entries()) {
      out.push({ pattern, prob: mass, size: words.length, words: words.slice(0, 20) })
    }
    out.sort((a, b) => b.prob - a.prob)
    return out
  }, [guess, candidates, priors, maxEnumerate])

  if (candidates.length > maxEnumerate) {
    return (
      <div className="text-[0.65rem] text-neutral-500 dark:text-neutral-400">
        Too many candidates ({candidates.length}); refine guesses to enable preview.
      </div>
    )
  }
  if (!buckets.length) return null

  return (
    <div className="mt-2 border border-neutral-200 dark:border-neutral-700 rounded">
      <table className="w-full text-[0.65rem]">
        <thead>
          <tr className="bg-neutral-100 dark:bg-neutral-800">
            <th className="text-left p-1">Pattern</th>
            <th className="text-right p-1">Prob</th>
            <th className="text-right p-1">|S'|</th>
            <th className="p-1" />
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <>
              <tr key={b.pattern} className="odd:bg-neutral-50 dark:odd:bg-neutral-900/30">
                <td className="p-1 font-mono">{b.pattern}</td>
                <td className="p-1 text-right tabular-nums">{(b.prob * 100).toFixed(2)}%</td>
                <td className="p-1 text-right tabular-nums">{b.size}</td>
                <td className="p-1 text-right">
                  <button
                    type="button"
                    className="px-1 py-0.5 rounded bg-neutral-300 dark:bg-neutral-700 hover:bg-neutral-400 dark:hover:bg-neutral-600"
                    onClick={() => setOpenPattern((p) => (p === b.pattern ? null : b.pattern))}
                  >
                    {openPattern === b.pattern ? 'Hide' : 'View'}
                  </button>
                </td>
              </tr>
              {openPattern === b.pattern && (
                <tr key={b.pattern + ':preview'}>
                  <td className="p-2 font-mono whitespace-normal break-all" colSpan={4}>
                    {b.words.join(' ')}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
