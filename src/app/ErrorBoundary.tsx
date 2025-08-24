import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: unknown) {
    // eslint-disable-next-line no-console -- intentional one-time surfaced error for diagnostics
    console.error(err)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <h2 className="font-semibold mb-2">Something went wrong</h2>
          <p className="text-sm text-neutral-500 mb-4">Try restarting the session.</p>
          <button
            className="px-4 py-2 rounded-md bg-red-600 text-white"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
