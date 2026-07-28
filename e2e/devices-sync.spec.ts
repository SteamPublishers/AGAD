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
import { randomUUID } from 'node:crypto'
import { launchOffGrid } from './helpers/launch'
import { completeOnboarding } from './helpers/onboarding'
import { navButton } from './helpers/settings'
import {
  createKnowledgeDocumentStateFields,
  FileTransferManager,
  OpLog,
  StateSync,
  SyncEngine,
  type DeviceInfo,
  type Materializer
} from '@offgrid/sync'
import { NodeTcpTransport } from '@offgrid/sync/node'
import { createKnowledgeDocumentSource } from '../pro/main/sync/knowledge-document-transfer'
import type { KnowledgeDocumentSnapshot } from '../src/main/sync-knowledge-document'

const PRO_PRESENT = fs.existsSync(path.resolve('pro/package.json'))
const SYNCED_PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const SYNCED_CONVERSATION_ID = '33333333-3333-4333-8333-333333333333'
const SYNCED_MESSAGE_ID = '44444444-4444-4444-8444-444444444444'

let app: ElectronApplication
let page: Page
let userDataDir: string
let syntheticPeer: SyncEngine | null = null
let syntheticState: StateSync | null = null
let syntheticFiles: FileTransferManager | null = null
const syntheticRecords = new Map<
  string,
  { entity: string; entityId: string; fields: Record<string, unknown> }
>()

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
  const tab = page.getByRole('button', { name: 'Sync sharing' })
  if ((await tab.getAttribute('aria-current')) !== 'page') await tab.click()
  await expect(tab).toHaveAttribute('aria-current', 'page')
}

const teardown = async (): Promise<void> => {
  await syntheticPeer?.stop().catch(() => {})
  syntheticPeer = null
  syntheticState = null
  await syntheticFiles?.dispose().catch(() => {})
  syntheticFiles = null
  syntheticRecords.clear()
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
    await expect(page.getByText('LAN + nearby ready')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: 'Personal mesh' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Available on this network' })).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/devices-pro.png' })
  })

  test('sync settings on the screen expose a toggle per replicated category', async () => {
    await navButton(page, 'Devices').click()
    await openSyncSettings()

    await expect(page.getByRole('heading', { name: 'Data sent from this device' })).toBeVisible()
    // One switch per user-facing category, plus the master switch.
    await expect(page.getByRole('switch', { name: 'Sync enabled' })).toBeVisible()
    for (const label of [
      'Sync Chats',
      'Sync Projects',
      'Sync Model settings',
      'Sync Copied text'
    ]) {
      await expect(page.getByRole('switch', { name: label })).toBeVisible()
    }
    await expect(page.getByRole('switch', { name: 'Sync Copied text' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await page.screenshot({ path: 'e2e/screenshots/devices-sync-settings.png' })
  })

  test('pairs a real peer and converges projects and chats through the rendered app', async () => {
    await navButton(page, 'Devices').click()
    await page
      .getByRole('navigation', { name: 'Devices control center' })
      .getByRole('button', { name: 'Devices', exact: true })
      .click()
    const desktop = await page.evaluate(async () =>
      (
        window as unknown as {
          api: {
            proInvoke(channel: string): Promise<{ localDevice: DeviceInfo; port: number }>
          }
        }
      ).api.proInvoke('pro:sync:status')
    )
    expect(desktop.port).toBeGreaterThan(0)

    const local: DeviceInfo = {
      id: 'synthetic-android',
      name: 'Synthetic Android',
      platform: 'android',
      version: 'test',
      host: '127.0.0.1',
      port: 0
    }

    const materializer: Materializer = {
      put: (entity, entityId, fields) => {
        syntheticRecords.set(`${entity}:${entityId}`, { entity, entityId, fields })
      },
      remove: (entity, entityId) => {
        syntheticRecords.delete(`${entity}:${entityId}`)
      }
    }
    const syntheticLog = new OpLog({
      deviceId: local.id,
      materializer,
      uuid: randomUUID,
      now: Date.now
    })
    syntheticState = new StateSync({
      oplog: syntheticLog,
      send: (deviceId, message) => {
        syntheticPeer?.sendApp(deviceId, 'state', message)
      }
    })
    syntheticFiles = new FileTransferManager({
      send: (deviceId, message) => syntheticPeer?.send(deviceId, message) ?? false,
      createSink: async () => null
    })
    syntheticPeer = new SyncEngine({
      localDevice: local,
      transport: new NodeTcpTransport(),
      onMessage: (deviceId, message) => syntheticFiles?.handleMessage(deviceId, message),
      onAppMessage: (deviceId, channel, data) => {
        if (channel === 'state') syntheticState?.onMessage(deviceId, data)
      },
      onPaired: (device) => syntheticState?.onConnect(device.id)
    })
    await syntheticPeer.start(0)
    await syntheticPeer.pair(
      {
        ...desktop.localDevice,
        host: '127.0.0.1',
        port: desktop.port
      },
      'synthetic-pair-code'
    )

    await expect(
      page.getByRole('heading', { name: 'Synthetic Android wants to pair' })
    ).toBeVisible()
    await page.getByRole('textbox', { name: 'Incoming pairing code' }).fill('synthetic-pair-code')
    await page.getByRole('button', { name: 'Accept' }).click()
    await expect(page.getByText('Synthetic Android').first()).toBeVisible()
    await expect(page.getByText('Connected · LAN', { exact: true })).toBeVisible()
    await expect.poll(() => syntheticPeer?.isPaired(desktop.localDevice.id)).toBe(true)

    await page.getByRole('button', { name: 'Rescan network' }).click()
    await expect(page.getByRole('button', { name: 'Rescan network' })).toBeEnabled()
    await expect(page.getByText('Synthetic Android').first()).toBeVisible()
    await expect(page.getByText('Scanning LAN and Nearby routes.')).toHaveCount(0)
    await expect(page.getByRole('alert')).toHaveCount(0)

    const timestamp = new Date().toISOString()
    const inboundOps = [
      syntheticLog.record('project', SYNCED_PROJECT_ID, 'put', {
        name: 'Synced from phone',
        description: 'A project delivered over encrypted device sync.',
        system_prompt: '',
        icon: null,
        include_memory: 1,
        created_at: timestamp,
        updated_at: timestamp
      }),
      syntheticLog.record('conversation', SYNCED_CONVERSATION_ID, 'put', {
        title: 'Cross-device notes',
        project_id: SYNCED_PROJECT_ID,
        created_at: timestamp,
        updated_at: timestamp
      }),
      syntheticLog.record('message', SYNCED_MESSAGE_ID, 'put', {
        conversation_id: SYNCED_CONVERSATION_ID,
        role: 'user',
        content: 'This arrived over encrypted sync.',
        context: null,
        created_at: timestamp
      })
    ]
    expect(
      syntheticPeer.sendApp(desktop.localDevice.id, 'state', { t: 'ops', ops: inboundOps })
    ).toBe(true)
    await expect
      .poll(async () => {
        const status = await page.evaluate(async () =>
          (
            window as unknown as {
              api: { proInvoke(channel: string): Promise<{ ops: number }> }
            }
          ).api.proInvoke('pro:sync:status')
        )
        return status.ops
      })
      .toBeGreaterThanOrEqual(inboundOps.length)

    await navButton(page, 'Projects').click()
    const syncedProject = page.getByRole('button', { name: 'Synced from phone' })
    await expect(syncedProject).toBeVisible()
    await syncedProject.click()
    await expect(page.getByRole('button', { name: /Cross-device notes/ })).toBeVisible()

    await page.getByRole('button', { name: 'Knowledge & settings', exact: true }).click()
    await expect(page.getByText('No documents yet.')).toBeVisible()
    const knowledgePath = path.join(userDataDir, 'launch-brief.txt')
    const knowledgeBytes = Buffer.from(
      'Launch brief from the phone contains enough text to create a knowledge chunk.'
    )
    fs.writeFileSync(knowledgePath, knowledgeBytes)
    const knowledgeDocument: KnowledgeDocumentSnapshot = {
      syncId: randomUUID(),
      projectId: SYNCED_PROJECT_ID,
      name: path.basename(knowledgePath),
      filePath: knowledgePath,
      fileSize: knowledgeBytes.length,
      createdAt: timestamp,
      enabled: true
    }
    await syntheticFiles.sendFile(
      desktop.localDevice.id,
      createKnowledgeDocumentSource(knowledgeDocument)
    )
    const knowledgeOp = syntheticLog.record(
      'knowledge_document',
      knowledgeDocument.syncId,
      'put',
      createKnowledgeDocumentStateFields(knowledgeDocument)
    )
    expect(
      syntheticPeer.sendApp(desktop.localDevice.id, 'state', {
        t: 'ops',
        ops: [knowledgeOp]
      })
    ).toBe(true)
    await expect(page.getByText(knowledgeDocument.name, { exact: true })).toBeVisible({
      timeout: 15_000
    })
    await expect(
      page.getByRole('button', { name: `Disable ${knowledgeDocument.name}`, exact: true })
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: `Delete ${knowledgeDocument.name}`, exact: true })
    ).toBeVisible()
    await page.screenshot({ path: 'e2e/screenshots/devices-state-sync.png' })

    await page.getByTitle('New project').click()
    await page.getByPlaceholder('Project name…').fill('Created on desktop')
    await page.getByPlaceholder('Project name…').press('Enter')
    await expect(page.getByRole('button', { name: 'Created on desktop' })).toBeVisible()
    await expect
      .poll(() =>
        [...syntheticRecords.values()].some(
          (record) => record.entity === 'project' && record.fields.name === 'Created on desktop'
        )
      )
      .toBe(true)

    await navButton(page, 'Devices').click()
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
    const clipboard = page.getByRole('switch', { name: 'Sync Copied text' })
    await expect(chats).toHaveAttribute('aria-checked', 'true')
    await expect(clipboard).toHaveAttribute('aria-checked', 'false')
    await chats.click()
    await clipboard.click()
    await expect(chats).toHaveAttribute('aria-checked', 'false')
    await expect(clipboard).toHaveAttribute('aria-checked', 'true')

    // Leave and come back: the preference is persisted in main, not just React state.
    await navButton(page, 'Models').click()
    await navButton(page, 'Devices').click()
    await openSyncSettings()
    await expect(page.getByRole('switch', { name: 'Sync Chats' })).toHaveAttribute(
      'aria-checked',
      'false'
    )
    await expect(page.getByRole('switch', { name: 'Sync Copied text' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('sync also appears in Settings as its own section', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
    await expect(page.getByRole('heading', { name: 'Device sync' })).toBeVisible()
  })
})
