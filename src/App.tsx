import { WordlistDebug } from './app/components/WordlistDebug'
import { SolverDebug } from './app/components/SolverDebug'

function App() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1 style={{ margin: 0 }}>Ibexicon</h1>
      <p style={{ marginTop: '0.5rem', color: '#555', fontSize: '0.9rem' }}>
        Debug view: load manifest & per-length wordlists + priors.
      </p>
      <WordlistDebug />
      <SolverDebug />
    </main>
  )
}

export default App
