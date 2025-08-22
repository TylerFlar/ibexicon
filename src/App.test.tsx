import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import App from '@/App'

describe('App', () => {
  it('renders Hello Solver text', () => {
    render(<App />)
    expect(screen.getByText(/Hello Solver/i)).toBeInTheDocument()
  })
})
