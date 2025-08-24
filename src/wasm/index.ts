let _ready: Promise<any> | null = null
let _mod: any | null = null

export async function ensureWasm() {
  if (_mod) return _mod
  if (!_ready) {
    _ready = (async () => {
      const modNs: any = await import('@/wasm/pkg/ibxwasm.js')
      // Our patched glue exports a default promise (init) plus named exports.
      const promise = modNs.default && typeof modNs.default.then === 'function' ? modNs.default : null
      if (promise) await promise // ensure instantiation finished
      _mod = modNs
      return modNs
    })()
  }
  return _ready
}

// Safe wrappers (resolve to null if not available)
export async function wasmFeedbackCode(guess: string, secret: string): Promise<number | null> {
  try {
    const mod = await ensureWasm()
    return mod.feedback_code(guess, secret) as number
  } catch {
    return null
  }
}
export async function wasmPatternRowU16(
  guess: string,
  secrets: string[],
): Promise<Uint16Array | null> {
  try {
    const mod = await ensureWasm()
    // guard: only valid for L <= 10
    if (guess.length > 10) return null
    // Create JS array to hand over (wasm-bindgen wants Array for our signature)
     
    const arr: any = secrets
    return mod.pattern_row_u16(guess, arr) as Uint16Array
  } catch {
    return null
  }
}
