/** Byte-budget LRU cache for ArrayBuffers (used for fallback-computed pattern rows). */

interface NodeEntry {
  key: string
  size: number
  buf: ArrayBuffer
  newer?: NodeEntry
  older?: NodeEntry
}

export class ByteLRU {
  private budget: number
  private total = 0
  private map = new Map<string, NodeEntry>()
  private head?: NodeEntry // most recently used
  private tail?: NodeEntry // least recently used

  constructor(opts?: { budgetBytes?: number }) {
    this.budget = opts?.budgetBytes ?? 128 * 1024 * 1024 // ~128MB default
  }

  get(key: string): ArrayBuffer | undefined {
    const e = this.map.get(key)
    if (!e) return undefined
    this.touch(e)
    return e.buf
  }

  set(key: string, buf: ArrayBuffer) {
    const size = buf.byteLength
    let e = this.map.get(key)
    if (e) {
      this.total -= e.size
      e.buf = buf
      e.size = size
      this.total += size
      this.touch(e)
    } else {
      e = { key, size, buf }
      this.map.set(key, e)
      this.total += size
      this.insertFront(e)
    }
    this.evict()
  }

  clear() {
    this.map.clear()
    this.head = this.tail = undefined
    this.total = 0
  }

  keys(): string[] {
    return [...this.map.keys()]
  }

  delete(key: string) {
    const e = this.map.get(key)
    if (!e) return
    // unlink
    if (e.older) e.older.newer = e.newer
    if (e.newer) e.newer.older = e.older
    if (this.head === e) this.head = e.newer
    if (this.tail === e) this.tail = e.older
    this.total -= e.size
    this.map.delete(key)
  }

  private insertFront(e: NodeEntry) {
    e.newer = this.head
    e.older = undefined
    if (this.head) this.head.older = e
    this.head = e
    if (!this.tail) this.tail = e
  }

  private touch(e: NodeEntry) {
    if (this.head === e) return
    // unlink
    if (e.older) e.older.newer = e.newer
    if (e.newer) e.newer.older = e.older
    if (this.tail === e) this.tail = e.older
    // move to front
    e.newer = this.head
    e.older = undefined
    if (this.head) this.head.older = e
    this.head = e
    if (!this.tail) this.tail = e
  }

  private evict() {
    while (this.total > this.budget && this.tail) {
      const victim = this.tail
      this.map.delete(victim.key)
      this.total -= victim.size
      this.tail = victim.older
      if (this.tail) this.tail.newer = undefined
      if (this.head === victim) this.head = undefined
    }
  }
}
