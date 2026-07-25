import { defineConfig } from '@playwright/test'

// Electron E2E. We drive the real app via Playwright's Electron support and read
// the renderer DOM directly (no OCR needed — it's a Chromium page). Single worker:
// each spec launches its own Electron instance against a fresh userData dir.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  // Retry in CI only. The blocker keeping the CI e2e job advisory is headless-Electron
  // launch instability on the ubuntu runner (waitForEvent 'window' timeouts,
  // "page/context closed"), not product failures — a whole-instance launch failure is
  // exactly the kind of thing a retry clears. Locally retries stay off, so a flake a dev
  // introduces is visible immediately instead of being papered over.
  retries: process.env.CI ? 2 : 0,
  reporter: 'list'
})
