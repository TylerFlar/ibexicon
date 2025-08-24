import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/app/hooks/useSession'
import { GuessRow } from '@/app/components/GuessRow'
import { Keyboard } from '@/app/components/Keyboard'
import { ToastProvider, useToasts } from '@/app/components/Toaster'
import { loadWordlistSetById, listWordlistDescriptors } from '@/solver/data/loader'
import { buildCandidates, wouldEliminateAll } from '@/app/logic/constraints'
import { SuggestPanel } from '@/app/components/SuggestPanel'
import { lazy, Suspense } from 'react'
import { PrecomputeBanner } from '@/app/components/PrecomputeBanner'
import { DebugPage } from '@/app/components/DebugPage'
import { SolverWorkerClient } from '@/worker/client'
const AnalysisPanel = lazy(() => import('@/app/components/AnalysisPanel'))
const CandidateTable = lazy(() => import('@/app/components/CandidateTable'))
const LazyLeaderboard = lazy(() => import('@/app/components/Leaderboard'))
import type { Trit } from '@/app/state/session'

function AssistantAppInner() {
  // Hooks first (no conditional use) then derive secret flag for conditional render.
  const session = useSession()
  const { settings, history, guessInput, setGuessInput, addGuess, setDataset, setLength } = session
  const { push } = useToasts()
  const [started, setStarted] = useState(false)
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

  // Word list loading
  const [words, setWords] = useState<string[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  useEffect(() => {
    if (!settings.datasetId) return
    let cancelled = false
    setLoadingWords(true)
    setWords(null)
    ;(async () => {
      try {
        const data = await loadWordlistSetById(settings.datasetId!)
        if (!cancelled) setWords(data.words)
      } catch (e: any) {
        if (!cancelled) {
          push({ message: `Failed loading words: ${e.message || e}`, tone: 'error' })
          setWords([])
        }
      } finally {
        if (!cancelled) setLoadingWords(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [settings.datasetId, push])

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
        message: `Not in ${settings.datasetId || 'current'} list. Add anyway?`,
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

  const handleKeyboardKey = (k: string) => {
    if (k === 'Enter') return
    if (k === 'Backspace') {
      setGuessInput(guessInput.slice(0, -1))
      return
    }
    if (/^[a-zA-Z]$/.test(k)) {
      if (guessInput.length < settings.length) {
        setGuessInput((guessInput + k.toLowerCase()).slice(0, settings.length))
      }
    }
  }

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

  if (secretDebug) return <DebugPage />
  return (
    <div className="flex flex-col min-h-dvh">
      <main className="flex-1 flex flex-col items-center gap-10 p-4 md:p-8 w-full max-w-5xl mx-auto">
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
            </div>
            <label className="flex items-center gap-2 text-xs" title="Colorblind mode">
              <input
                type="checkbox"
                checked={settings.colorblind}
                onChange={session.toggleColorblind}
              />
              <span>Colorblind mode</span>
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                className="px-6 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm hover:bg-blue-500"
                onClick={() => setStarted(true)}
              >
                Start
              </button>
            </div>
          </section>
        )}
        {started && (
          <div className="flex flex-wrap gap-3 justify-center text-xs -mt-4">
            <div className="px-3 py-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
              {history.length}/{settings.attemptsMax} attempts
            </div>
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-red-500 text-white hover:bg-red-600"
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
          className="flex flex-col gap-3 items-center"
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
            <Keyboard history={history} onKey={handleKeyboardKey} disabled={!words} />
            <div className="w-full max-w-5xl">
              <PrecomputeBanner
                client={workerClient}
                length={settings.length}
                words={words}
                datasetId={settings.datasetId}
              />
              {/* Primary nav: Suggest main; secondary panels behind a disclosure */}
              <TabBar
                activeTab={activeTab}
                onChange={(t) => setActiveTab(t)}
                onForceSuggest={() => setActiveTab('suggest')}
              />
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
    <ToastProvider>
      <AssistantAppInner />
    </ToastProvider>
  )
}

export default App

// Lightweight tab bar component with secondary panels hidden behind a toggle
interface TabBarProps {
  activeTab: 'suggest' | 'analysis' | 'candidates' | 'leaderboard'
  onChange: (t: TabBarProps['activeTab']) => void
  onForceSuggest: () => void
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

function TabBar({ activeTab, onChange, onForceSuggest }: TabBarProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  // If user collapses more while a secondary tab is active, revert to suggest.
  useEffect(() => {
    if (!moreOpen && activeTab !== 'suggest') onForceSuggest()
  }, [moreOpen, activeTab, onForceSuggest])
  return (
    <div className="flex justify-center flex-wrap gap-2 mb-4 text-xs items-center">
      <button
        type="button"
        onClick={() => onChange('suggest')}
        className={
          'px-3 py-1 rounded-md font-medium border ' +
          (activeTab === 'suggest'
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700')
        }
      >
        Suggest
      </button>
      <button
        type="button"
        onClick={() => setMoreOpen((v) => !v)}
        className="px-2 py-1 rounded-md border bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-expanded={moreOpen}
        aria-controls="secondary-panels"
      >
        {moreOpen ? 'Hide' : 'More'}
      </button>
      {moreOpen && (
        <div id="secondary-panels" className="flex gap-2 flex-wrap">
          {[
            { key: 'analysis', label: 'Analysis' },
            { key: 'candidates', label: 'Candidates' },
            { key: 'leaderboard', label: 'Leaderboard' },
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key as any)}
              className={
                'px-2 py-1 rounded border font-medium ' +
                (activeTab === t.key
                  ? 'bg-indigo-500 text-white border-indigo-500'
                  : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700')
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
