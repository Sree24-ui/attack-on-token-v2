/**
 * Captures the README screenshots from the running app.
 *   npm run dev          (in another terminal)
 *   npm run screenshots
 */
import { chromium } from 'playwright-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:5180'
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  ['01-gateway', '/', 1440, 900, null],
  ['02-console-allocations', '/console', 1440, 900, null],
  ['03-luminance-request', '/console', 1440, 900, 'theme'],
  ['04-attestation-99', '/console?panel=attestations', 1440, 900, 'attest'],
  ['05-audit-trail', '/console?panel=audit', 1440, 900, null],
  ['06-settings-interlocks', '/console?panel=settings', 1440, 900, 'interlock'],
  ['07-arbiter', '/console', 1440, 900, 'arbiter'],
  ['08-mobile-console', '/console', 390, 844, null],
]

const browser = await chromium.launch()
const ctx = await browser.newContext({ deviceScaleFactor: 2 })
const page = await ctx.newPage()

await page.goto(BASE)
await page.request.post(`${BASE}/api/demo/reset`)
await page.request.patch(`${BASE}/api/settings`, { data: { consent_state: 'declined' } })

for (const [name, path, w, h, action] of SHOTS) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto(BASE + path)
  await page.waitForTimeout(1200)

  if (action === 'theme') {
    await page.getByTestId('console-theme').click()
    await page.waitForTimeout(600)
  }
  if (action === 'attest') {
    await page.getByTestId('attest-generate').click()
    await page.getByTestId('attest-pct').filter({ hasText: '99%' }).waitFor({ timeout: 20_000 })
    await page.waitForTimeout(400)
  }
  if (action === 'interlock') {
    await page.getByRole('switch', { name: 'Compact density' }).click()
    await page.waitForTimeout(800)
  }
  if (action === 'arbiter') {
    await page.getByTestId('arbiter-open').click()
    await page.getByTestId('arbiter-input').fill('why does the sign in button keep moving')
    await page.getByTestId('arbiter-input').press('Enter')
    await page.waitForTimeout(1500)
  }

  await page.screenshot({ path: `${OUT}${name}.png` })
  console.log(`captured ${name}.png`)
}

await browser.close()
await fetch(`${BASE}/api/demo/reset`, { method: 'POST' })
console.log('demo state reset')
