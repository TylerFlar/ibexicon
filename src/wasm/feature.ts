export type WasmMode = 'auto' | 'on' | 'off'

export function readWasmMode(): WasmMode {
  const env = (import.meta.env.VITE_WASM as WasmMode | undefined) ?? 'auto'
  const qp =
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('wasm') : null
  const override = qp === 'on' ? 'on' : qp === 'off' ? 'off' : null
  const mode = (override ?? env) as WasmMode
  return mode === 'on' || mode === 'off' ? mode : 'auto'
}
