import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildCandidates } from '@/app/logic/constraints'
import type { UseSessionResult } from '@/app/hooks/useSession'
import { alphaFor } from '@/solver/scoring'
import WhyThisGuess from '@/app/components/WhyThisGuess'
import { loadWordlistSet, loadWordlistSetById } from '@/solver/data/loader'
import { useToasts } from '@/app/components/Toaster'
import {
  samplePolicy,
  updatePolicy,
  rewardFromSizes,
  resetState as resetBanditState,
} from '@/policy/bandit'
import { suggestByPolicy, type PolicyId } from '@/policy/policies'
import { track } from '@/telemetry'
// Simplified; WhatIf / preview removed

export interface SuggestPanelProps {
  session: UseSessionResult
}

interface WordData {
  words: string[]
  priors: Record<string, number>
}

export function SuggestPanel({ session }: SuggestPanelProps) {
  const { history, settings } = session
  const { length, attemptsMax, datasetId } = settings as any
  const attemptsLeft = attemptsMax - history.length
  const { push } = useToasts()

  const [wordData, setWordData] = useState<WordData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load length-specific list + priors (dedicated; App also loads, but we keep self-contained)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setWordData(null)
    ;(async () => {
      try {
        const data = datasetId
          ? await loadWordlistSetById(datasetId)
          : await loadWordlistSet(length)
        if (!cancelled) {
          setWordData({ words: data.words, priors: data.priors })
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [length, datasetId])

  const candidates = useMemo(() => {
    if (!wordData) return null
    return buildCandidates(wordData.words, history)
  }, [wordData, history])

  const candidateWords = useMemo(() => candidates?.getAliveWords() ?? [], [candidates])
  const alpha = useMemo(() => {
    if (!candidates) return null
    return alphaFor(candidateWords.length, attemptsLeft, attemptsMax)
  }, [candidates, candidateWords.length, attemptsLeft, attemptsMax])

  const explorationState = useMemo(() => {
    if (alpha == null) return null
    if (alpha >= 0.6) return { label: 'Exploring', tone: 'info' as const }
    if (alpha <= 0.4) return { label: 'Exploiting', tone: 'success' as const }
    return { label: 'Balanced', tone: 'neutral' as const }
  }, [alpha])

  // Policy-based suggestions (no worker)
  const [inFlight, setInFlight] = useState(false)
  const [results, setResults] = useState<
    | { guess: string; eig: number; solveProb: number; expectedRemaining: number; alpha?: number }[]
    | null
  >(null)
  const [openWhy, setOpenWhy] = useState<Record<string, boolean>>({})
  const lastPolicyRef = useRef<PolicyId | null>(null)

  const startScoring = useCallback(async () => {
    if (!wordData || !candidates) return
    if (candidateWords.length === 0) {
      push({
        message:
          'No candidates left. One of the patterns may be inconsistent with earlier feedback.',
        tone: 'warn',
      })
      return
    }
    setInFlight(true)
    setResults(null)
    try {
      const userChoice = settings.policyMode
      const activePolicy: PolicyId =
        userChoice === 'auto' ? samplePolicy(settings.length) : (userChoice as PolicyId)
      lastPolicyRef.current = activePolicy
      const suggestions = await suggestByPolicy(activePolicy, {
        words: candidateWords,
        priors: wordData.priors,
        attemptsLeft,
        attemptsMax,
        topK: 20,
        tau: null,
      })
      const mapped = suggestions.map((s) => ({
        guess: s.guess,
        eig: s.eig ?? 0,
        solveProb: s.solveProb ?? 0,
        expectedRemaining: s.expectedRemaining ?? 0,
        alpha: s.alpha,
      }))
      setResults(mapped)
      track({
        name: 'suggest_requested',
        props: { length: settings.length, S: candidateWords.length, policy: activePolicy },
      })
    } catch (e: any) {
      push({ message: `Suggest error: ${e.message || e}`, tone: 'error' })
    } finally {
      setInFlight(false)
    }
  }, [
    wordData,
    candidates,
    candidateWords,
    attemptsLeft,
    attemptsMax,
    push,
    settings.policyMode,
    settings.length,
  ])

  // Auto-run for small sets
  useEffect(() => {
    if (!results && !inFlight && candidateWords.length > 0 && candidateWords.length <= 500) {
      startScoring()
    }
  }, [candidateWords.length, results, inFlight, startScoring])

  // Bandit reward update effect
  const prevHistoryLenRef = useRef(history.length)
  useEffect(() => {
    if (!wordData) return
    if (history.length > prevHistoryLenRef.current) {
      const n = history.length
      const before = buildCandidates(wordData.words, history.slice(0, n - 1)).aliveCount()
      const after = buildCandidates(wordData.words, history).aliveCount()
      const { r01 } = rewardFromSizes(before, after)
      const used = lastPolicyRef.current
      if (used && settings.policyMode === 'auto') {
        updatePolicy(settings.length, used, r01)
      }
      lastPolicyRef.current = null
    }
    prevHistoryLenRef.current = history.length
  }, [history, wordData, settings.policyMode, settings.length])

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2 text-[0.65rem] text-neutral-500 dark:text-neutral-400">
          <span>{candidateWords.length.toLocaleString()} candidates</span>
          {alpha != null && explorationState && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800">
              <strong className="font-semibold tracking-tight">{explorationState.label}</strong>
              <span className="opacity-70 tabular-nums">{Math.round(alpha * 100)}%</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[0.65rem]">
          <label className="flex items-center gap-1">
            <span className="font-semibold tracking-tight text-neutral-600 dark:text-neutral-300">
              Policy:
            </span>
            <select
              className="px-1 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 text-[0.65rem]"
              value={settings.policyMode}
              onChange={(e) => {
                const val = e.target.value as any
                session.setPolicy(val)
                track({ name: 'policy_changed', props: { policy: val } })
              }}
            >
              <option value="auto">Auto (Bandit)</option>
              <option value="composite">Composite</option>
              <option value="pure-eig">Pure-EIG</option>
              <option value="in-set-only">In-set-only</option>
              <option value="unique-letters">Unique-letters</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => {
              resetBanditState(settings.length)
              push({ message: 'Bandit state reset', tone: 'info' })
            }}
            className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 text-[0.6rem] hover:bg-neutral-100 dark:hover:bg-neutral-700"
          >
            Reset bandit
          </button>
        </div>
      </div>
      {loading && <p className="text-xs text-neutral-500">Loading wordlist…</p>}
      {error && <p className="text-xs text-red-600 dark:text-red-400">Failed to load: {error}</p>}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={startScoring}
          disabled={loading || !wordData || candidateWords.length === 0 || inFlight}
          className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
        >
          {inFlight ? 'Computing…' : 'Rank Suggestions'}
        </button>
      </div>
      {inFlight && (
        <div className="h-2 bg-neutral-200 dark:bg-neutral-800 rounded overflow-hidden">
          <div className="h-full bg-indigo-500 animate-pulse" style={{ width: '60%' }} />
        </div>
      )}
      {results && results.length > 0 && (
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs border-collapse" aria-label="Suggestions table">
            <thead className="sticky top-0 bg-neutral-100 dark:bg-neutral-800">
              <tr>
                <th
                  className="text-left p-1 font-semibold"
                  title="Candidate word to consider guessing"
                >
                  Guess
                </th>
                <th
                  className="text-right p-1 font-semibold cursor-help"
                  title="EIG (Expected Information Gain, in bits). Higher means the guess is expected to reduce uncertainty more by splitting the remaining possibilities."
                >
                  EIG
                </th>
                <th
                  className="text-right p-1 font-semibold cursor-help"
                  title="Solve%: Prior probability this guess itself is the secret (renormalized over current candidates)."
                >
                  Solve%
                </th>
                <th
                  className="text-right p-1 font-semibold cursor-help"
                  title="Remain: Expected number of candidates left after applying the feedback from this guess. Lower is better."
                >
                  Remain
                </th>
              </tr>
            </thead>
            <tbody>
              {results.map((s) => (
                <React.Fragment key={s.guess}>
                  <tr className="odd:bg-neutral-50 dark:odd:bg-neutral-900/30 align-top">
                    <td className="p-1 font-mono">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="underline-offset-2 hover:underline"
                          onClick={() =>
                            window.dispatchEvent(
                              new CustomEvent('ibx:set-guess-input', { detail: s.guess }),
                            )
                          }
                        >
                          {s.guess}
                        </button>
                        <button
                          type="button"
                          className="text-[0.6rem] px-1 py-0.5 rounded border border-neutral-400 dark:border-neutral-600 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                          onClick={() => setOpenWhy((m) => ({ ...m, [s.guess]: !m[s.guess] }))}
                        >
                          {openWhy[s.guess] ? 'Hide' : 'Why?'}
                        </button>
                      </div>
                    </td>
                    <td className="p-1 text-right tabular-nums">{s.eig.toFixed(2)}</td>
                    <td className="p-1 text-right tabular-nums">
                      {(() => {
                        const pct = s.solveProb * 100
                        if (pct >= 1) return pct.toFixed(1)
                        if (pct >= 0.1) return pct.toFixed(2)
                        if (pct >= 0.01) return pct.toFixed(2)
                        if (pct === 0) return '0'
                        return '<0.01'
                      })()}
                    </td>
                    <td className="p-1 text-right tabular-nums">
                      {s.expectedRemaining.toFixed(1)}
                    </td>
                  </tr>
                  {openWhy[s.guess] && candidateWords.length > 0 && (
                    <tr className="bg-neutral-50 dark:bg-neutral-900/40">
                      <td colSpan={4} className="p-2">
                        <WhyThisGuess
                          guess={s.guess}
                          words={candidateWords}
                          priors={wordData?.priors || {}}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
