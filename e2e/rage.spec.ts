import { test, expect, type Page } from '@playwright/test'

/**
 * End-to-end verification of the rage mechanics in a real browser.
 *
 * Each test asserts BOTH halves of a mechanic: that the infuriating behaviour
 * happens, and that the documented recovery path actually recovers. A mechanic
 * without a working escape hatch is a bug, not a joke.
 */

/**
 * Picks whichever of the two responsive nav affordances is on screen.
 * Uses `.or().filter({ visible })` rather than `isVisible()`, which samples
 * once and would pick the wrong one if the SPA has not painted yet.
 */
async function openPanel(page: Page, id: string) {
  await page
    .getByTestId(`nav-${id}`)
    .or(page.getByTestId(`tab-${id}`))
    .filter({ visible: true })
    .first()
    .click()
}

/** The first match that is actually rendered at this viewport. */
const visible = (page: Page, text: string) =>
  page.getByText(text).filter({ visible: true }).first()

/** Put the tenant back to its seeded state and dismiss the consent banner. */
async function reset(page: Page) {
  await page.request.post('/api/demo/reset')
  await page.request.patch('/api/settings', { data: { consent_state: 'declined' } })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await reset(page)
})

test('the app loads and the gateway renders its hero', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('governed')
  await expect(page.getByTestId('access-console')).toBeVisible()
})

test('mechanic A — the sign-in button relocates but the guest route always works', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByTestId('access-console')
  const before = await cta.boundingBox()

  await cta.click()
  await page.waitForTimeout(700)
  const after = await cta.boundingBox()
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeGreaterThan(20)

  // The escape hatch is present from the first paint and is never a dead end.
  await page.getByTestId('guest-entry').click()
  await expect(page).toHaveURL(/\/console/)
  await expect(page.getByText('Token allocations')).toBeVisible()
})

test('mechanic A — three clicks surface the readiness assessment, which is skippable', async ({ page }) => {
  await page.goto('/')
  const cta = page.getByTestId('access-console')
  for (let i = 0; i < 3; i++) {
    await cta.click()
    await page.waitForTimeout(450)
  }
  await expect(page.getByRole('dialog')).toContainText('Pre-Authentication Readiness Assessment')
  await page.getByRole('button', { name: 'Skip and continue as guest' }).click()
  await expect(page).toHaveURL(/\/console/)
})

test('mechanic C — literal search finds nothing, and the human-search recovery works', async ({ page }) => {
  await page.goto('/console')
  await page.getByTestId('alloc-search').fill('copilot')
  await page.getByTestId('alloc-search').press('Enter')

  await expect(page.getByText('Zero results, precisely')).toBeVisible()
  await expect(page.getByText(/Literal Interpretation Policy \(LIP-7\)/).first()).toBeVisible()

  await page.getByTestId('search-human').click()
  // The table and the mobile card list both render the row; one is CSS-hidden.
  await expect(visible(page, 'Customer Support Copilot')).toBeVisible()
})

test('mechanic C — the active filter returns everything until reinterpreted', async ({ page }) => {
  await page.goto('/console')
  await page.getByTestId('alloc-status').selectOption('active')
  await expect(page.getByText(/14 of 14 records/)).toBeVisible()
  await expect(page.getByText(/Clause 14\(b\)/)).toBeVisible()

  await page.getByTestId('interp-plain').click()
  await expect(page.getByText(/11 of 14 records/)).toBeVisible()
})

test('mechanic B — the theme toggle opens a form, and the form actually changes the theme', async ({ page }) => {
  await page.goto('/console')
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.getByTestId('console-theme').click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('Luminance Change Request')

  // Too short a justification is rejected client-side before submission.
  await dialog.getByLabel('Business justification').fill('too short')
  await dialog.getByRole('button', { name: 'Submit request' }).click()
  await expect(dialog).toContainText('at least 40 characters')

  await dialog
    .getByLabel('Business justification')
    .fill('Ambient illumination in our workspace exceeds the tolerances assumed by the dark theme.')
  await dialog.getByRole('checkbox').check()
  await dialog.getByRole('button', { name: 'Submit request' }).click()

  await expect(dialog.getByText('Request approved')).toBeVisible({ timeout: 15_000 })
  await expect(dialog).toContainText(/LCR-\d{4}-\d{5}-REV\.A/)
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('mechanic E — attestation stalls at 99% and certifies only with the phrase', async ({ page }) => {
  await page.goto('/console?panel=attestations')
  await page.getByTestId('attest-generate').click()

  await expect(page.getByTestId('attest-pct')).toHaveText('99%', { timeout: 20_000 })
  await expect(page.getByText('Secondary Attestor confirmation required')).toBeVisible()

  await page.getByTestId('attest-phrase').fill('yes')
  await page.getByTestId('attest-certify').click()
  await expect(page.getByText(/did not match/)).toBeVisible()

  await page.getByTestId('attest-phrase').fill('I am not a robot')
  await page.getByTestId('attest-certify').click()
  await expect(page.getByTestId('attest-pct')).toHaveText('100%')
})

test('mechanic F — the notice escalates on dismissal and the cessation request silences it', async ({ page }) => {
  await page.goto('/console')
  const toast = page.getByRole('status')
  // The tier label is uppercased by CSS, so match the DOM text case-insensitively.
  await expect(toast).toContainText(/tier 1 of 5/i)

  await page.getByTestId('nag-dismiss').click()
  await expect(toast).toContainText(/tier 2 of 5/i, { timeout: 20_000 })
  await page.getByTestId('nag-dismiss').click()
  await expect(toast).toContainText(/tier 3 of 5/i, { timeout: 20_000 })

  await page.getByTestId('nag-mute').click()
  await expect(toast).toBeHidden()
  await page.reload()
  await expect(page.getByRole('status')).toBeHidden()
})

test('mechanic H — the confirmation dialog decoys, and the quiet link really deletes', async ({ page }) => {
  await page.goto('/console')
  // Desktop exposes an icon button labelled "Deprovision <name>"; the mobile
  // card exposes one labelled just "Deprovision".
  await page.getByRole('button', { name: /^Deprovision/ }).first().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Cancel (Confirm)' }).click()
  await expect(dialog).toContainText('Nothing was deprovisioned')

  await page.getByTestId('deprovision-proceed').click()
  await expect(page.getByText(/13 of 13 records/)).toBeVisible({ timeout: 15_000 })
})

test('mechanic D — settings interlocks fire, are explained, and can be overridden', async ({ page }) => {
  await page.goto('/console?panel=settings')
  await page.getByRole('switch', { name: 'Compact density' }).click()

  await expect(page.getByText('An interlock was applied')).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Verbose Audit Banner' })).toHaveAttribute('aria-checked', 'true')

  await page.getByRole('switch', { name: 'Override all interlocks' }).click()
  await expect(page.getByText('Interlocks are off')).toBeVisible()
})

test('mechanic G — ARBITER replies in character and discloses its execution mode', async ({ page }) => {
  await page.goto('/console')
  await page.getByTestId('arbiter-open').click()
  await expect(page.getByText('deterministic engine')).toBeVisible()

  await page.getByTestId('arbiter-input').fill('why does the sign in button keep moving')
  await page.getByTestId('arbiter-input').press('Enter')

  // Assert on copy unique to ARBITER's reply — "guest" alone also appears in
  // the (viewport-dependent) tenant strip in the header.
  await expect(visible(page, 'Adaptive Affordance Programme')).toBeVisible({ timeout: 15_000 })
})

test('state persists across a full reload', async ({ page }) => {
  await page.goto('/console')
  await page.getByTestId('alloc-sort').selectOption('spend')
  await expect(page.getByText(/ordered by projected spend/i)).toBeVisible()

  await page.reload()
  await expect(page.getByText(/ordered by projected spend/i)).toBeVisible()
})

test('no critical console errors occur during a normal session', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByTestId('guest-entry').click()
  await expect(page.getByText('Token allocations')).toBeVisible()
  await openPanel(page, 'attestations')
  await openPanel(page, 'audit')
  await page.waitForTimeout(1500)

  // Vite's HMR websocket can be noisy in dev; ignore it, fail on anything else.
  const real = errors.filter((e) => !/websocket|hmr|vite/i.test(e))
  expect(real, `console errors: ${real.join(' | ')}`).toHaveLength(0)
})
