import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as T from '@/telemetry'

// Ensure sendBeacon exists for jsdom environment
if (!(navigator as any).sendBeacon) {
  ;(navigator as any).sendBeacon = () => true
}

describe('telemetry gating', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // Reset possible DNT flags
    ;(navigator as any).doNotTrack = '0'
    ;(window as any).doNotTrack = '0'
    ;(navigator as any).globalPrivacyControl = false
    T.initTelemetry({ enabled: false, endpoint: '/noop' })
  })
  it('does not send when disabled', () => {
    const sp = vi.spyOn(navigator as any, 'sendBeacon').mockImplementation(() => true)
    T.track({ name: 'app_open', props: {} })
    expect(sp).not.toHaveBeenCalled()
  })
  it('sends when enabled and DNT off', () => {
    const sp = vi.spyOn(navigator as any, 'sendBeacon').mockImplementation(() => true)
    T.setTelemetryEnabled(true)
    ;(navigator as any).doNotTrack = '0'
    T.track({ name: 'suggest_requested', props: { length: 5, S: 123, policy: 'composite' } })
    expect(sp).toHaveBeenCalled()
  })
  it('does not send when DNT on even if enabled', () => {
    const sp = vi.spyOn(navigator as any, 'sendBeacon').mockImplementation(() => true)
    T.setTelemetryEnabled(true)
    ;(navigator as any).doNotTrack = '1'
    T.track({ name: 'suggest_requested', props: { length: 5, S: 10, policy: 'composite' } })
    expect(sp).not.toHaveBeenCalled()
  })
})
