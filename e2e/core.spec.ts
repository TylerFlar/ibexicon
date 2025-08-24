import { test, expect } from '@playwright/test'

// Core happy-path: start a session, enter a guess, cycle a tile state, submit, and see suggestions.
test('start session, enter guess, cycle tiles, get suggestions', async ({ page }) => {
  await page.goto('/')
  // Wait for Start button directly (UI shell)
  const startBtn = page.getByRole('button', { name: /^start$/i })
  await startBtn.waitFor({ state: 'visible', timeout: 20000 })
  await startBtn.click()
  // Type a 5-letter guess; dataset default length assumed 5.
  await page.keyboard.type('crane')
  // Tiles can always be cycled via space; older UI had an explicit 'Colors' mode toggle.
  // That toggle no longer exists, so we skip it.
  // Focus first tile and cycle twice (space)
  const firstTile = page.getByRole('button', { name: /position 1/i }).first()
  await firstTile.focus()
  await page.keyboard.press('Space')
  await page.keyboard.press('Space')
  // Commit guess
  await page.getByRole('button', { name: /add guess/i }).click()
  // Suggestions section should appear
  const suggestionsSection = page.getByRole('region', { name: /suggestions/i })
  await expect(suggestionsSection).toBeVisible()
  // If table not yet present, trigger ranking explicitly
  const rankBtn = page.getByRole('button', { name: /rank suggestions/i })
  if (await rankBtn.isVisible()) {
    await rankBtn.click()
  }
  // Wait for suggestions table
  const table = suggestionsSection.getByRole('table', { name: /suggestions table/i })
  await expect(table).toBeVisible({ timeout: 20_000 })
})
