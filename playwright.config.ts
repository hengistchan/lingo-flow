import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL: 'http://localhost:4179',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chromium',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'python3 -m http.server 4179 --directory apps/extension/.output/chrome-mv3',
    url: 'http://localhost:4179/popup.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
})
