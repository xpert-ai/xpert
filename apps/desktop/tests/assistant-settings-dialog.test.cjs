const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createRequire } = require('node:module')
const { dirname, resolve } = require('node:path')
const { JSDOM } = require('jsdom')
const { createAssistantListMethods } = require('../electron/assistant-list.cjs')

const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
const desktop = resolve(__dirname, '..')
const renderer = esbuild.buildSync({
  stdin: {
    contents: `export { AssistantSettingsDialog } from './src/assistant-settings/AssistantSettingsDialog'
      export { createElement, StrictMode } from 'react'
      export { createRoot } from 'react-dom/client'
      export { flushSync } from 'react-dom'`,
    resolveDir: desktop
  },
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'settingsTest',
  alias: {
    react: dirname(require.resolve('react/package.json')),
    'react-dom': dirname(require.resolve('react-dom/package.json')),
    '@xpert-ai/shadcn-ui': resolve(desktop, 'src/ui.ts'),
    '@': resolve(desktop, '../../packages/shadcn-ui/src')
  },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.glob': 'emptyPortraitAssets' },
  banner: { js: 'const emptyPortraitAssets = () => ({})' }
}).outputFiles[0].text

const configuration = {
  canEdit: true,
  revision: 'original',
  workspace: { name: 'Workspace' },
  modelId: 'model',
  prompt: 'Original prompt',
  capabilities: [],
  preflight: { canInstall: true, models: [{ id: 'model' }], optionalCapabilities: [] }
}

function mount(t, readConfiguration, appearanceHost) {
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'http://localhost',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  })
  const { window } = dom
  const { document } = window
  const bot = { id: 'assistant', name: 'Assistant', description: 'Original' }
  const service = {
    ...createAssistantListMethods(Error),
    config: { apiUrl: 'http://localhost' },
    profile: { user: { id: 'sample', tenantId: 'tenant' }, organizationId: 'org' },
    sidebars: {},
    bots: [bot],
    sourceBots: [bot],
    persist() {}
  }
  const calls = []
  const saved = []
  window.TextDecoder = TextDecoder
  if (appearanceHost) {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} })
    window.ResizeObserver = window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
  window.xpertDesktop = {
    async invoke(method, input) {
      calls.push({ method, input })
      if (method === 'assistantConfiguration') return { ok: true, value: await readConfiguration() }
      if (method === 'editBot') return { ok: true, value: service.editBot(input) }
      if (method === 'saveAssistantConfiguration') return { ok: true, value: { botId: bot.id } }
      if (appearanceHost) return { ok: true, value: await appearanceHost(method, input) }
      throw new Error('Unexpected host call: ' + method)
    }
  }
  window.eval(renderer)
  const { createRoot, createElement, StrictMode, flushSync, AssistantSettingsDialog } = window.settingsTest
  const root = createRoot(document.getElementById('root'))
  t.after(() => {
    root.unmount()
    window.close()
  })
  flushSync(() =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(AssistantSettingsDialog, {
          bot,
          webUrl: 'http://localhost',
          onClose: () => root.render(null),
          onDescriptionSaved: (id, description) => saved.push({ id, description }),
          onSaved: async (id) => saved.push({ id, published: true })
        })
      )
    )
  )
  const buttons = (selector) => [...document.querySelectorAll(selector)]
  function tab(name) {
    const trigger = buttons('[role="tab"]').find((item) => item.textContent === name)
    flushSync(() => trigger.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 })))
    assert.equal(trigger.getAttribute('aria-selected'), 'true')
  }
  function type(id, value) {
    const field = document.getElementById(id)
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(field, value)
    flushSync(() => field.dispatchEvent(new window.Event('input', { bubbles: true })))
  }
  function submit() {
    const button = document.querySelector('button[type="submit"]')
    assert.equal(button.disabled, false)
    flushSync(() => button.click())
  }
  return { document, service, calls, saved, tab, type, submit }
}

const image = { url: '/portrait.png', appearance: { version: 1, kind: 'image' } }
const pet = {
  url: '/preview.png',
  appearance: { version: 1, kind: 'pet', id: 'pet', asset: { type: 'animated-image', url: '/animation.gif' } }
}
function openAppearance(t, avatar) {
  const ui = mount(t, undefined, (method) => {
    if (method === 'assistantAppearance') return { revision: 'initial', name: 'Assistant', canEdit: true, avatar }
    if (method === 'assistantPetCatalog') return []
    if (method === 'saveAssistantAppearance') return {}
    throw new Error('Unexpected call: ' + method)
  })
  const button = (name) => [...ui.document.querySelectorAll('button')].find((item) => item.textContent === name)
  button('Customize your assistant').click()
  return { ...ui, button }
}

for (const [kind, avatar] of Object.entries({ image, pet, default: {}, emoji: { emoji: { id: 'smile' } } })) {
  test('changing the shared color preserves the ' + kind + ' avatar without uploading media', async (t) => {
    const ui = openAppearance(t, avatar)
    await t.waitFor(() => assert.ok(ui.button('Save') && !ui.button('Save').disabled))
    ui.document.querySelector('button[aria-label="#5297d8"]').click()
    await t.waitFor(() => assert.equal(ui.document.querySelector('input[type=color]').value, '#5297d8'))
    ui.button('Save').click()
    await t.waitFor(() => assert.equal(ui.saved.length, 1))
    const writes = ui.calls.filter(({ method }) => method.startsWith('save') || method.startsWith('upload'))
    assert.equal(writes.length, 1)
    assert.equal(writes[0].method, 'saveAssistantAppearance')
    assert.deepEqual(JSON.parse(JSON.stringify(writes[0].input.avatar)), { ...avatar, background: '#5297d8' })
  })
}

test('a saved character color carries through a preset to the default avatar', async (t) => {
  const ui = openAppearance(t, { appearance: { version: 1, kind: 'character', id: 'bosi', color: '#123456' } })
  const color = () => ui.document.querySelector('input[type=color]').value
  await t.waitFor(() => assert.equal(color(), '#123456'))
  ui.button('Ember').click()
  await t.waitFor(() => assert.equal(ui.button('Ember').getAttribute('aria-pressed'), 'true'))
  assert.equal(color(), '#123456')
  ui.button('Default avatar').click()
  await t.waitFor(() => assert.equal(ui.button('Default avatar').getAttribute('aria-pressed'), 'true'))
  assert.equal(color(), '#123456')
  ui.button('Save').click()
  await t.waitFor(() => assert.equal(ui.saved.length, 1))
  assert.deepEqual(JSON.parse(JSON.stringify(ui.calls.at(-1).input.avatar)), { background: '#123456' })
})

for (const first of [null, 'Instructions', 'Model & capabilities']) {
  test('profile persists locally ' + (first ? 'while loading ' + first : 'without opening shared tabs'), async (t) => {
    const pending = Promise.withResolvers()
    const ui = mount(t, () => pending.promise)
    assert.equal(ui.calls.length, 0)
    if (first) {
      ui.tab(first)
      assert.ok(ui.document.querySelector('[role="tabpanel"][data-state="active"] [role="status"]'))
      ui.tab(first === 'Instructions' ? 'Model & capabilities' : 'Instructions')
      ui.tab('Profile')
      assert.deepEqual(
        ui.calls.map(({ method }) => method),
        ['assistantConfiguration']
      )
    }
    assert.equal(ui.document.querySelector('[role="status"]'), null)
    ui.type('edit-assistant-description', 'New local description')
    ui.submit()
    await t.waitFor(() => assert.ok(!ui.document.querySelector('[role="dialog"]')))
    assert.equal(ui.service.sidebarState().items[0].profile.description, 'New local description')
    assert.deepEqual(ui.saved, [{ id: 'assistant', description: 'New local description' }])
    pending.resolve(configuration)
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(
      ui.calls.map(({ method }) => method),
      first ? ['assistantConfiguration', 'editBot'] : ['editBot']
    )
  })
}

test('saving a local description keeps pending prompt edits for explicit publication', async (t) => {
  const ui = mount(t, async () => configuration)
  ui.tab('Instructions')
  await t.waitFor(() => assert.ok(ui.document.getElementById('edit-assistant-prompt')))
  ui.type('edit-assistant-prompt', 'Shared draft')
  ui.tab('Profile')
  ui.type('edit-assistant-description', 'New local description')
  ui.submit()
  await t.waitFor(() => assert.equal(ui.saved.length, 1))
  ui.tab('Instructions')
  assert.equal(ui.document.getElementById('edit-assistant-prompt').value, 'Shared draft')
  assert.equal(ui.document.querySelector('button[type="submit"]').textContent, 'Save & publish')
  ui.submit()
  await t.waitFor(() => assert.ok(!ui.document.querySelector('[role="dialog"]')))
  assert.deepEqual(
    ui.calls.map(({ method }) => method),
    ['assistantConfiguration', 'editBot', 'saveAssistantConfiguration']
  )
  assert.equal(ui.calls.at(-1).input.revision, configuration.revision)
  assert.equal(ui.calls.at(-1).input.prompt, 'Shared draft')
})

test('a denied shared configuration does not prevent local changes', async (t) => {
  const ui = mount(t, async () => ({ canEdit: false }))
  ui.tab('Instructions')
  await t.waitFor(() => assert.match(ui.document.body.textContent, /requires workspace edit access/))
  assert.equal(ui.document.getElementById('edit-assistant-prompt'), null)
  ui.tab('Profile')
  ui.type('edit-assistant-description', '')
  ui.submit()
  await t.waitFor(() => assert.ok(!ui.document.querySelector('[role="dialog"]')))
  assert.equal(ui.service.sidebarState().items[0].profile.description, '')
  assert.deepEqual(
    ui.calls.map(({ method }) => method),
    ['assistantConfiguration', 'editBot']
  )
})
