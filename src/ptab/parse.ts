// Shared parser for precomputed pattern table binaries.
// Keeps logic minimal and environment-agnostic (Node / browser).

export interface ParsedPtabMeta {
  L: number
  N: number
  M: number
  hash32: number
  seedIndices: Uint32Array
}

export interface ParsedPtabTable {
  meta: ParsedPtabMeta
  bigMatrix: Uint16Array // row-major M x N
}

/** Parse a ptab binary buffer. Returns null on structural / hash mismatch. */
export function parsePtabBinary(
  buf: ArrayBuffer,
  words: string[],
  length: number,
  expectedHash32: number,
): ParsedPtabTable | null {
  const dv = new DataView(buf)
  let off = 0
  const MAGIC = 0x49585054
  if (dv.getUint32(off, true) !== MAGIC) return null
  off += 4
  const version = dv.getUint16(off, true)
  off += 2
  if (version !== 1) return null
  const L = dv.getUint8(off)
  off += 1
  off += 1 // reserved
  const N = dv.getUint32(off, true)
  off += 4
  const hash32 = dv.getUint32(off, true)
  off += 4
  const M = dv.getUint32(off, true)
  off += 4
  if (L !== length) return null
  if (N !== words.length) return null
  if (hash32 !== expectedHash32) return null
  const seedIndices = new Uint32Array(M)
  for (let i = 0; i < M; i++) {
    seedIndices[i] = dv.getUint32(off, true)
    off += 4
  }
  const expectedBytes = M * N * 2
  if (off + expectedBytes !== buf.byteLength) return null
  const patternsBuf = buf.slice(off)
  const bigMatrix = new Uint16Array(patternsBuf)
  return { meta: { L, N, M, hash32, seedIndices }, bigMatrix }
}
