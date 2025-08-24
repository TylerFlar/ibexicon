import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App'
import './index.css'
import './app/styles.css'
import { mountAxe } from '@/app/a11y/devAxe'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Dev-only accessibility auditing
mountAxe()
