/** Pattern table provider with binary asset loading + IndexedDB + in-memory LRU fallback. */

import { feedbackPattern } from '@/solver/feedback'
import { readWasmMode } from '@/wasm/feature'
import { wasmPatternRowU16 } from '@/wasm'
import { ByteLRU } from './lru'
import { parsePtabBinary } from '@/ptab/parse'
import { getPtab, setPtab } from './idb'

export interface PtabMeta {
  L: number
  N: number
  M: number
  hash32: number
  seedIndices: Uint32Array
}
export interface PtabTable {
  meta: PtabMeta
  planes: Map<number, Uint16Array>
}

export interface PatternProvider {
  ensureForLength(
    length: number,
    words: string[],
    onProgress?: (stage: string, percent: number) => void,
    datasetId?: string,
  ): Promise<PtabMeta | null>
  getPatterns(
    length: number,
    words: string[],
    guess: string,
    datasetId?: string,
  ): Promise<Uint16Array>
  clearMemory(): void
  statsForLength(
    length: number,
    datasetId?: string,
  ): { memorySeedPlanes: number; memoryFallback: number }
  clearFallbackForLength(length: number, datasetId?: string): void
}

interface LengthState {
  wordsHash?: number
  wordIndex?: Map<string, number>
  assetLoaded: boolean
  assetIgnored: boolean // due to hash mismatch or parse issue
  table?: PtabTable
  bigMatrix?: Uint16Array // backing matrix of size M*N (row-major)
}

interface ProviderOpts {
  memoryBudgetMB?: number
}

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
  } catch {
    /* ignore */
  }
  if (base.endsWith('/')) base = base.slice(0, -1)
  return `${base}/wordlists/en`
}

let userAccelMode: 'auto' | 'js' | 'wasm' = 'auto'
export function setUserAccelMode(mode: 'auto' | 'js' | 'wasm') {
  userAccelMode = mode
}

export function createPatternProvider(opts?: ProviderOpts): PatternProvider {
  // key: datasetKey = datasetId||'core' + '|' + length
  const lengthStates = new Map<string, LengthState>()
  const lru = new ByteLRU({ budgetBytes: (opts?.memoryBudgetMB ?? 128) * 1024 * 1024 })
  const pendingComputes = new Map<string, Promise<Uint16Array>>()

  function dsKey(length: number, datasetId?: string): string {
    return `${datasetId || 'core'}|${length}`
  }

  function stateFor(length: number, datasetId?: string): LengthState {
    const key = dsKey(length, datasetId)
    let st = lengthStates.get(key)
    if (!st) {
      st = { assetLoaded: false, assetIgnored: false }
      lengthStates.set(key, st)
    }
    return st
  }

  async function fetchAsset(length: number, datasetId?: string): Promise<ArrayBuffer | null> {
    // New primary convention: ptab-<id>.bin where id includes length (e.g. en-5, nyt-5)
    const primary = datasetId
      ? `${basePath()}/ptab-${datasetId}.bin`
      : `${basePath()}/ptab-en-${length}.bin`
    // Legacy fallback(s): ibxptab-<L>.bin
    const legacy = `${basePath()}/ibxptab-${length}.bin`
    const urls = [primary]
    if (!urls.includes(legacy)) urls.push(legacy)
    try {
      for (const u of urls) {
        try {
          const res = await fetch(u)
          if (res.ok) return await res.arrayBuffer()
        } catch {
          /* try next */
        }
      }
      return null
    } catch {
      return null
    }
  }

  function parseBinary(
    buf: ArrayBuffer,
    words: string[],
    length: number,
    hash32: number,
    datasetId?: string,
  ): PtabTable | null {
    const parsed = parsePtabBinary(buf, words, length, hash32)
    if (!parsed) return null
    const meta: PtabMeta = {
      L: parsed.meta.L,
      N: parsed.meta.N,
      M: parsed.meta.M,
      hash32: parsed.meta.hash32,
      seedIndices: parsed.meta.seedIndices,
    }
    const table: PtabTable = { meta, planes: new Map() }
    const st = stateFor(length, datasetId)
    st.bigMatrix = parsed.bigMatrix
    return table
  }

  async function ensureForLength(
    length: number,
    words: string[],
    onProgress?: (stage: string, percent: number) => void,
    datasetId?: string,
  ): Promise<PtabMeta | null> {
    const st = stateFor(length, datasetId)
    if (st.assetLoaded && st.table) return st.table.meta
    if (st.assetIgnored) return null
    // Compute hash of current word ordering
    const joined = words.join('\n')
    const hash32 = fnv1a32(joined)
    st.wordsHash = hash32
    // Try fetch asset
    onProgress?.('download', 0)
    const buf = await fetchAsset(length, datasetId)
    onProgress?.('download', 1)
    if (!buf) {
      st.assetIgnored = true
      onProgress?.('verify', 1)
      onProgress?.('parse', 1)
      onProgress?.('ready', 1)
      return null
    }
    onProgress?.('verify', 0.2)
    const table = parseBinary(buf, words, length, hash32, datasetId)
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

  async function getPatterns(
    length: number,
    words: string[],
    guess: string,
    datasetId?: string,
  ): Promise<Uint16Array> {
    await ensureForLength(length, words, undefined, datasetId)
    const st = stateFor(length, datasetId)
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
    const cacheKey = `${dsKey(length, datasetId)}:${guess}`
    const lruBuf = lru.get(cacheKey)
    if (lruBuf) return new Uint16Array(lruBuf)
    // Check IndexedDB
    const idbBuf = await getPtab(length, guess, datasetId)
    if (idbBuf) {
      lru.set(cacheKey, idbBuf)
      return new Uint16Array(idbBuf)
    }
    // Compute (deduplicate concurrent computes)
    let pending = pendingComputes.get(cacheKey)
    if (!pending) {
      pending = (async () => {
        const N = words.length
        const L = words[0]?.length ?? 0
        let arr: Uint16Array | null = null
        // Attempt WASM acceleration for small L (<=10) if available
        const envMode = readWasmMode()
        const allowWasm =
          userAccelMode === 'wasm' || (userAccelMode === 'auto' && envMode !== 'off')
        if (allowWasm && L <= 10) {
          try {
            arr = await wasmPatternRowU16(guess, words)
          } catch {
            /* swallow and fallback */
          }
        }
        if (!arr) {
          // JS fallback path
          const tmp = new Uint16Array(N)
          for (let i = 0; i < N; i++) {
            const pat = feedbackPattern(guess, words[i]!)
            tmp[i] = typeof pat === 'number' ? pat : Number(pat)
          }
          arr = tmp
        }
        // Persist (arr guaranteed non-null)
        const buf = arr.buffer.slice(0) as ArrayBuffer // clone to detach from potential views
        lru.set(cacheKey, buf as ArrayBuffer)
        await setPtab(length, guess, buf as ArrayBuffer, datasetId)
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

  function statsForLength(
    length: number,
    datasetId?: string,
  ): { memorySeedPlanes: number; memoryFallback: number } {
    const st = lengthStates.get(dsKey(length, datasetId))
    const memorySeedPlanes = st?.table?.planes.size || 0
    const prefix = `${dsKey(length, datasetId)}:`
    let memoryFallback = 0
    for (const k of lru.keys()) if (k.startsWith(prefix)) memoryFallback++
    return { memorySeedPlanes, memoryFallback }
  }

  function clearFallbackForLength(length: number, datasetId?: string) {
    const prefix = `${dsKey(length, datasetId)}:`
    for (const k of lru.keys()) if (k.startsWith(prefix)) lru.delete(k)
    const st = lengthStates.get(dsKey(length, datasetId))
    // Also clear accessed seed planes map to allow re-slicing lazily (doesn't refetch asset)
    if (st?.table) st.table.planes.clear()
  }

  return { ensureForLength, getPatterns, clearMemory, statsForLength, clearFallbackForLength }
}
