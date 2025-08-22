import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '@/App'

describe('App', () => {
  it('renders Ibexicon header and loads manifest placeholder', async () => {
    // mock fetch for manifest + wordlist (optional follow-up fetches ignored)
    const fetchMock = vi.fn((url: any) => {
      const u = url.toString()
      if (u.endsWith('manifest.json')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              lengths: [5],
              vocab: { 5: 3 },
              tokenTotals: { 5: 100 },
              meta: {
                alpha: 0.5,
                muFactorShort: 0.05,
                muFactorLong: 0.1,
                longThreshold: 8,
                tau: 1.0,
                builtAt: '2025-01-01T00:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        )
      } else if (u.endsWith('en-5.txt')) {
        return Promise.resolve(new Response('abc\nabd\nabx\n', { status: 200 }))
      } else if (u.endsWith('en-5-priors.json')) {
        return Promise.resolve(
          new Response(JSON.stringify({ abc: 0.34, abd: 0.33, abx: 0.33 }), { status: 200 }),
        )
      }
      return Promise.resolve(new Response('', { status: 404 }))
    })
    // Assign to globalThis for cross-env (node, browser-like) safety
    ;(globalThis as any).fetch = fetchMock

    render(<App />)
    expect(screen.getByText(/Ibexicon/i)).toBeInTheDocument()
    // length button appears after async manifest load
    expect(await screen.findByRole('button', { name: '5' })).toBeInTheDocument()
  })
})
