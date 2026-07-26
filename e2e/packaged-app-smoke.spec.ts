/**
 * E2E against the INSTALLED, SIGNED app — not the repo build.
 *
 * Every other spec runs `electron .` over the source tree, which proves nothing about the
 * artifact users actually get: signing, notarization, the ASAR integrity fuses, the bundled
 * llama-server/whisper binaries and their @rpath closure only exist in the packaged .app.
 * This spec drives /Applications/Off Grid AI Desktop.app itself.
 *
 * OPT-IN by presence: skips when the app is not installed (so CI, which has no installed
 * app, is unaffected). Point it at a different bundle with OFFGRID_PACKAGED_APP=/path/to.app
 *
 * SAFETY: runs against a FRESH TEMP PROFILE via OFFGRID_USER_DATA, never the real
 * ~/Library/Application Support profile — no real chats, memories, or captures are touched
 * or screenshotted (CLAUDE.md: synthetic data only).
 *
 * PRECONDITION: the installed app must not already be running. It takes a single-instance
 * lock, so a second launch is redirected to the running copy and Playwright never gets a
 * window. The spec fails with that explanation rather than a bare timeout.
 */
import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { completeOnboarding } from './helpers/onboarding'
import { busyEnginePorts } from './helpers/ports'
import { GATEWAY_PORT } from '../src/shared/ports'

const APP_BUNDLE = process.env.OFFGRID_PACKAGED_APP ?? '/Applications/Off Grid AI Desktop.app'
const EXECUTABLE = path.join(APP_BUNDLE, 'Contents', 'MacOS', 'Off Grid AI Desktop')
const INSTALLED = process.platform === 'darwin' && fs.existsSync(EXECUTABLE)

/** Version recorded in the bundle's Info.plist (what the DMG claims to be). */
const bundleVersion = (): string =>
  execFileSync(
    '/usr/bin/defaults',
    ['read', path.join(APP_BUNDLE, 'Contents', 'Info.plist'), 'CFBundleShortVersionString'],
    { encoding: 'utf8' }
  ).trim()

let app: ElectronApplication
let page: Page
let userDataDir: string

test.beforeAll(async () => {
  test.skip(!INSTALLED, `no installed app at ${APP_BUNDLE} — packaged smoke skipped`)

  const busy = await busyEnginePorts()
  expect(
    busy,
    `The installed app appears to be running (${busy.join(', ')}). It holds a single-instance lock, so this launch would be redirected into the running copy and never get a window. Quit Off Grid AI Desktop and re-run.`
  ).toEqual([])

  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offgrid-packaged-e2e-'))
  app = await electron.launch({
    executablePath: EXECUTABLE, // the real signed binary; no `args: ['.']` — it loads its own asar
    env: {
      ...process.env,
      OFFGRID_USER_DATA: userDataDir, // never the real profile
      NODE_ENV: 'production'
    }
  })
  page = await app.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close().catch(() => {})
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true })
})

test('the signed app boots with a live renderer and preload bridge', async () => {
  // A crash, a failed asar-integrity check, or a broken preload all land here.
  await expect(page.locator('#root')).not.toBeEmpty()
  const hasApi = await page.evaluate(() => typeof (window as { api?: unknown }).api === 'object')
  expect(hasApi).toBe(true)
})

test('the running app reports the same version the bundle claims', async () => {
  // Guards a mis-stamped build: Info.plist and the runtime must agree, or the updater feed
  // and the About screen disagree about what is installed.
  const runtimeVersion = await app.evaluate(({ app: electronApp }) => electronApp.getVersion())
  expect(runtimeVersion).toBe(bundleVersion())
})

test('the packaged app uses the canonical product name', async () => {
  const name = await app.evaluate(({ app: electronApp }) => electronApp.getName())
  expect(name).toBe('Off Grid AI Desktop')
})

test('the bundled engine and helper binaries shipped inside the app', async () => {
  // The @rpath/dylib-staging failures that shipped broken releases were invisible until a
  // user launched the app. Assert the binaries exist inside the signed bundle.
  const resources = path.join(APP_BUNDLE, 'Contents', 'Resources')
  for (const relative of ['bin/llama/llama-server', 'bin/whisper/whisper-cli']) {
    expect(
      fs.existsSync(path.join(resources, relative)),
      `${relative} missing from the bundle`
    ).toBe(true)
  }
  // Every @rpath library the engine loads must be a REAL file beside it (not a dangling
  // symlink) — this is the exact 0.0.28 regression.
  const engine = path.join(resources, 'bin/llama/llama-server')
  const otool = execFileSync('/usr/bin/otool', ['-L', engine], { encoding: 'utf8' })
  const rpathLibs = [...otool.matchAll(/@rpath\/([^\s]+\.dylib)/g)].map((m) => m[1])
  expect(rpathLibs.length).toBeGreaterThan(0)
  for (const lib of rpathLibs) {
    const staged = path.join(path.dirname(engine), lib)
    expect(fs.statSync(staged).isFile(), `@rpath/${lib} is not a real staged file`).toBe(true)
  }
  // No foreign dependencies — a /opt/homebrew or /usr/local path does not exist on a user's Mac.
  expect(otool).not.toMatch(/\/opt\/homebrew|\/usr\/local/)
})

test('onboarding completes and the app shell renders in the packaged build', async () => {
  await completeOnboarding(page)
  // Free/unlicensed lands on Models; a licensed Mac build lands on Day. Accept either — this
  // asserts the shell rendered, not which tier the tester's license grants.
  const shell = page
    .getByRole('heading', { name: 'Models' })
    .or(page.getByRole('navigation', { name: 'Primary navigation' }))
  await expect(shell.first()).toBeVisible()
  await page.screenshot({ path: 'e2e/screenshots/packaged-app-shell.png' })
})

test('system health reports its components from the packaged app', async () => {
  const health = await page.evaluate(async () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).api?.systemHealth?.()
  )
  expect(health).toBeTruthy()
  const ids = (health.components as { id: string }[]).map((c) => c.id)
  expect(ids).toContain('chat')
  expect(ids).toContain('gateway')
})

test('the packaged gateway serves its OpenAI-compatible surface', async () => {
  // The gateway binds the canonical port when free (auto-falling back when not); we asserted
  // the ports were free in beforeAll, so it should own this one.
  await expect
    .poll(
      async () =>
        fetch(`http://127.0.0.1:${GATEWAY_PORT}/health`)
          .then((response) => response.ok)
          .catch(() => false),
      { timeout: 20_000 }
    )
    .toBe(true)

  const models = await fetch(`http://127.0.0.1:${GATEWAY_PORT}/v1/models`).then((r) => r.json())
  expect(models.object).toBe('list')
})
