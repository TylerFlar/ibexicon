// Tiny FNV-1a 32-bit hash (unsigned) for strings / buffers.
// Reference: http://www.isthe.com/chongo/tech/comp/fnv/

export function fnv1a32(input: string | Uint8Array): number {
  let data: Uint8Array
  if (typeof input === 'string') {
    // Encode as UTF-8 (Node / browser compatible)
    if (typeof TextEncoder !== 'undefined') {
      data = new TextEncoder().encode(input)
    } else {
      // Fallback (very old environments) – assume ASCII
      data = Uint8Array.from(Array.from(input, (c) => c.charCodeAt(0) & 0xff))
    }
  } else {
    data = input
  }

  let hash = 0x811c9dc5 >>> 0 // offset basis
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i]!
    // 32-bit FNV prime 16777619
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}
