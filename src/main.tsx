import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import { initTelemetry, loadTelemetryEnabled, track } from '@/telemetry'
import './index.css'
import './app/styles.css'
import { mountAxe } from '@/app/a11y/devAxe'

// Telemetry (opt-in, privacy respecting)
initTelemetry({ enabled: loadTelemetryEnabled() })
try {
  track({ name: 'app_open', props: { ua: navigator.userAgent.slice(0, 64) } })
} catch {
  // ignore telemetry errors
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Dev-only accessibility auditing
mountAxe()
