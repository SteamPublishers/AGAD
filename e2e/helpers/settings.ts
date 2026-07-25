import { expect, type Page } from '@playwright/test'

/**
 * Shared Settings navigation for E2E specs.
 *
 * Why this exists: Settings sections are a SINGLE-OPEN accordion group
 * (SettingsCardsGroup in src/renderer/src/components/SettingsCard.tsx). Opening one card
 * makes it the full-width L2 detail and EXIT-ANIMATES every sibling out of the DOM. Specs
 * that opened one section and then clicked another were clicking a card that was on its way
 * out — Playwright reported "element is not stable", then "element was detached from the
 * DOM", then timed out. That is what broke both Settings tests in tour.spec.ts.
 *
 * The fix is to model the real interaction: collapse the open detail (back to the grid)
 * before opening the next section. Every spec goes through these helpers so the next
 * section added gets the correct behaviour for free.
 */

const escapeForRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A primary-nav button, tier-agnostic. Locked Pro items compute an accessible name with a
 * "Pro" suffix ("Meetings Pro") because the lock badge is an <img alt="Pro">, so an exact
 * 'Meetings' match finds nothing in a free build — the drift that broke
 * meeting-transcription.spec.ts. Matches the label with or without the suffix.
 */
export const navButton = (page: Page, label: string) =>
  page.getByRole('button', { name: new RegExp(`^${escapeForRegExp(label)}( Pro)?$`) }).first()

/** Expand the sidebar (so nav labels are visible) and open the Settings screen. */
export const gotoSettings = async (page: Page): Promise<void> => {
  const expandSidebar = page.getByRole('button', { name: 'Expand sidebar' })
  if (await expandSidebar.isVisible().catch(() => false)) await expandSidebar.click()
  await page.getByRole('button', { name: 'Settings', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
}

/** The accordion header button for a section (its accessible name starts with the title). */
export const settingsSectionHeader = (page: Page, title: string) =>
  page.getByRole('button', { name: new RegExp(`^(All settings\\s*)?${escapeForRegExp(title)}`) })

/**
 * Collapse whichever section is currently the open detail, returning to the card grid.
 * Uses the group's own Cmd/Ctrl+] shortcut — the same seam the app ships — so this keeps
 * working if the header markup changes. No-op when nothing is open.
 */
export const closeSettingsSection = async (page: Page): Promise<void> => {
  const open = page.locator('button[aria-expanded="true"]')
  if ((await open.count()) === 0) return
  await page.keyboard.press('Control+]')
  await expect(open).toHaveCount(0)
}

/**
 * Open a Settings section by title and wait until its body is actually expanded.
 * Collapses any other open section first, because siblings are hidden while one is open.
 */
export const openSettingsSection = async (page: Page, title: string): Promise<void> => {
  await closeSettingsSection(page)
  const header = settingsSectionHeader(page, title)
  await expect(header).toBeVisible()
  await header.click()
  await expect(header).toHaveAttribute('aria-expanded', 'true')
}
