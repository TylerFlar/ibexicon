/* eslint-disable no-console */
import type { TelemetryConfig, TelemetryEvent } from './schema'
import { scrubProps } from './schema'

let cfg: TelemetryConfig = { enabled: false, endpoint: null, appVersion: undefined }
let anonId: string | null = null
let ready = false

function getAnonId(): string {
  if (anonId) return anonId
  try {
    const KEY = 'ibexicon:anonid:v1'
    anonId = localStorage.getItem(KEY)
    if (!anonId) {
      anonId = crypto.getRandomValues(new Uint32Array(4)).join('-')
      localStorage.setItem(KEY, anonId)
    }
  } catch {
    // ignore localStorage / crypto access issues (private mode, etc.)
  }
  return anonId || 'anon'
}

function dntOn(): boolean {
  // Respect DNT and Global Privacy Control
  const dnt = (navigator as any).doNotTrack === '1' || (window as any).doNotTrack === '1'
  const gpc = (navigator as any).globalPrivacyControl === true
  return !!(dnt || gpc)
}

export function initTelemetry(initial?: Partial<TelemetryConfig>) {
  cfg = {
    enabled: false,
    endpoint: (import.meta as any).env?.VITE_TELEMETRY_ENDPOINT ?? null,
    appVersion: (import.meta as any).env?.VITE_APP_VERSION ?? undefined,
    ...initial,
  }
  ready = true
}

export function setTelemetryEnabled(on: boolean) {
  cfg.enabled = !!on
  try {
    localStorage.setItem('ibexicon:telemetry:enabled', String(on))
  } catch {
    // ignore setItem errors (quota, disabled storage)
  }
}

export function loadTelemetryEnabled(): boolean {
  try {
    const v = localStorage.getItem('ibexicon:telemetry:enabled')
    return v === 'true'
  } catch {
    return false
  }
}

type Sender = (payload: unknown) => void
function selectSender(): Sender {
  // No endpoint → noop (console in dev).
  if (!cfg.endpoint) {
    return (payload) => {
      if ((import.meta as any).env?.DEV) console.debug('[telemetry/noop]', payload) // dev only
    }
  }
  const url = cfg.endpoint
  return (payload) => {
    const body = JSON.stringify(payload)
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' })
      navigator.sendBeacon(url!, blob)
    } else {
      fetch(url!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      }).catch(() => {})
    }
  }
}

export function track(e: TelemetryEvent) {
  if (!ready) initTelemetry()
  if (!cfg.enabled || dntOn()) return
  // Construct minimal envelope
  const payload = {
    v: 1,
    app: 'ibexicon',
    ver: cfg.appVersion,
    t: Date.now(),
    id: getAnonId(),
    name: e.name,
    props: scrubProps(e.props),
  }
  selectSender()(payload)
}
