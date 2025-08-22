export class Bitset {
  private words: Uint32Array
  readonly size: number // number of bits

  constructor(size: number) {
    if (size < 0) throw new Error('size must be >= 0')
    this.size = size
    const wordCount = (size + 31) >>> 5 // divide by 32 round up
    this.words = new Uint32Array(wordCount)
  }

  private maskLast(): number {
    const rem = this.size & 31
    return rem === 0 ? 0xffffffff : (1 << rem) - 1
  }

  clearAll(): void {
    this.words.fill(0)
  }

  fillAll(): void {
    this.words.fill(0xffffffff)
    // Mask off unused bits in last word
    if (this.words.length > 0) {
      const last = this.words.length - 1
      this.words[last]! &= this.maskLast()
    }
  }

  get(i: number): boolean {
    if (i < 0 || i >= this.size) throw new RangeError('index out of range')
    const w = i >>> 5
    const b = i & 31
    return (this.words[w]! & (1 << b)) !== 0
  }

  set(i: number): void {
    if (i < 0 || i >= this.size) throw new RangeError('index out of range')
    const w = i >>> 5
    const b = i & 31
    this.words[w]! |= 1 << b
  }

  clear(i: number): void {
    if (i < 0 || i >= this.size) throw new RangeError('index out of range')
    const w = i >>> 5
    const b = i & 31
    this.words[w]! &= ~(1 << b)
  }

  and(other: Bitset): void {
    if (other.words.length !== this.words.length || other.size !== this.size) {
      throw new Error('Bitset size mismatch')
    }
    for (let i = 0; i < this.words.length; i++) {
      this.words[i]! &= other.words[i]!
    }
  }

  count(): number {
    let total = 0
    for (let i = 0; i < this.words.length; i++) {
      let v = this.words[i]
      // Kernighan popcount loop
      while (v) {
        v &= v - 1
        total++
      }
    }
    return total
  }

  *indices(): Iterable<number> {
    const n = this.size
    for (let w = 0; w < this.words.length; w++) {
      let word = this.words[w]
      if (word === 0) continue
      while (word) {
        const lsb = word & -word
        const bit = Math.clz32(lsb) ^ 31 // position within word 0..31
        const idx = (w << 5) + bit
        if (idx < n) yield idx
        word ^= lsb
      }
    }
  }

  clone(): Bitset {
    const bs = new Bitset(this.size)
    bs.words.set(this.words)
    return bs
  }
}
