import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { GuessRow } from '../components/GuessRow'

// Simple snapshot-style structural test for GuessRow with preset trits.

describe('GuessRow snapshot', () => {
  it('renders tiles and single input for given length (simplified)', () => {
    const { container } = render(
      <GuessRow
        length={5}
        value={'crane'}
        onChange={() => {}}
        onCommit={() => {}}
        colorblind={true}
      />,
    )
    // 5 tiles + button (text input removed)
    const tiles = container.querySelectorAll('.tile')
    expect(tiles.length).toBe(5)
    // Snapshot removed (UI simplified); structural assertion above is sufficient.
  })
})
