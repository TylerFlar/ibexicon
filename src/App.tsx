import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/app/hooks/useSession'
import { GuessRow } from '@/app/components/GuessRow'
import { ToastProvider, useToasts } from '@/app/components/Toaster'
import { ErrorBoundary } from '@/app/ErrorBoundary'
import { loadWordlistSetById, listWordlistDescriptors } from '@/solver/data/loader'
import { buildCandidates, wouldEliminateAll } from '@/app/logic/constraints'
import { SuggestPanel } from '@/app/components/SuggestPanel'
import { lazy, Suspense } from 'react'
import { PrecomputeBanner } from '@/app/components/PrecomputeBanner'
import { DebugPage } from '@/app/components/DebugPage'
import { SolverWorkerClient } from '@/worker/client'
import { fromSeed, toSeedV1 } from '@/app/seed'
import { ShareBar } from '@/app/components/ShareBar'
import { loadTelemetryEnabled, setTelemetryEnabled, track } from '@/telemetry'
import Privacy from '@/app/routes/Privacy'
const AnalysisPanel = lazy(() => import('@/app/components/AnalysisPanel'))
const CandidateTable = lazy(() => import('@/app/components/CandidateTable'))
const LazyLeaderboard = lazy(() => import('@/app/components/Leaderboard'))
import type { Trit } from '@/app/state/session'

function AssistantAppInner() {
  // Hooks first (no conditional use) then derive secret flag for conditional render.
  const session = useSession()
  const { settings, history, guessInput, addGuess, setDataset, setLength } = session
  const { push } = useToasts()
  const [started, setStarted] = useState(false)
  const [route, setRoute] = useState<string>(() =>
    typeof window !== 'undefined' ? window.location.hash : '',
  )
  useEffect(() => {
    const handler = () => setRoute(window.location.hash)
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  // Hydrate from hash seed once on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const seed = fromSeed(window.location.hash)
      if (seed) {
        // Apply length & attempts first
        session.setLength(seed.length)
        session.setAttemptsMax(seed.attemptsMax)
        // Mark started before replay so UI shows
        setStarted(true)
        for (const h of seed.history) {
          if (h.guess.length === seed.length && h.trits.length === seed.length) {
            session.addGuess(h.guess, h.trits as any)
          }
        }
      }
    } catch (e: any) {
      push({ message: `Failed parsing share link: ${e?.message || e}`, tone: 'error' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep hash in sync with current session
  useEffect(() => {
    if (typeof window === 'undefined') return
    const seed = { length: settings.length, attemptsMax: settings.attemptsMax, history }
    try {
      if (history.length) {
        window.history.replaceState(null, '', toSeedV1(seed as any))
      } else {
        window.history.replaceState(null, '', ' ')
      }
    } catch {
      /* ignore */
    }
  }, [settings.length, settings.attemptsMax, history])
  const secretDebug = useMemo(() => {
    if (typeof window === 'undefined') return false
    return /[?&]__debug=1/.test(window.location.search) || window.location.hash === '#__debug'
  }, [])
  // UI persistence (tab, candidate search placeholder for future)
  const UI_KEY = 'ibexicon:ui'
  const [activeTab, setActiveTab] = useState<'suggest' | 'analysis' | 'candidates' | 'leaderboard'>(
    () => {
      if (typeof window === 'undefined') return 'suggest'
      const raw = window.localStorage.getItem(UI_KEY)
      if (!raw) return 'suggest'
      try {
        const parsed = JSON.parse(raw)
        if (
          parsed &&
          (parsed.tab === 'analysis' ||
            parsed.tab === 'candidates' ||
            parsed.tab === 'suggest' ||
            parsed.tab === 'leaderboard')
        ) {
          return parsed.tab
        }
      } catch (e) {
        /* ignore parse */
      }
      return 'suggest'
    },
  )
  // persist tab choice
  useEffect(() => {
    if (typeof window === 'undefined') return
    let obj: any = {}
    const existing = window.localStorage.getItem(UI_KEY)
    if (existing) {
      try {
        obj = JSON.parse(existing)
      } catch (e) {
        /* ignore parse */
      }
    }
    obj.tab = activeTab
    try {
      window.localStorage.setItem(UI_KEY, JSON.stringify(obj))
    } catch (e) {
      /* ignore quota */
    }
  }, [activeTab])

  // Apply body classes (colorblind + centered pre-start)
  useEffect(() => {
    document.body.classList.toggle('colorblind', settings.colorblind)
    document.body.classList.toggle('app-centered', !started)
  }, [settings.colorblind, started])

  // Theme application effect
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sysPref = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && sysPref)
    document.documentElement.classList.toggle('dark', dark)
    const meta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (meta) meta.content = dark ? '#0a0a0a' : '#ffffff'
  }, [settings.theme])

  // Word list loading
  const [words, setWords] = useState<string[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    if (!settings.datasetId) return
    let cancelled = false
    setLoadingWords(true)
    setWords(null)
    const retry = async <T,>(fn: () => Promise<T>, attempts = 3, delay = 500): Promise<T> => {
      let last: any
      for (let i = 0; i < attempts; i++) {
        try {
          return await fn()
        } catch (e) {
          last = e
          await new Promise((r) => setTimeout(r, delay * (i + 1)))
        }
      }
      throw last
    }
    ;(async () => {
      try {
        const data = await retry(() => loadWordlistSetById(settings.datasetId!), 3, 400)
        if (!cancelled) setWords(data.words)
      } catch (e) {
        if (!cancelled) {
          setWords([])
          push({
            message: 'Failed to load word list. Check your connection and try again.',
            tone: 'error',
            actions: [{ label: 'Retry', event: 'retry-wordlist', tone: 'primary' }],
          })
        }
      } finally {
        if (!cancelled) setLoadingWords(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [settings.datasetId, push, reloadKey])

  // Listen for retry action
  useEffect(() => {
    const handler = (e: any) => {
      if (e.detail === 'retry-wordlist') setReloadKey((k) => k + 1)
    }
    window.addEventListener('ibx:confirm-action', handler)
    return () => window.removeEventListener('ibx:confirm-action', handler)
  }, [])

  const candidates = useMemo(
    () => (words ? buildCandidates(words, history) : null),
    [words, history],
  )
  // Singleton worker client for pattern table ensure UI (avoid recreating on re-renders)
  const workerClientRef = useRef<SolverWorkerClient | null>(null)
  if (!workerClientRef.current) workerClientRef.current = new SolverWorkerClient()
  const workerClient = workerClientRef.current

  const [pendingConfirm, setPendingConfirm] = useState<null | {
    kind: 'offlist' | 'eliminate'
    guess: string
    trits: Trit[]
  }>(null)
  const isInWordlist = (g: string) => !!words && words.includes(g)

  const commitGuess = (guess: string, trits: Trit[]) => {
    if (!words) return
    if (guess.length !== settings.length) {
      push({ message: 'Guess length mismatch', tone: 'warn' })
      return
    }
    if (trits.length !== settings.length) {
      push({ message: 'Pattern length mismatch', tone: 'warn' })
      return
    }
    if (!isInWordlist(guess)) {
      setPendingConfirm({ kind: 'offlist', guess, trits })
      push({
        message:
          `That word isn’t in ${settings.datasetId || 'current'} (L=${settings.length}). Add anyway?` +
          ' \nWhy it matters: off-list guesses don’t prune the candidate set.',
        tone: 'warn',
        actions: [
          { label: 'Add', event: 'confirm', tone: 'primary' },
          { label: 'Cancel', event: 'cancel' },
        ],
      })
      return
    }
    if (wouldEliminateAll(words, history, guess, trits)) {
      setPendingConfirm({ kind: 'eliminate', guess, trits })
      push({
        message: 'Pattern eliminates all candidates. Apply?',
        tone: 'warn',
        actions: [
          { label: 'Apply', event: 'confirm', tone: 'danger' },
          { label: 'Cancel', event: 'cancel' },
        ],
      })
      return
    }
    addGuess(guess, trits)
  }

  useEffect(() => {
    const handler = (e: any) => {
      if (!pendingConfirm) return
      if (e.detail === 'confirm') {
        addGuess(pendingConfirm.guess, pendingConfirm.trits)
      }
      setPendingConfirm(null)
    }
    window.addEventListener('ibx:confirm-action', handler)
    return () => window.removeEventListener('ibx:confirm-action', handler)
  }, [pendingConfirm, addGuess])

  // On-screen keyboard removed; typing happens directly in tiles.

  // Shake animation for invalid tries
  const activeRowWrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerShake = () => {
    const el = activeRowWrapperRef.current
    if (!el) return
    el.classList.remove('shake-invalid')
    void el.offsetWidth
    el.classList.add('shake-invalid')
  }

  const boardRows = history.map((h, idx) => (
    <div key={idx} className="flex gap-1" aria-label={`Guess ${idx + 1}`}>
      {Array.from({ length: settings.length }, (_, i) => (
        <div
          key={i}
          className="tile"
          data-state={h.trits[i] === 2 ? 'correct' : h.trits[i] === 1 ? 'present' : 'absent'}
        >
          <span className="font-semibold">{h.guess[i] || ''}</span>
        </div>
      ))}
    </div>
  ))

  if (route === '#/privacy') return <Privacy />
  if (secretDebug) return <DebugPage />
  return (
    <div className="flex flex-col min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <main
        id="main"
        role="main"
        className="flex-1 flex flex-col items-center gap-10 p-4 md:p-8 w-full max-w-5xl mx-auto"
      >
        <h1 className="text-3xl font-semibold tracking-tight">Ibexicon</h1>
        {!started && (
          <section className="w-full max-w-md flex flex-col gap-5" aria-label="Setup">
            <div className="flex flex-col gap-4">
              <DatasetSelector
                datasetId={settings.datasetId}
                onSelect={(id, L) => {
                  setDataset(id, L)
                  setLength(L)
                }}
              />
              <label
                className="flex flex-col gap-1 text-xs font-medium w-full max-w-xs"
                title="Max attempts"
              >
                <span>Attempts</span>
                <input
                  type="number"
                  min={1}
                  max={100}
                  className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
                  value={settings.attemptsMax}
                  onChange={(e) => session.setAttemptsMax(Number(e.target.value))}
                />
              </label>
              <label
                className="flex flex-col gap-1 text-xs font-medium w-full max-w-xs"
                title="Initial policy / strategy for suggestions"
              >
                <span>Policy</span>
                <select
                  className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
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
              <label
                className="flex items-center gap-2 text-xs"
                title="Share anonymous usage to improve Ibexicon"
              >
                <input
                  type="checkbox"
                  checked={loadTelemetryEnabled()}
                  onChange={(e) => {
                    setTelemetryEnabled(e.target.checked)
                  }}
                />
                <span>Share anonymous usage (opt-in)</span>
                <a href="#/privacy" className="underline text-neutral-500">
                  Privacy
                </a>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                className="btn-primary text-sm"
                onClick={() => {
                  setStarted(true)
                  track({
                    name: 'settings_start',
                    props: { length: settings.length, attemptsMax: settings.attemptsMax },
                  })
                }}
              >
                Start
              </button>
            </div>
          </section>
        )}
        {started && (
          <div className="flex flex-wrap gap-3 justify-center items-center text-xs -mt-4">
            <div className="px-3 py-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
              {history.length}/{settings.attemptsMax} attempts
            </div>
            <ShareBar
              length={settings.length}
              attemptsMax={settings.attemptsMax}
              history={history}
            />
            <button
              type="button"
              className="btn-secondary !rounded-full !py-1 !px-3"
              onClick={() => {
                session.clear()
                setStarted(false)
              }}
            >
              Restart
            </button>
          </div>
        )}
        <section
          className="flex flex-col gap-3 items-center tiles-dense sm:tiles-normal"
          aria-label="Guess history and active row"
          style={{ maxWidth: '100%' }}
        >
          <div className="flex flex-col gap-1 items-center" aria-live="polite">
            {/* Past guesses */}
            {started && boardRows}
            {/* Active guess row centered below */}
            {started && history.length < settings.attemptsMax && (
              <div ref={activeRowWrapperRef} className="mt-1 flex justify-center w-full">
                <GuessRow
                  length={settings.length}
                  value={guessInput}
                  onChange={session.setGuessInput}
                  onCommit={commitGuess}
                  onInvalid={(r) => {
                    if (r === 'pattern' || r === 'length') triggerShake()
                    if (r === 'pattern') push({ message: 'Pattern length mismatch', tone: 'warn' })
                  }}
                  colorblind={settings.colorblind}
                  disabled={!words}
                  resetSignal={history.length}
                />
              </div>
            )}
          </div>
          {started && loadingWords && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              Loading…
            </div>
          )}
        </section>
        {started && (
          <div className="flex flex-col items-center gap-6 w-full">
            {/* On-screen keyboard removed; direct tile typing */}
            <div className="w-full max-w-5xl">
              <PrecomputeBanner
                client={workerClient}
                length={settings.length}
                words={words}
                datasetId={settings.datasetId}
              />
              {/* Primary nav: Suggest main; secondary panels behind a disclosure */}
              <TabBar activeTab={activeTab} onChange={(t) => setActiveTab(t)} />
              <div>
                {activeTab === 'suggest' && (
                  <section aria-label="Suggestions" className="w-full max-w-xl mx-auto">
                    <SuggestPanel session={session} />
                  </section>
                )}
                {activeTab === 'analysis' && (
                  <section aria-label="Analysis" className="w-full max-w-3xl mx-auto">
                    <Suspense
                      fallback={<div className="text-xs text-neutral-500">Loading analysis…</div>}
                    >
                      <AnalysisPanel colorblind={settings.colorblind} />
                    </Suspense>
                  </section>
                )}
                {activeTab === 'candidates' && (
                  <section aria-label="Candidates" className="w-full max-w-xl mx-auto">
                    <Suspense
                      fallback={<div className="text-xs text-neutral-500">Loading candidates…</div>}
                    >
                      {candidates && words && (
                        <CandidateTable
                          words={candidates.getAliveWords()}
                          priors={{}} /* optionally pass renormalized priors here later */
                        />
                      )}
                    </Suspense>
                  </section>
                )}
                {activeTab === 'leaderboard' && (
                  <section aria-label="Leaderboard" className="w-full max-w-4xl mx-auto">
                    <Suspense
                      fallback={
                        <div className="text-xs text-neutral-500">Loading leaderboard…</div>
                      }
                    >
                      <LazyLeaderboard />
                    </Suspense>
                  </section>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// (AutoOpenSuggestions no longer needed; suggestions always visible)

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AssistantAppInner />
      </ToastProvider>
    </ErrorBoundary>
  )
}

export default App

// Lightweight tab bar component with secondary panels hidden behind a toggle
interface TabBarProps {
  activeTab: 'suggest' | 'analysis' | 'candidates' | 'leaderboard'
  onChange: (t: TabBarProps['activeTab']) => void
}

interface DatasetSelectorProps {
  datasetId?: string
  onSelect: (id: string, length: number) => void
}

function DatasetSelector({ datasetId, onSelect }: DatasetSelectorProps) {
  const [options, setOptions] = useState<
    { id: string; length: number; label: string; category: string }[]
  >([])
  const [loading, setLoading] = useState(false)
  const [category, setCategory] = useState<string>('')
  useEffect(() => {
    // Intentionally exclude 'category' from deps to avoid refetch loops; we only need current datasetId on mount/change.
    let active = true
    setLoading(true)
    listWordlistDescriptors()
      .then((sets) => {
        if (!active) return
        const opts = sets
          .map((s) => ({
            id: s.id,
            length: s.length,
            label: s.displayName || s.id,
            category: s.category,
          }))
          .sort((a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label))
        setOptions(opts)
        const categories = Array.from(new Set(opts.map((o) => o.category)))
        const currentOpt = datasetId ? opts.find((o) => o.id === datasetId) : undefined
        const desiredCat = currentOpt ? currentOpt.category : (categories[0] ?? '')
        setCategory((prev) => (prev === '' || !categories.includes(prev) ? desiredCat : prev))
        const activeCat = currentOpt ? currentOpt.category : desiredCat
        const visible = opts.filter((o) => o.category === activeCat)
        if ((!datasetId || !opts.some((o) => o.id === datasetId)) && visible.length === 1) {
          onSelect(visible[0]!.id, visible[0]!.length)
        }
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [datasetId, onSelect])

  // Adjust selection when category changes manually
  useEffect(() => {
    const visible = options.filter((o) => o.category === category)
    if (visible.length === 1 && (!datasetId || !visible.some((o) => o.id === datasetId))) {
      onSelect(visible[0]!.id, visible[0]!.length)
    }
  }, [category, options, datasetId, onSelect])

  const visibleOptions = options.filter((o) => o.category === category)
  const currentLength = (datasetId && options.find((o) => o.id === datasetId)?.length) || ''

  return (
    <div
      className="flex flex-col gap-2 text-xs font-medium"
      title="Choose list category then specific list"
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3 flex-wrap">
          <label className="flex flex-col gap-1 min-w-40">
            <span>Category</span>
            <select
              className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {loading && (
                <option value="" disabled>
                  Loading…
                </option>
              )}
              {!loading &&
                Array.from(new Set(options.map((o) => o.category))).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 flex-1 min-w-56">
            <span>List{currentLength ? ` (L=${currentLength})` : ''}</span>
            <select
              className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
              value={datasetId || ''}
              onChange={(e) => {
                const id = e.target.value
                const opt = options.find((o) => o.id === id)
                if (opt) onSelect(opt.id, opt.length)
              }}
            >
              {loading && (
                <option value="" disabled>
                  Loading…
                </option>
              )}
              {!loading && visibleOptions.length === 0 && (
                <option value="" disabled>
                  No lists
                </option>
              )}
              {!loading &&
                visibleOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} (L={o.length})
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>
    </div>
  )
}

function TabBar({ activeTab, onChange }: TabBarProps) {
  const tabs: { key: TabBarProps['activeTab']; label: string }[] = [
    { key: 'suggest', label: 'Suggest' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'candidates', label: 'Candidates' },
    { key: 'leaderboard', label: 'Leaderboard' },
  ]
  return (
    <div className="flex justify-center flex-wrap gap-2 mb-4 text-xs items-center">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          className={
            'px-3 py-1 rounded-md font-medium border transition-colors ' +
            (activeTab === t.key
              ? 'bg-[var(--color-pine)] text-white border-[var(--color-pine)]'
              : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700')
          }
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
