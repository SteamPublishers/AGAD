import { _electron as electron, type ElectronApplication } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
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

/**
 * Seed a cached Pro license into the launch profile so pro-dependent specs can run against the
 * PACKAGED build.
 *
 * Why this is needed: getForcedProActivation (src/main/bootstrap/pro-activation.ts) honours
 * OFFGRID_PRO=1 only when NOT packaged — a shipped app deliberately cannot be unlocked by an env
 * var, it must satisfy a real license check. So in a packaged run every pro spec failed with
 * "No handler registered for 'vault:init' / 'clipboard:list'", because pro never activated.
 *
 * Why a CACHED fixture rather than activating per run: each spec uses a fresh temp profile, and
 * Keygen claims a machine slot per device fingerprint. Activating per launch would register a new
 * machine on every app start (20+ per suite run). Instead we activate ONCE out-of-band and copy
 * the resulting license.json + device-fingerprint in, so every run reuses the SAME machine slot
 * and validates offline from cache — zero additional activations.
 *
 * Seeded ONLY when the spec asks for pro (OFFGRID_PRO=1). Specs that pass OFFGRID_PRO=0 assert
 * free-tier UI (locked tabs, upgrade screens) and must stay unlicensed — '0' forces free even
 * when packaged, so those stay deterministic.
 *
 * The fixture lives OUTSIDE the repo (default ~/.offgrid-e2e-license) and holds a real license
 * key — never commit it, never print its contents.
 */
const LICENSE_FIXTURE_FILES = ['license.json', 'device-fingerprint']

export const licenseFixtureDir = (): string =>
  process.env.OFFGRID_E2E_LICENSE_FIXTURE ?? path.join(os.homedir(), '.offgrid-e2e-license')

export const licenseFixtureAvailable = (): boolean =>
  LICENSE_FIXTURE_FILES.every((f) => fs.existsSync(path.join(licenseFixtureDir(), f)))

const seedLicense = (env: Record<string, string>): void => {
  const userDataDir = env.OFFGRID_USER_DATA
  if (!userDataDir || env.OFFGRID_PRO !== '1' || !licenseFixtureAvailable()) return
  fs.mkdirSync(userDataDir, { recursive: true })
  for (const file of LICENSE_FIXTURE_FILES) {
    fs.copyFileSync(path.join(licenseFixtureDir(), file), path.join(userDataDir, file))
  }
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
    // A packaged build ignores OFFGRID_PRO=1, so pro specs need a real cached license.
    seedLicense(env)
    // A packaged app loads its own app.asar — passing '.' would point it at the repo instead.
    return electron.launch({ executablePath: packagedExecutable(), args: extraArgs, env })
  }
  return electron.launch({ args: ['.', ...extraArgs], env })
}
