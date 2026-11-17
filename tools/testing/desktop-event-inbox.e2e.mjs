import { test } from 'node:test'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { chromium, expect } from '@playwright/test'
import { preview } from 'vite'

const { DEFAULT_CONFIG } = createRequire(import.meta.url)('../../apps/desktop/electron/service.cjs')

// Exercise App navigation in the built Bosi renderer. IPC uses a signed-in test profile.
test('opening a group from the Dock exits the personal event inbox and reveals the group chat', async (t) => {
  const server = await preview({
    root: resolve(import.meta.dirname, '../../apps/desktop'),
    configFile: false,
    preview: { host: '127.0.0.1', port: 0 },
    logLevel: 'error'
  })
  t.after(() => new Promise((resolve) => server.httpServer.close(resolve)))
  const browser = await chromium.launch()
  t.after(() => browser.close())
  const page = await browser.newPage()
  await page.addInitScript((config) => {
    const profile = {
      user: { id: 'reader', tenantId: 'tenant', name: 'Reviewer' },
      organizationId: 'org',
      organizations: [{ id: 'org', name: 'Workspace' }]
    }
    const responses = {
      state: { config: { ...config, locale: 'en' }, profile },
      discoveryWorkspaces: [],
      listGroups: [],
      sidebarState: { items: [], sections: [], copies: [], width: 280, collapsed: false },
      listBotPage: { bots: [], next: null, awaitingSavedBot: false },
      personalInboxViews: []
    }
    window.xpertDesktop = {
      invoke: async (method) => ({ ok: true, value: responses[method] ?? null }),
      onDockNavigate: (_binding, callback) => {
        const navigate = (event) => callback(event.detail)
        window.addEventListener('test-dock-navigation', navigate)
        return () => window.removeEventListener('test-dock-navigation', navigate)
      }
    }
  }, DEFAULT_CONFIG)
  await page.goto(server.resolvedUrls.local[0])
  await page.getByRole('button', { name: 'User menu: Reviewer' }).click()
  await page.getByRole('menuitem', { name: 'My events' }).click()
  const inbox = page.getByRole('heading', { name: 'My events' })
  await expect(inbox).toBeVisible()
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent('test-dock-navigation', {
        detail: { kind: 'group', id: 'group' }
      })
    )
  )
  await expect(page.getByRole('region', { name: 'Group conversation' })).toBeVisible()
  await expect(inbox).toHaveCount(0)
})
