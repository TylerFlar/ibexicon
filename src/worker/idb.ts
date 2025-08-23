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
  dbPromise: new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
  }),
}

async function withStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
  const db = await env.dbPromise
  return db.transaction(STORE, mode).objectStore(STORE)
}

export async function getPtab(L: number, guess: string): Promise<ArrayBuffer | null> {
  try {
    const store = await withStore('readonly')
    const key = `${L}:${guess}`
    return await new Promise((resolve, reject) => {
      const req = store.get(key)
      req.onerror = () => reject(req.error)
      req.onsuccess = () => resolve(req.result ?? null)
    })
  } catch {
    return null // swallow IDB failures as cache miss
  }
}

export async function setPtab(L: number, guess: string, buf: ArrayBuffer): Promise<void> {
  try {
    const store = await withStore('readwrite')
    const key = `${L}:${guess}`
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
