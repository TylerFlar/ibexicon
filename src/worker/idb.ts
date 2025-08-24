/** IndexedDB helpers for storing fallback-computed pattern rows.
 * Key format: `${L}:${guess}` value: raw ArrayBuffer (Uint16Array serialized).
 */

const DB_NAME = 'ibexicon'
const STORE = 'ptab-v1'
const VERSION = 1

interface IDBEnv {
  dbPromise: Promise<IDBDatabase>
}

const env: IDBEnv = {
  dbPromise: ((): Promise<IDBDatabase> => {
    const idb: any = (globalThis as any).indexedDB
    if (!idb) {
      // Provide a dummy DB that throws on transaction; callers catch and treat as cache miss.
      const dummy = {
        transaction() {
          throw new Error('indexedDB unavailable')
        },
      } as unknown as IDBDatabase
      return Promise.resolve(dummy)
    }
    return new Promise((resolve, reject) => {
      const req = idb.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE)
        }
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result)
    })
  })(),
}

type IDBMode = 'readonly' | 'readwrite'
async function withStore(mode: IDBMode): Promise<IDBObjectStore> {
  const db = await env.dbPromise
  return db.transaction(STORE, mode).objectStore(STORE)
}

export async function getPtab(
  L: number,
  guess: string,
  datasetId?: string,
): Promise<ArrayBuffer | null> {
  try {
    const store = await withStore('readonly')
    const key = datasetId ? `${datasetId}|${L}:${guess}` : `${L}:${guess}`
    return await new Promise((resolve, reject) => {
      const req = store.get(key)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result ?? null)
    })
  } catch {
    return null // swallow IDB failures as cache miss
  }
}

export async function setPtab(
  L: number,
  guess: string,
  buf: ArrayBuffer,
  datasetId?: string,
): Promise<void> {
  try {
    const store = await withStore('readwrite')
    const key = datasetId ? `${datasetId}|${L}:${guess}` : `${L}:${guess}`
    await new Promise<void>((resolve, reject) => {
      const req = store.put(buf, key)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

export async function clearStore(): Promise<void> {
  try {
    const store = await withStore('readwrite')
    await new Promise<void>((resolve, reject) => {
      const req = store.clear()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve()
    })
  } catch {
    /* ignore */
  }
}

export async function countPtabForLength(L: number, datasetId?: string): Promise<number> {
  try {
    const store = await withStore('readonly')
    const prefix = datasetId ? `${datasetId}|${L}:` : `${L}:`
    return await new Promise<number>((resolve, reject) => {
      let count = 0
      const req = store.openCursor()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return resolve(count)
        if (typeof cur.key === 'string' && cur.key.startsWith(prefix)) count++
        cur.continue()
      }
    })
  } catch {
    return 0
  }
}

export async function deletePtabForLength(L: number, datasetId?: string): Promise<void> {
  try {
    const store = await withStore('readwrite')
    const prefix = datasetId ? `${datasetId}|${L}:` : `${L}:`
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor()
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const cur = req.result
        if (!cur) return resolve()
        if (typeof cur.key === 'string' && cur.key.startsWith(prefix)) {
          cur.delete()
        }
        cur.continue()
      }
    })
  } catch {
    /* ignore */
  }
}
