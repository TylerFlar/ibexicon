let _ready: Promise<any> | null = null
let _mod: any | null = null

export async function ensureWasm() {
  if (_mod) return _mod
  if (!_ready) {
    _ready = (async () => {
      const mod = await import("@/wasm/pkg/ibxwasm.js")
      // wasm-pack's bundler target self-initializes; default export is not a function here.
      _mod = mod
      return mod
    })()
  }
  return _ready
}

// Safe wrappers (resolve to null if not available)
export async function wasmFeedbackCode(guess: string, secret: string): Promise<number | null> {
  try {
    const mod = await ensureWasm()
    return mod.feedback_code(guess, secret) as number
  } catch { return null }
}
export async function wasmPatternRowU16(guess: string, secrets: string[]): Promise<Uint16Array | null> {
  try {
    const mod = await ensureWasm()
    // guard: only valid for L <= 10
    if (guess.length > 10) return null
    // Create JS array to hand over (wasm-bindgen wants Array for our signature)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any = secrets
    return mod.pattern_row_u16(guess, arr) as Uint16Array
  } catch { return null }
}
