// Native regression/performance fixture: production renderer, preload and activation bridge.
// IPC uses 96 synthetic templates with 200 ms page latency; no account or network access.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { setTimeout: delay } = require('node:timers/promises')
const { installWindowActivation } = require('../../electron/window-activation.cjs')

const profile = mkdtempSync(join(tmpdir(), 'bosi-catalog-test-'))
app.setPath('userData', profile)
app.setName('Bosi catalog regression')
const started = Number(process.env.BOSI_CATALOG_LAUNCHED_AT) || Date.now()
const templates = Array.from({ length: 96 }, (_, index) => ({
  id: `fixture-${index}`,
  name: `Template ${String(index + 1).padStart(2, '0')}`,
  kind: 'templates',
  source: index < 90 ? 'agent-plugin' : 'plugin',
  publisher: 'Test fixture',
  description: 'A synthetic assistant template for catalog performance testing.',
  categories: ['operations'],
  tags: [],
  avatarUrl: null,
  avatarEmoji: null
}))
const calls = []
const failures = []
let window
let activations = 0
const count = (method) => calls.filter((call) => call.method === method).length
const request = async (method, argument) => {
  calls.push({ method, at: Date.now() })
  switch (method) {
    case 'refreshProfile':
    case 'state':
      return {
        config: {
          apiUrl: 'https://fixture.invalid',
          webUrl: 'https://fixture.invalid',
          frameUrl: '',
          locale: 'en',
          theme: 'light'
        },
        profile: {
          user: { id: 'fixture', name: 'Fixture user', tenantId: 'fixture', avatarUrl: null },
          organizationId: 'fixture',
          organizations: Array.from({ length: 8 }, (_, index) => ({
            id: index ? 'fixture-' + index : 'fixture',
            name: 'Fixture organization ' + index
          }))
        },
        localLoginAvailable: false
      }
    case 'listBotPage':
      return { bots: [], next: null, awaitingSavedBot: false }
    case 'listBots':
    case 'listGroups':
    case 'botActivity':
    case 'discoveryWorkspaces':
    case 'listCatalog':
      return []
    case 'notificationRefresh':
    case 'notificationSnapshot':
    case 'restoreSession':
      return null
    case 'sidebarState':
      return { width: 300, collapsed: false, sections: [], items: [], copies: [] }
    case 'bosiSetup':
      return { assistantId: null, capabilities: [], progress: null, setup: { models: [], defaultModelId: '' } }
    case 'shellState':
      return { available: false, enabled: false, connected: false, settings: null }
    case 'templateCatalogPage': {
      await delay(200)
      const offset = argument?.offset || 0
      return {
        items: templates.slice(offset, offset + 48),
        nextOffset: offset + 48 < templates.length ? offset + 48 : null
      }
    }
    default:
      throw new Error(`Unexpected fixture request: ${method}`)
  }
}
ipcMain.handle('xpert:request', async (_event, method, argument) => {
  try {
    return { ok: true, value: await request(method, argument) }
  } catch (error) {
    failures.push(error.message)
    return { ok: false, message: error.message, status: 500 }
  }
})
ipcMain.handle('xpert:template-link-read', () => null)
ipcMain.handle('xpert:update', () => ({ status: 'disabled', currentVersion: 'test' }))
const js = (source) => window.webContents.executeJavaScript(source)
async function foregroundWindow() {
  if (!window.isVisible()) window.show()
  const deadline = Date.now() + 10000
  let nextRequest = 0
  let page
  do {
    page = await js('({ visibility: document.visibilityState, focused: document.hasFocus() })')
    if (window.isFocused() && page.visibility === 'visible' && page.focused) return
    if (Date.now() >= nextRequest) {
      // macOS may hand focus to another app after show() has already returned.
      if (!window.isFocused() || page.visibility !== 'visible') {
        app.focus({ steal: true })
        window.moveTop()
        window.focus()
      } else if (!page.focused) {
        window.webContents.focus()
      }
      nextRequest = Date.now() + 250
    }
    await delay(20)
  } while (Date.now() < deadline)
  throw new Error(
    `Window did not reach the foreground: nativeFocus=${window.isFocused()}, page=${JSON.stringify(page)}`
  )
}
const paint = async () => {
  await foregroundWindow()
  return Promise.race([
    js('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))'),
    delay(5000).then(() => {
      throw new Error('Renderer did not paint within 5 seconds')
    })
  ])
}
async function until(source, timeout = 10000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const result = await js(source)
    if (result) return result
    await delay(20)
  }
  throw new Error(`Timed out: ${source}`)
}
async function click(selector) {
  await until(`!!document.querySelector(${JSON.stringify(selector)})`)
  const point = await js(
    `(() => { const node = document.querySelector(${JSON.stringify(selector)}); node.scrollIntoView({block:'nearest'}); const r = node.getBoundingClientRect(); return {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)} })()`
  )
  window.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  window.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
  window.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
}
const cardCount = `Array.from(document.querySelectorAll('button')).filter(n => n.textContent.trim() === 'View template').length`
async function openTemplates() {
  await click('[aria-label="Add to workspace"]')
  await until(
    `Array.from(document.querySelectorAll('[role="menuitem"]')).some(n => n.textContent.includes('Discover & add'))`
  )
  await js(
    `Array.from(document.querySelectorAll('[role="menuitem"]')).find(n => n.textContent.includes('Discover & add')).click()`
  )
  await click('[role="tab"][id$="trigger-templates"]')
}
async function checkOrganizationHover() {
  await click('[aria-label="Switch organization or workspace"]')
  await until("document.activeElement?.getAttribute('aria-label') === 'Search workspaces'")
  await delay(150)
  const rect = (selector) =>
    until(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    return element && element.getBoundingClientRect().toJSON()
  })()`)
  const trigger = await rect('[role="dialog"] [data-slot="dropdown-menu-trigger"]')
  const move = (x, y) => window.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y) })
  const x = trigger.left + 18
  const y = trigger.top + trigger.height / 2
  move(x, y)
  await until('!!document.querySelector(\'[role="menuitemradio"]\')')
  await delay(150)
  const item = await rect('[role="menuitemradio"]:nth-child(2)')
  for (let step = 1; step <= 30; step++) {
    move(x + ((item.left + item.width / 3 - x) * step) / 30, y + ((item.top + item.height / 2 - y) * step) / 30)
    await delay(40)
  }
  assert.equal(
    await js('document.querySelector(\'[role="menu"]\')?.dataset.state'),
    'open',
    'slow diagonal travel must reach the organization list'
  )
  move(5, 5)
  await until('!document.querySelector(\'[role="menu"]\')')
}
async function run() {
  await app.whenReady()
  window = new BrowserWindow({
    width: 1440,
    height: 1000,
    webPreferences: {
      preload: join(__dirname, '../../electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  const step = (label) => console.log(`Native catalog: ${label}`)
  // Deny external resources, including any accidental real backend request.
  window.webContents.session.webRequest.onBeforeRequest((details, done) =>
    done({ cancel: !/^(file:|data:|blob:)/.test(details.url) })
  )
  window.webContents.on('render-process-gone', (_event, details) => failures.push(details.reason))
  installWindowActivation(window)
  let hidden = false
  window.on('blur', () => {
    hidden = true
  })
  window.on('focus', () => {
    if (hidden) activations++
    hidden = false
  })
  await window.loadFile(join(__dirname, '../../dist/index.html'))
  step('renderer loaded')
  await until(`!!document.querySelector('[aria-label="Add to workspace"]')`)
  await paint()
  step('shell painted')
  if (process.argv.includes('--workspace-hover')) {
    await checkOrganizationHover()
    assert.deepEqual(failures, [])
    step('workspace submenu stayed open during diagonal travel')
    return
  }
  const startupMs = Date.now() - started
  const firstStart = Date.now()
  await openTemplates()
  await until(`${cardCount} >= 48`)
  await paint()
  const firstPageMs = Date.now() - firstStart
  await until(`${cardCount} === 96`)
  await paint()
  const allPagesMs = Date.now() - firstStart
  step('96 templates painted')
  assert.equal(count('templateCatalogPage'), 2)
  await js(
    `window.catalogProbe = {card: Array.from(document.querySelectorAll('button')).find(n => n.textContent.trim() === 'View template'), blanked: false}; window.catalogProbe.panel = window.catalogProbe.card.closest('[role="tabpanel"]'); window.catalogProbe.panel.scrollTop = 250; new MutationObserver(() => { if (!window.catalogProbe.card.isConnected) window.catalogProbe.blanked = true }).observe(document.body,{childList:true,subtree:true})`
  )
  const baseline = count('templateCatalogPage')
  // A fully covered macOS window stops painting even when it still owns keyboard focus.
  if (process.platform === 'darwin') window.setAlwaysOnTop(true)
  const beforeActivations = activations
  const returns = []
  for (let index = 0; index < 5; index++) {
    const previousActivations = activations
    window.hide()
    await until(`document.visibilityState === 'hidden' && !document.hasFocus()`)
    assert.equal(window.isFocused(), false, 'the hidden window must lose native focus')
    await delay(150)
    const start = Date.now()
    await paint()
    assert.ok(activations > previousActivations, `foreground ${index + 1} must deliver a native reactivation`)
    returns.push(Date.now() - start)
    step(`foreground ${index + 1}`)
    await delay(250)
    assert.equal(await js('window.catalogProbe.card.isConnected'), true)
  }
  assert.equal(count('templateCatalogPage'), baseline)
  assert.equal(await js('window.catalogProbe.blanked'), false)
  assert.equal(await js('window.catalogProbe.panel.scrollTop'), 250)
  const switchStart = Date.now()
  await click('[role="tab"][id$="trigger-applications"]')
  await click('[role="tab"][id$="trigger-templates"]')
  await until(`${cardCount} === 96`)
  await paint()
  const cachedTabMs = Date.now() - switchStart
  assert.equal(count('templateCatalogPage'), baseline)
  await click('[aria-label="Refresh catalog"]')
  await delay(250)
  assert.equal(await js(cardCount), 96, 'manual refresh must retain every existing card between pages')
  await until(`!document.querySelector('[aria-label="Refresh catalog"]').disabled`)
  assert.equal(count('templateCatalogPage'), baseline + 2)
  await click('[aria-label="Close discovery"]')
  await until(`!document.querySelector('[aria-label="Refresh catalog"]')`)
  const reopenStart = Date.now()
  await openTemplates()
  await until(`${cardCount} === 96`)
  await paint()
  const reopenMs = Date.now() - reopenStart
  assert.equal(count('templateCatalogPage'), baseline + 4, 'a newly opened dialog intentionally loads a fresh catalog')
  assert.deepEqual(failures, [])
  const result = {
    startupMs,
    firstPageMs,
    allPagesMs,
    cachedTabMs,
    reopenMs,
    foregroundMs: returns,
    foregroundRequests: 0,
    nativeActivations: activations - beforeActivations,
    templates: 96,
    pageLatencyMs: 200
  }
  if (process.env.BOSI_CATALOG_REPORT) writeFileSync(process.env.BOSI_CATALOG_REPORT, JSON.stringify(result, null, 2))
  if (process.env.BOSI_CATALOG_SCREENSHOT)
    writeFileSync(process.env.BOSI_CATALOG_SCREENSHOT, (await window.webContents.capturePage()).toPNG())
  console.log(JSON.stringify(result, null, 2))
}
run().then(
  () => app.quit(),
  (error) => {
    console.error(error)
    app.exit(1)
  }
)
app.on('will-quit', () => rmSync(profile, { recursive: true, force: true }))
