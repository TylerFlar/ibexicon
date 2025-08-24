export type TelemetryEvent =
  | { name: 'app_open'; props: { ua?: string } }
  | { name: 'settings_start'; props: { length: number; attemptsMax: number } }
  | { name: 'guess_added'; props: { turn: number; length: number } }
  | { name: 'suggest_requested'; props: { length: number; S: number; policy: string } }
  | { name: 'policy_changed'; props: { policy: string } }
  | { name: 'analysis_opened'; props: { length: number } }
  | { name: 'bench_run'; props: { length: number; N: number; wasm: boolean } }

export interface TelemetryConfig {
  enabled: boolean // user toggle (default false)
  endpoint?: string | null // optional POST endpoint for sendBeacon/fetch
  appVersion?: string // from package.json or env
}

export function scrubProps<T extends Record<string, unknown>>(p: T): T {
  // Keep primitives only; drop strings longer than 64; no free-form text fields allowed.
  const out: Record<string, unknown> = {}
  for (const k of Object.keys(p)) {
    const v = p[k]
    if (v == null) continue
    if (typeof v === 'string') {
      out[k] = v.slice(0, 64)
    } else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v
  }
  return out as T
}
