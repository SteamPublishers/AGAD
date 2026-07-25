import { _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The ONE seam every spec launches the app through.
 *
 * Two targets, chosen by env so the same specs verify both:
 *
 *   (default)                     -> the DEV build: `electron .` over the source tree
 *   OFFGRID_E2E_TARGET=packaged   -> the PRODUCTION build: the installed, signed, notarized
 *                                    .app bundle
 *
 * Why it matters: a green dev-build run says nothing about the artifact users install. Signing,
 * notarization, the ASAR integrity fuses, and the bundled llama-server/whisper binaries with
 * their @rpath closure only exist in the packaged app — and that is precisely where releases
 * have broken before. Specs previously hardcoded `args: ['.']`, so the production build could
 * not be exercised at all.
 *
 * Callers pass only what varies (env, extra Chromium flags); the target decision lives here,
 * so adding a target needs no spec changes.
 */

const PACKAGED_BUNDLE = process.env.OFFGRID_PACKAGED_APP ?? '/Applications/Off Grid AI Desktop.app'

export const packagedExecutable = (): string =>
  path.join(PACKAGED_BUNDLE, 'Contents', 'MacOS', 'Off Grid AI Desktop')

export const targetIsPackaged = (): boolean => process.env.OFFGRID_E2E_TARGET === 'packaged'

export const packagedAppBundle = (): string => PACKAGED_BUNDLE

/** Reason the packaged target can't run, or null when it can. */
export const packagedTargetUnavailable = (): string | null => {
  if (!targetIsPackaged()) return null
  if (process.platform !== 'darwin') return 'the packaged target is macOS-only'
  if (!fs.existsSync(packagedExecutable())) {
    return `no installed app at ${PACKAGED_BUNDLE} (set OFFGRID_PACKAGED_APP to point elsewhere)`
  }
  return null
}

export interface LaunchOptions {
  env?: Record<string, string | undefined>
  /** Extra Chromium/Electron flags (e.g. fake media devices). Applied to both targets. */
  extraArgs?: string[]
}

export const launchOffGrid = async (options: LaunchOptions = {}): Promise<ElectronApplication> => {
  const env = { ...process.env, ...options.env } as Record<string, string>
  const extraArgs = options.extraArgs ?? []

  if (targetIsPackaged()) {
    const unavailable = packagedTargetUnavailable()
    if (unavailable) throw new Error(`Cannot launch the packaged app: ${unavailable}`)
    // A packaged app loads its own app.asar — passing '.' would point it at the repo instead.
    return electron.launch({ executablePath: packagedExecutable(), args: extraArgs, env })
  }
  return electron.launch({ args: ['.', ...extraArgs], env })
}
