export default function Privacy() {
  return (
    <div className="prose dark:prose-invert max-w-2xl mx-auto p-6">
      <h1>Privacy &amp; analytics</h1>
      <p><strong>Off by default.</strong> You can opt-in from Settings.</p>
      <h2>What we collect (if enabled)</h2>
      <ul>
        <li>Coarse events (e.g., “suggest requested”, “policy changed”).</li>
        <li>Aggregate numbers (word length, candidate set size). No guesses or secrets.</li>
        <li>An anonymous ID stored in your browser (random string).</li>
      </ul>
      <h2>What we don’t collect</h2>
      <ul>
        <li>No words, solutions, or patterns.</li>
        <li>No IP, email, name, or precise device fingerprint.</li>
      </ul>
      <h2>Respecting your choices</h2>
      <ul>
        <li>Do Not Track and Global Privacy Control are always honored.</li>
        <li>Disable at any time in Settings.</li>
      </ul>
    </div>
  )
}
