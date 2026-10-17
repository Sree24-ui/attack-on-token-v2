import { defineConfig, devices } from '@playwright/test'

/**
 * Drives the real app against the real API. The dev server is started for you;
 * if one is already running on 5180 it is reused.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5180',
    // Without this a blocked click hangs until the whole test times out,
    // which hides *what* was covering the element.
    actionTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    // Pixel 7 is a Chromium profile: this exercises the responsive layout
    // without needing a second browser engine installed.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5180',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
