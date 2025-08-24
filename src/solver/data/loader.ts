// Wordlist loader for length-specific English lists & priors.
// Runs in browser (fetch from /public) and in Vitest/JSDOM (still uses fetch).
// Provides lightweight caching so multiple callers share the same promise.

export interface WordlistSet {
  id: string // unique id e.g. "en-5" or "nyt-5"
  length: number // word length
  words: string[] // vocabulary
  priors: Record<string, number> // probability distribution (sums ≈1 within set)
  category: string // display category (e.g. "Core", "NYT")
  source?: string // optional provenance description
  displayName?: string // optional nicer label for UI
}

// New manifest model: a list of wordlist descriptors instead of only implicit length mapping.
// Backwards compatibility not required per user instruction.
export interface WordlistDescriptor {
  id: string // stable id used in URLs (filename stem)
  length: number
  category: string // display category grouping
  displayName?: string // human-friendly name
  source?: string // provenance
  wordsFile: string // relative filename of word list (.txt)
  priorsFile: string // relative filename of priors (.json)
  size?: number // cached word count
  updatedAt?: string
}

interface Manifest {
  version: 2
  sets: WordlistDescriptor[]
  meta?: any
}

let manifestPromise: Promise<Manifest> | null = null
// Cache by id now (previously by length only). Multiple sets can share a length.
const setCache = new Map<string, Promise<WordlistSet>>()

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
      const raw = await r.json()
      // If this looks like the old schema (has lengths), adapt minimally to new interface.
      if (raw && Array.isArray(raw.lengths)) {
        const sets: WordlistDescriptor[] = raw.lengths.map((L: number) => ({
          id: `en-${L}`,
          length: L,
          category: 'Core',
          displayName: `English ${L}`,
          wordsFile: `en-${L}.txt`,
          priorsFile: `en-${L}-priors.json`,
          size: raw.vocab?.[String(L)],
        }))
        return { version: 2, sets, meta: raw.meta }
      }
      return raw as Manifest
    })
  }
  return manifestPromise
}

async function fetchWordsFile(file: string): Promise<string[]> {
  const res = await fetch(`${basePath()}/${file}`)
  if (!res.ok) throw new Error(`Failed word list file ${file}: ${res.status}`)
  const text = await res.text()
  return text
    .split(/\r?\n/)
    .map((w) => w.trim())
    .filter(Boolean)
}

async function fetchPriorsFile(file: string): Promise<Record<string, number>> {
  const res = await fetch(`${basePath()}/${file}`)
  if (!res.ok) throw new Error(`Failed priors file ${file}: ${res.status}`)
  return (await res.json()) as Record<string, number>
}

export async function listWordlistDescriptors(): Promise<WordlistDescriptor[]> {
  const manifest = await loadManifest()
  return manifest.sets.slice()
}

export function loadWordlistSetById(id: string): Promise<WordlistSet> {
  if (setCache.has(id)) return setCache.get(id)!
  const p = (async () => {
    const manifest = await loadManifest()
    const desc = manifest.sets.find((s) => s.id === id)
    if (!desc) throw new Error(`Unknown wordlist id: ${id}`)
    const [words, priors] = await Promise.all([
      fetchWordsFile(desc.wordsFile),
      fetchPriorsFile(desc.priorsFile),
    ])
    return {
      id: desc.id,
      length: desc.length,
      words,
      priors,
      category: desc.category,
      source: desc.source,
      displayName: desc.displayName,
    }
  })()
  setCache.set(id, p)
  return p
}

// Convenience: retain old signature but resolve to the canonical core list for that length.
export function loadWordlistSet(length: number): Promise<WordlistSet> {
  const key = `en-${length}`
  return loadWordlistSetById(key)
}

// Simple helper to clear caches (used in tests)
export function __clearWordlistCache() {
  setCache.clear()
  manifestPromise = null
}
