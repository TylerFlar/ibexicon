// Development-only accessibility auditing helper. We previously dynamically imported
// React and ReactDOM which caused a Vite warning about mixing static + dynamic imports
// of the same module. We now only lazy-load axe while using the already bundled React.
import React from 'react'
import * as ReactDOM from 'react-dom'

export async function mountAxe() {
  if (import.meta.env.PROD) return
  try {
    const { default: axe } = await import('@axe-core/react')
    axe(React, ReactDOM as any, 1000)
  } catch {
    // ignore loading errors (e.g. test / prod builds without dev deps)
  }
}
