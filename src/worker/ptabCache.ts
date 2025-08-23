/** Pattern table provider with binary asset loading + IndexedDB + in-memory LRU fallback. */

import { feedbackPattern } from '@/solver/feedback'
import { ByteLRU } from './lru'
import { getPtab, setPtab } from './idb'

export interface PtabMeta { L: number; N: number; M: number; hash32: number; seedIndices: Uint32Array }
export interface PtabTable { meta: PtabMeta; planes: Map<number, Uint16Array> }

export interface PatternProvider {
  ensureForLength(length: number, words: string[], onProgress?: (stage: string, percent: number) => void): Promise<PtabMeta | null>
  getPatterns(length: number, words: string[], guess: string): Promise<Uint16Array>
  clearMemory(): void
}

interface LengthState {
  wordsHash?: number
  wordIndex?: Map<string, number>
  assetLoaded: boolean
  assetIgnored: boolean // due to hash mismatch or parse issue
  table?: PtabTable
  bigMatrix?: Uint16Array // backing matrix of size M*N (row-major)
}

interface ProviderOpts { memoryBudgetMB?: number }

// FNV-1a 32-bit -- mirrored from build script, kept tiny.
function fnv1a32(str: string): number {
  let hash = 0x811c9dc5 >>> 0
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i) & 0xff
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

function basePath(): string {
  let base: string = '/'
  try {
    // @ts-ignore
    base = (import.meta.env && import.meta.env.BASE_URL) || '/'
  } catch {/* ignore */}
  if (base.endsWith('/')) base = base.slice(0, -1)
  return `${base}/wordlists/en`
}

export function createPatternProvider(opts?: ProviderOpts): PatternProvider {
  const lengthStates = new Map<number, LengthState>()
  const lru = new ByteLRU({ budgetBytes: (opts?.memoryBudgetMB ?? 128) * 1024 * 1024 })
  const pendingComputes = new Map<string, Promise<Uint16Array>>()

  function stateFor(length: number): LengthState {
    let st = lengthStates.get(length)
    if (!st) {
      st = { assetLoaded: false, assetIgnored: false }
      lengthStates.set(length, st)
    }
    return st
  }

  async function fetchAsset(length: number): Promise<ArrayBuffer | null> {
    const url = `${basePath()}/ibxptab-${length}.bin`
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      return await res.arrayBuffer()
    } catch {
      return null
    }
  }

  function parseBinary(buf: ArrayBuffer, words: string[], length: number, hash32: number): PtabTable | null {
    const dv = new DataView(buf)
    let off = 0
    const MAGIC = 0x49585054
    if (dv.getUint32(off, true) !== MAGIC) return null
    off += 4
    const version = dv.getUint16(off, true); off += 2
    if (version !== 1) return null
    const L = dv.getUint8(off); off += 1
    off += 1 // reserved
    const N = dv.getUint32(off, true); off += 4
    const hash = dv.getUint32(off, true); off += 4
    const M = dv.getUint32(off, true); off += 4
    if (L !== length) return null
    if (hash !== hash32) return null
    if (N !== words.length) return null
    // Seed indices
    const seedIndices = new Uint32Array(M)
    for (let i = 0; i < M; i++) {
      seedIndices[i] = dv.getUint32(off, true); off += 4
    }
    // Remaining buffer is patterns (M * N * 2 bytes)
    const expectedBytes = M * N * 2
    if (off + expectedBytes !== buf.byteLength) {
      // length mismatch
      return null
    }
    const patternsBuf = buf.slice(off)
    const bigMatrix = new Uint16Array(patternsBuf)
    const meta: PtabMeta = { L, N, M, hash32: hash, seedIndices }
    // We won't populate planes upfront; on first row request we supply subarray.
    const table: PtabTable = { meta, planes: new Map() }
    const st = stateFor(length)
    st.bigMatrix = bigMatrix
    return table
  }

  async function ensureForLength(
    length: number,
    words: string[],
    onProgress?: (stage: string, percent: number) => void,
  ): Promise<PtabMeta | null> {
    const st = stateFor(length)
    if (st.assetLoaded && st.table) return st.table.meta
    if (st.assetIgnored) return null
    // Compute hash of current word ordering
    const joined = words.join('\n')
    const hash32 = fnv1a32(joined)
    st.wordsHash = hash32
    // Try fetch asset
    onProgress?.('download', 0)
    const buf = await fetchAsset(length)
    onProgress?.('download', 1)
    if (!buf) {
      st.assetIgnored = true
      onProgress?.('verify', 1)
      onProgress?.('parse', 1)
      onProgress?.('ready', 1)
      return null
    }
    onProgress?.('verify', 0.2)
    const table = parseBinary(buf, words, length, hash32)
    if (!table) {
      st.assetIgnored = true
      onProgress?.('verify', 1)
      onProgress?.('parse', 1)
      onProgress?.('ready', 1)
      return null
    }
    onProgress?.('verify', 1)
    onProgress?.('parse', 0.5)
    st.table = table
    st.assetLoaded = true
    // Build word index map
    const wmap = new Map<string, number>()
    for (let i = 0; i < words.length; i++) wmap.set(words[i]!, i)
    st.wordIndex = wmap
    onProgress?.('parse', 1)
    onProgress?.('ready', 1)
    return table.meta
  }

  function findSeedRow(meta: PtabMeta, seedIndex: number): number | null {
    // linear scan acceptable for M=1500; could binary search if sorted
    for (let i = 0; i < meta.M; i++) if (meta.seedIndices[i] === seedIndex) return i
    return null
  }

  async function getPatterns(length: number, words: string[], guess: string): Promise<Uint16Array> {
    await ensureForLength(length, words)
    const st = stateFor(length)
    // build word index if missing
    if (!st.wordIndex) {
      const wmap = new Map<string, number>()
      for (let i = 0; i < words.length; i++) wmap.set(words[i]!, i)
      st.wordIndex = wmap
    }
    const idx = st.wordIndex.get(guess)
    if (idx == null) throw new Error(`Guess '${guess}' not in word list length ${length}`)
    // If asset present and guess is seed
    if (st.table && st.bigMatrix) {
      const rowIdx = findSeedRow(st.table.meta, idx)
      if (rowIdx != null) {
  const { N } = st.table.meta
        // lazily return subarray view; also memoize in planes map
        const start = rowIdx * N
        const view = st.bigMatrix.subarray(start, start + N)
        st.table.planes.set(idx, view)
        return view
      }
    }
    // Fallback: check in-memory LRU
    const cacheKey = `${length}:${guess}`
    const lruBuf = lru.get(cacheKey)
    if (lruBuf) return new Uint16Array(lruBuf)
    // Check IndexedDB
    const idbBuf = await getPtab(length, guess)
    if (idbBuf) {
      lru.set(cacheKey, idbBuf)
      return new Uint16Array(idbBuf)
    }
    // Compute (deduplicate concurrent computes)
    let pending = pendingComputes.get(cacheKey)
    if (!pending) {
      pending = (async () => {
        const N = words.length
        const arr = new Uint16Array(N)
        for (let i = 0; i < N; i++) {
          const pat = feedbackPattern(guess, words[i]!)
          arr[i] = typeof pat === 'number' ? pat : Number(pat)
        }
        // Persist
        const buf = arr.buffer.slice(0) // clone to detach from potential views
        lru.set(cacheKey, buf)
        await setPtab(length, guess, buf)
        return arr
      })()
      pendingComputes.set(cacheKey, pending)
      try {
        const result = await pending
        return result
      } finally {
        pendingComputes.delete(cacheKey)
      }
    } else {
      return pending
    }
  }

  function clearMemory() {
    lru.clear()
    // Do not drop precomputed assets, only volatile cache
  }

  return { ensureForLength, getPatterns, clearMemory }
}
