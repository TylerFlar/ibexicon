import { useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from '@/app/hooks/useSession'
import { GuessRow } from '@/app/components/GuessRow'
import { Keyboard } from '@/app/components/Keyboard'
import { ToastProvider, useToasts } from '@/app/components/Toaster'
import { loadWordlistSet } from '@/solver/data/loader'
import { buildCandidates, wouldEliminateAll } from '@/app/logic/constraints'
import { SuggestPanel } from '@/app/components/SuggestPanel'
import AnalysisPanel from '@/app/components/AnalysisPanel'
import CandidateTable from '@/app/components/CandidateTable'
import type { Trit } from '@/app/state/session'

function AssistantAppInner() {
  const session = useSession()
  const { settings, history, guessInput, setGuessInput, addGuess } = session
  const { push } = useToasts()
  const [started, setStarted] = useState(false)
  // UI persistence (tab, candidate search placeholder for future)
  const UI_KEY = 'ibexicon:ui'
  const [activeTab, setActiveTab] = useState<'suggest' | 'analysis' | 'candidates'>(() => {
    if (typeof window === 'undefined') return 'suggest'
    try {
      const raw = window.localStorage.getItem(UI_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.tab === 'analysis' || parsed.tab === 'candidates' || parsed.tab === 'suggest') {
          return parsed.tab
        }
      }
    } catch {}
    return 'suggest'
  })
  // persist tab choice
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const existing = window.localStorage.getItem(UI_KEY)
      let obj: any = {}
      if (existing) {
        try { obj = JSON.parse(existing) } catch {}
      }
      obj.tab = activeTab
      window.localStorage.setItem(UI_KEY, JSON.stringify(obj))
    } catch {}
  }, [activeTab])

  // Apply body classes
  useEffect(() => {
    document.body.classList.toggle('colorblind', settings.colorblind)
  }, [settings.colorblind])

  // Word list loading
  const [words, setWords] = useState<string[] | null>(null)
  const [loadingWords, setLoadingWords] = useState(false)
  useEffect(() => {
    let cancelled = false
    setLoadingWords(true)
    setWords(null)
    ;(async () => {
      try {
        const data = await loadWordlistSet(settings.length)
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
  }, [settings.length, push])

  const candidates = useMemo(() => (words ? buildCandidates(words, history) : null), [words, history])
  const candidateCount = candidates?.getAliveWords().length ?? 0

  const [pendingConfirm, setPendingConfirm] = useState<null | { kind: 'offlist' | 'eliminate'; guess: string; trits: Trit[] }>(null)
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
        message: `Not in en-${settings.length} list. Add anyway?`,
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

  return (
    <div className="flex flex-col min-h-dvh">
      <main className="flex-1 flex flex-col items-center gap-10 p-4 md:p-8 w-full max-w-5xl mx-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Ibexicon</h1>
        {!started && (
          <section className="w-full max-w-sm flex flex-col gap-4" aria-label="Setup">
            <label className="flex flex-col gap-1 text-xs font-medium" title="Word length">
              <span>Word length</span>
              <select
                className="px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white/90 dark:bg-neutral-800/80 text-sm"
                value={settings.length}
                onChange={(e) => session.setLength(Number(e.target.value))}
              >
                {Array.from({ length: 12 }, (_, i) => 5 + i).map((L) => (
                  <option key={L} value={L}>{L}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium" title="Max attempts">
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
            <label className="flex items-center gap-2 text-xs" title="Colorblind mode">
              <input type="checkbox" checked={settings.colorblind} onChange={session.toggleColorblind} />
              <span>Colorblind mode</span>
            </label>
            <button
              type="button"
              className="mt-2 px-6 py-2 rounded-md bg-blue-600 text-white font-semibold text-sm"
              onClick={() => setStarted(true)}
            >Start</button>
          </section>
        )}
        {started && (
          <div className="flex flex-wrap gap-3 justify-center text-xs -mt-4">
            <div className="px-3 py-1 rounded-full bg-neutral-200 dark:bg-neutral-700">{history.length}/{settings.attemptsMax} attempts</div>
            <button
              type="button"
              className="px-3 py-1 rounded-full bg-red-500 text-white hover:bg-red-600"
              onClick={() => { session.clear(); setStarted(false); }}
            >Restart</button>
          </div>
        )}
        <section className="flex flex-col gap-3 items-center" aria-label="Guess history and active row" style={{ maxWidth: '100%' }}>
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
          {started && (
            <div className="text-xs text-neutral-500 dark:text-neutral-400 text-center">
              {loadingWords && <span>Loading…</span>}
              {!loadingWords && words && (
                <span>
                  {words.length.toLocaleString()} words • Candidates: {candidateCount.toLocaleString()}
                </span>
              )}
            </div>
          )}
        </section>
        {started && (
          <div className="flex flex-col items-center gap-6 w-full">
            <Keyboard history={history} onKey={handleKeyboardKey} disabled={!words} />
            <div className="w-full max-w-5xl">
              <div className="flex gap-2 mb-3 text-xs">
                {[
                  { key: 'suggest', label: 'Suggest' },
                  { key: 'analysis', label: 'Analysis' },
                  { key: 'candidates', label: 'Candidates' },
                ].map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key as any)}
                    className={
                      'px-3 py-1 rounded-md font-medium border text-xs ' +
                      (activeTab === t.key
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div>
                {activeTab === 'suggest' && (
                  <section aria-label="Suggestions" className="w-full max-w-xl">
                    <SuggestPanel session={session} />
                  </section>
                )}
                {activeTab === 'analysis' && (
                  <section aria-label="Analysis" className="w-full">
                    <AnalysisPanel colorblind={settings.colorblind} />
                  </section>
                )}
                {activeTab === 'candidates' && (
                  <section aria-label="Candidates" className="w-full">
                    {candidates && words && (
                      <CandidateTable
                        words={candidates.getAliveWords()}
                        priors={{}} /* optionally pass renormalized priors here later */
                      />
                    )}
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
