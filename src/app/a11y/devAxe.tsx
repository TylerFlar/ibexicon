export async function mountAxe() {
  if (import.meta.env.PROD) return
  try {
    const React = await import('react')
    const ReactDOM = await import('react-dom')
    const axe = await import('@axe-core/react')
    axe.default(React, ReactDOM, 1000)
  } catch {
    // ignore loading errors
  }
}
