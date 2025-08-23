import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/app/hooks/useSession'
import { GuessRow } from '@/app/components/GuessRow'
import { Keyboard } from '@/app/components/Keyboard'
import { ControlsBar } from '@/app/components/ControlsBar'
import { ToastProvider, useToasts } from '@/app/components/Toaster'
import { loadWordlistSet } from '@/solver/data/loader'
import { buildCandidates, wouldEliminateAll } from '@/app/logic/constraints'
import { SuggestPanel } from '@/app/components/SuggestPanel'
import type { Trit } from '@/app/state/session'

function AssistantAppInner() {
  const session = useSession()
  const { settings, history, guessInput, setGuessInput, addGuess } = session
  const { push } = useToasts()

  // Apply colorblind class on body
  useEffect(() => {
    if (settings.colorblind) document.body.classList.add('colorblind')
    else document.body.classList.remove('colorblind')
  }, [settings.colorblind])

  // Load wordlist for current length
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

  // Candidate set derived from history
  const candidates = useMemo(() => {
    if (!words) return null
    return buildCandidates(words, history)
  }, [words, history])

  const candidateCount = candidates?.getAliveWords().length ?? 0

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
    // Warn if inconsistent
    if (wouldEliminateAll(words, history, guess, trits)) {
      push({ message: 'Pattern would eliminate all candidates', tone: 'warn' })
    }
    addGuess(guess, trits)
  }

  // Keyboard integration
  const handleKeyboardKey = (k: string) => {
    if (k === 'Enter') return // commit handled by GuessRow button/enter
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

  // History board rows
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
    <div className="app-shell">
      <aside className="app-sidebar p-4 space-y-4 overflow-y-auto">
        <h1 className="text-xl font-semibold tracking-tight">Ibexicon Assistant</h1>
        <ControlsBar
          state={session}
          actions={{
            setLength: session.setLength,
            setAttemptsMax: session.setAttemptsMax,
            setTopK: session.setTopK,
            setTauAuto: session.setTauAuto,
            setTau: session.setTau,
            toggleColorblind: session.toggleColorblind,
            undo: session.undo,
            clear: session.clear,
          }}
        />
        <div className="text-xs text-neutral-500 dark:text-neutral-400">
          {loadingWords && <span>Loading wordlist…</span>}
          {!loadingWords && words && (
            <span>
              {words.length.toLocaleString()} words | Candidates: {candidateCount.toLocaleString()}
            </span>
          )}
        </div>
      </aside>
      <main className="app-main p-4 md:p-6 flex flex-col gap-6">
        <section className="flex flex-col gap-3" aria-label="Guess history and active row">
          <div className="flex flex-col gap-1" aria-live="polite">
            {boardRows}
          </div>
          {history.length < settings.attemptsMax && (
            <GuessRow
              length={settings.length}
              value={guessInput}
              onChange={session.setGuessInput}
              onCommit={commitGuess}
              colorblind={settings.colorblind}
              disabled={!words}
              resetSignal={history.length}
            />
          )}
        </section>
        <Keyboard history={history} onKey={handleKeyboardKey} disabled={!words} />
      </main>
      <div className="hidden md:block w-96 shrink-0 border-l border-neutral-200 dark:border-neutral-800 p-4 space-y-4">
        <SuggestPanel session={session} />
      </div>
    </div>
  )
}

function App() {
  return (
    <ToastProvider>
      <AssistantAppInner />
    </ToastProvider>
  )
}

export default App
