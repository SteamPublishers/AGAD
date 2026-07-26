/**
 * M2 gate: the Devices (sync) surface is reachable by a USER, in both tiers.
 *
 * Free build must show the locked upsell (the inert core shell), pro build must render the real
 * screen with working sync settings. Unit and DB tests prove replication works; this proves a person
 * can actually get to it — the difference between "wired" and "shipped".
 */
import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launchOffGrid } from './helpers/launch'
import { completeOnboarding } from './helpers/onboarding'
import { navButton } from './helpers/settings'
import { SyncEngine, type DeviceInfo } from '@offgrid/sync'
import { NodeTcpTransport } from '@offgrid/sync/node'

const PRO_PRESENT = fs.existsSync(path.resolve('pro/package.json'))

let app: ElectronApplication
let page: Page
let userDataDir: string
let syntheticPeer: SyncEngine | null = null

const launch = async (pro: '0' | '1'): Promise<void> => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `offgrid-devices-${pro}-`))
  if (pro === '1') {
    const modelsDir = path.join(userDataDir, 'models')
    const fileName = 'synthetic-transfer-q4.gguf'
    const bytes = Buffer.alloc(4096, 7)
    bytes.write('GGUF', 0, 'ascii')
    fs.mkdirSync(modelsDir, { recursive: true })
    fs.writeFileSync(path.join(modelsDir, fileName), bytes)
    fs.writeFileSync(
      path.join(modelsDir, 'downloaded-models.json'),
      JSON.stringify([
        {
          id: 'off-grid/synthetic-transfer',
          name: 'Synthetic Transfer Model',
          kind: 'text',
          files: [fileName]
        }
      ])
    )
  }
  app = await launchOffGrid({
    env: { OFFGRID_USER_DATA: userDataDir, OFFGRID_PRO: pro, NODE_ENV: 'production' }
  })
  page = await app.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForLoadState('domcontentloaded')
  await completeOnboarding(page)
  const dismissSetup = page.getByRole('button', { name: 'Dismiss' })
  if (await dismissSetup.isVisible().catch(() => false)) await dismissSetup.click()
  const expand = page.getByRole('button', { name: 'Expand sidebar' })
  if (await expand.isVisible().catch(() => false)) await expand.click()
}

/**
 * Open the sync-settings panel IDEMPOTENTLY. The header control is a toggle and the app instance is
 * shared across tests in this file, so a blind click can CLOSE a panel a previous test left open.
 */
const openSyncSettings = async (): Promise<void> => {
  const toggle = page.getByRole('button', { name: 'Sync settings' })
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
}

const teardown = async (): Promise<void> => {
  await syntheticPeer?.stop().catch(() => {})
  syntheticPeer = null
  await app?.close().catch(() => {})
  if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true })
}

test.describe('Devices surface — free tier', () => {
  test.beforeAll(async () => launch('0'))
  test.afterAll(teardown)

  test('shows Devices as a locked Pro item that opens the upgrade screen', async () => {
    const nav = navButton(page, 'Devices')
    await expect(nav).toBeVisible()
    await nav.click()
    // The inert shell: core advertises the feature and sells it, with no pro logic present.
    await expect(page.getByText('Your chats and settings, on every device.')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/devices-free-upgrade.png' })
  })
})

test.describe('Devices surface — pro tier', () => {
  test.beforeAll(async () => {
    test.skip(!PRO_PRESENT, 'pro package not present')
    await launch('1')
  })
  test.afterAll(teardown)

  test('renders the real Devices screen with live sync status', async () => {
    await navButton(page, 'Devices').click()
    await expect(page.getByRole('heading', { name: 'Devices', exact: true })).toBeVisible()
    // Status comes from the running SyncService over IPC — a bound port proves it actually started.
    await expect(page.getByText(/port \d+/)).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Paired devices' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Available on this network' })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/devices-pro.png' })
  })

  test('sync settings on the screen expose a toggle per replicated category', async () => {
    await navButton(page, 'Devices').click()
    await openSyncSettings()

    await expect(page.getByRole('heading', { name: 'Data sent from this device' })).toBeVisible()
    // One switch per user-facing category, plus the master switch.
    await expect(page.getByRole('switch', { name: 'Sync enabled' })).toBeVisible()
    for (const label of ['Sync Chats', 'Sync Projects', 'Sync Model settings']) {
      await expect(page.getByRole('switch', { name: label })).toBeVisible()
    }
    await page.screenshot({ path: 'e2e/screenshots/devices-sync-settings.png' })
  })

  test('pairs a real synthetic peer and opens the model transfer chooser', async () => {
    await navButton(page, 'Devices').click()
    const listening = page.getByText(/Listening on port \d+/)
    const text = await listening.textContent()
    const port = Number(text?.match(/port (\d+)/)?.[1])
    expect(port).toBeGreaterThan(0)
    const desktop = await page.evaluate(async () =>
      (
        window as unknown as {
          api: {
            proInvoke(channel: string): Promise<{ localDevice: DeviceInfo; port: number }>
          }
        }
      ).api.proInvoke('pro:sync:status')
    )

    const local: DeviceInfo = {
      id: 'synthetic-android',
      name: 'Synthetic Android',
      platform: 'android',
      version: 'test',
      host: '127.0.0.1',
      port: 0
    }
    syntheticPeer = new SyncEngine({
      localDevice: local,
      transport: new NodeTcpTransport()
    })
    await syntheticPeer.start(0)
    await syntheticPeer.pair(
      {
        ...desktop.localDevice,
        host: '127.0.0.1',
        port
      },
      'synthetic-pair-code'
    )

    await expect(
      page.getByRole('heading', { name: 'Synthetic Android wants to pair' })
    ).toBeVisible()
    await page.getByLabel('Incoming pairing code').fill('synthetic-pair-code')
    await page.getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByText('Synthetic Android').first()).toBeVisible()
    await expect(page.getByText('Connected', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: 'Send model' }).click()
    await expect(
      page.getByRole('heading', { name: 'Send a model to Synthetic Android' })
    ).toBeVisible()
    await expect(page.getByText('Synthetic Transfer Model')).toBeVisible()
    await expect(page.getByText('synthetic-transfer-q4.gguf')).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/devices-model-transfer.png' })
    await page.getByRole('button', { name: 'Close', exact: true }).first().click()
  })

  test('turning a category off persists across a screen change', async () => {
    await navButton(page, 'Devices').click()
    await openSyncSettings()
    const chats = page.getByRole('switch', { name: 'Sync Chats' })
    await expect(chats).toHaveAttribute('aria-checked', 'true')
    await chats.click()
    await expect(chats).toHaveAttribute('aria-checked', 'false')

    // Leave and come back: the preference is persisted in main, not just React state.
    await navButton(page, 'Models').click()
    await navButton(page, 'Devices').click()
    await openSyncSettings()
    await expect(page.getByRole('switch', { name: 'Sync Chats' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  test('sync also appears in Settings as its own section', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Device sync' })).toBeVisible()
  })
})
