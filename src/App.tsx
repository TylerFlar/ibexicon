import { WordlistDebug } from './app/components/WordlistDebug'
import { SolverDebug } from './app/components/SolverDebug'
import { SuggestDebug } from './app/components/SuggestDebug'
import { WorkerSuggestPanel } from './app/components/WorkerSuggestPanel'

function App() {
  return (
    <div className="app-shell">
      {/* Placeholder sidebar until Assistant Mode UI lands */}
      <aside className="app-sidebar p-4 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ibexicon</h1>
  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-snug">
          Debug view: load manifest & per-length wordlists + priors.
        </p>
  <div className="text-xs text-neutral-500 dark:text-neutral-500">
          Tailwind wired. This sidebar will host Assistant controls later.
        </div>
      </aside>
      <main className="app-main p-4 md:p-6 space-y-8">
        <section className="pane-grid">
          <div className="space-y-4">
            <WordlistDebug />
            <SolverDebug />
          </div>
          <div className="space-y-4">
            <SuggestDebug />
            <WorkerSuggestPanel />
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
