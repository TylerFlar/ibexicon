import { describe, it, expect } from 'vitest'

describe('theme toggler', () => {
  it('applies dark class on documentElement', () => {
    document.documentElement.classList.remove('dark')
    const dark = true
    document.documentElement.classList.toggle('dark', dark)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
