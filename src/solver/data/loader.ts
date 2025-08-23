// Wordlist loader for length-specific English lists & priors.
// Runs in browser (fetch from /public) and in Vitest/JSDOM (still uses fetch).
// Provides lightweight caching so multiple callers share the same promise.

export interface WordlistSet {
  length: number
  words: string[]
  priors: Record<string, number>
}

interface Manifest {
  lengths: number[]
  vocab: Record<string, number>
  tokenTotals: Record<string, number>
  mu: Record<string, number>
  meta: any
}

let manifestPromise: Promise<Manifest> | null = null
const setCache = new Map<number, Promise<WordlistSet>>()

function basePath() {
  // Use Vite's configured base (import.meta.env.BASE_URL) so that when the app
  // is deployed under a sub-path (e.g. GitHub Pages /ibexicon/), we request
  // the wordlists relative to that base instead of the domain root.
  // Fallback to '/' in non-Vite or test environments.
  // BASE_URL always ends with a trailing slash in Vite.
  let base: string = '/'
  try {
    // @ts-ignore - env is injected by Vite in build/runtime
    base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  } catch {
    /* ignore */
  }
  if (base.endsWith('/')) base = base.slice(0, -1)
  return `${base}/wordlists/en`
}

export function loadManifest(): Promise<Manifest> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${basePath()}/manifest.json`).then(async (r) => {
      if (!r.ok) throw new Error(`Failed manifest: ${r.status}`)
      return (await r.json()) as Manifest
    })
  }
  return manifestPromise
}

async function fetchWords(length: number): Promise<string[]> {
  const res = await fetch(`${basePath()}/en-${length}.txt`)
  if (!res.ok) throw new Error(`Failed word list ${length}: ${res.status}`)
  const text = await res.text()
  // Trim & split; allow either \n or \r\n
  return text
    .split(/\r?\n/) // naive split
    .map((w) => w.trim())
    .filter(Boolean)
}

async function fetchPriors(length: number): Promise<Record<string, number>> {
  const res = await fetch(`${basePath()}/en-${length}-priors.json`)
  if (!res.ok) throw new Error(`Failed priors ${length}: ${res.status}`)
  return (await res.json()) as Record<string, number>
}

export function loadWordlistSet(length: number): Promise<WordlistSet> {
  if (setCache.has(length)) return setCache.get(length)!
  const p = (async () => {
    const [words, priors] = await Promise.all([fetchWords(length), fetchPriors(length)])
    return { length, words, priors }
  })()
  setCache.set(length, p)
  return p
}

// Simple helper to clear caches (used in tests)
export function __clearWordlistCache() {
  setCache.clear()
  manifestPromise = null
}
