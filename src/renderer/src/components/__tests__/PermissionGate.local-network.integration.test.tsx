// @vitest-environment jsdom

/**
 * Local Network recovery through the rendered Pro setup journey. macOS owns the permission and
 * System Settings; the Electron preload is the only controlled boundary.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionGate } from '../PermissionGate'

let openLocalNetworkSettings: ReturnType<typeof vi.fn>

beforeEach(() => {
  openLocalNetworkSettings = vi.fn(async () => true)
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: {
      isPro: true,
      getPermissionStatus: async () => ({
        accessibility: true,
        screenRecording: true,
        localNetwork: false,
        allGranted: false
      }),
      checkModelStatus: async () => ({ downloaded: true, modelsDir: '/tmp/models' }),
      getActiveModel: async () => null,
      getModelVisionStatus: async () => ({}),
      proInvoke: async (channel: string) =>
        channel === 'capture:status' ? { running: false, paused: false, visionReady: true } : null,
      proOn: () => () => {},
      onModelProgress: () => () => {},
      openLocalNetworkSettings,
      setupPlan: async () => null,
      getLlmSettings: async () => ({ performanceMode: 'balanced' })
    }
  })
})

afterEach(() => cleanup())

describe('<PermissionGate/> Local Network recovery', () => {
  it('keeps the app usable and routes the setup action to macOS Local Network settings', async () => {
    const user = userEvent.setup()
    render(
      <PermissionGate>
        <div>App shell</div>
      </PermissionGate>
    )

    expect(await screen.findByText('App shell')).toBeTruthy()
    expect(await screen.findByText('Allow Local Network access')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Set up' }))

    expect(await screen.findByRole('heading', { name: 'Local Network' })).toBeTruthy()
    expect(screen.getByText('Find and sync directly with your devices')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Open Local Network settings' }))
    expect(openLocalNetworkSettings).toHaveBeenCalledOnce()
  })
})
