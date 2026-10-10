const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const React = require('react')
const { installWindowActivation } = require('../electron/window-activation.cjs')

function renderer(file, imports = {}, globals = {}) {
  const exports = {}
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  runInNewContext(code, {
    exports,
    require(id) {
      if (Object.hasOwn(imports, id)) return imports[id]
      if (id === 'react' || id === 'react/jsx-runtime') return require(id)
      throw new Error(`Unexpected import: ${id}`)
    },
    ...globals
  })
  return exports
}

test('native reactivation is separate from iframe focus and disposes with its window', () => {
  const window = new EventEmitter()
  const sent = []
  window.webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: (channel) => sent.push(channel)
  })
  installWindowActivation(window)
  window.emit('focus')
  window.webContents.emit('blur')
  window.webContents.emit('focus')
  assert.equal(sent.length, 0)
  window.emit('blur')
  window.emit('focus')
  window.emit('focus')
  assert.deepEqual(sent, ['xpert:window-activated'])
  window.emit('closed')
  assert.equal(window.listenerCount('focus'), 0)
  assert.equal(window.listenerCount('blur'), 0)
})

test('browser fallback responds only to a hidden tab becoming visible', () => {
  const { subscribeAppActivation } = renderer('app-activation.ts')
  const page = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  let refreshes = 0
  const unsubscribe = subscribeAppActivation(() => refreshes++, {}, page)
  for (let i = 0; i < 4; i++) {
    page.dispatchEvent(new Event('focus'))
    page.dispatchEvent(new Event('visibilitychange'))
  }
  assert.equal(refreshes, 0)
  page.visibilityState = 'hidden'
  page.dispatchEvent(new Event('visibilitychange'))
  page.visibilityState = 'visible'
  page.dispatchEvent(new Event('visibilitychange'))
  page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(refreshes, 1)
  unsubscribe()
  page.visibilityState = 'hidden'
  page.dispatchEvent(new Event('visibilitychange'))
  page.visibilityState = 'visible'
  page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(refreshes, 1)
})

test('native sidebar consumes host snapshots without a renderer timer, including while hidden', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(dom.window.document, 'visibilityState', { value: 'hidden', configurable: true })
  const listeners = new Set()
  const activations = new Set()
  dom.window.xpertDesktop = {
    onAssistantActivityChanged: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    onWindowActivated: (listener) => {
      activations.add(listener)
      return () => activations.delete(listener)
    }
  }
  const timer = t.mock.method(dom.window, 'setInterval')
  const calls = []
  let unread = 2
  const globals = { window: dom.window, document: dom.window.document }
  const { useAssistantList } = renderer(
    'useAssistantList.ts',
    {
      './host': {
        invoke: async (method, input) => {
          calls.push({ method, input })
          if (method === 'botActivity') return [{ xpertId: 'a', unreadMessages: unread }]
          if (method === 'sidebarState') return { items: [], copies: [], sections: [] }
          throw new Error(`Unexpected host call: ${method}`)
        }
      },
      './i18n': { t: (key) => key },
      './app-activation': renderer('app-activation.ts', {}, globals)
    },
    globals
  )
  function Probe() {
    const list = useAssistantList('organization', 'a')
    return React.createElement('span', { id: 'unread' }, list.activities[0]?.unreadMessages)
  }
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  t.after(async () => {
    await React.act(() => root.unmount())
    assert.equal(listeners.size, 0)
    assert.equal(activations.size, 0)
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await React.act(() => root.render(React.createElement(Probe)))
  assert.equal(document.getElementById('unread').textContent, '2')
  assert.equal(timer.mock.callCount(), 0)
  unread = 5
  await React.act(() => listeners.forEach((listener) => listener()))
  assert.equal(document.getElementById('unread').textContent, '5')
  assert.equal(calls.at(-1).input.refresh, false, 'host change notifications only read the shared snapshot')
  await React.act(() => activations.forEach((listener) => listener()))
  assert.equal(calls.at(-1).input.refresh, true, 'native activation requests a fresh count')
  assert.equal(timer.mock.callCount(), 0)
})

test('sidebar ignores DOM focus and keeps rows and conversation mounted during native background refresh', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const activations = new Set()
  dom.window.xpertDesktop = {
    onWindowActivated: (listener) => {
      activations.add(listener)
      return () => activations.delete(listener)
    }
  }
  let now = 10_000
  const globals = {
    window: dom.window,
    document: dom.window.document,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    Date: { now: () => now }
  }
  const activation = renderer('app-activation.ts', {}, globals)
  const calls = []
  const bots = [{ id: 'bosi', name: 'Bosi' }]
  let deferred
  let delay = false
  const host = {
    HostError: class HostError extends Error {},
    invoke: async (method) => {
      calls.push(method)
      if (method === 'state')
        return {
          config: { apiUrl: 'http://localhost/', locale: 'en', theme: 'light' },
          profile: { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org', organizations: [] }
        }
      if (method === 'listBots')
        return delay
          ? new Promise((resolve, reject) => {
              deferred = { resolve, reject }
            })
          : bots
      if (method === 'sidebarState') return { items: [], copies: [], sections: [] }
      if (method === 'botActivity') return []
      throw new Error(`Unexpected host call: ${method}`)
    }
  }
  const i18n = { t: (key) => key, useLocale: () => 'en', setLocale() {}, localizeValidation() {}, clearValidation() {} }
  const { useAssistantList } = renderer(
    'useAssistantList.ts',
    {
      './host': host,
      './i18n': i18n,
      './app-activation': activation
    },
    globals
  )
  const { App } = renderer(
    'App.tsx',
    {
      './host': host,
      './i18n': i18n,
      './app-activation': activation,
      './theme': { applyDesktopTheme() {} },
      './appearance-types': { defaultAppearance: () => ({}) },
      '@xpert-ai/shadcn-ui': { Button: 'button' },
      'lucide-react': { Bot: () => null, LoaderCircle: () => null },
      './Sidebar': {
        Sidebar: ({ bots, pending, error, onRefresh }) => {
          useAssistantList('binding', bots.map((bot) => bot.id).join(','))
          return React.createElement(
            'aside',
            null,
            pending
              ? 'loading'
              : bots.map((bot) => React.createElement('div', { key: bot.id, id: 'bot-row' }, bot.name)),
            error && React.createElement('span', { role: 'alert' }, error),
            React.createElement('button', { id: 'refresh', onClick: onRefresh }, 'Refresh')
          )
        }
      },
      './bosi/BosiOnboarding': {
        BosiOnboarding: ({ onReady }) =>
          React.createElement('button', { id: 'ready', onClick: () => onReady('bosi', null) }, 'Ready')
      },
      './groups/CreateGroupDialog': { CreateGroupDialog: () => null },
      './groups/GroupChatPanel': { GroupChatPanel: () => null },
      './ChatPanel': { ChatPanel: () => React.createElement('iframe', { title: 'Chat', id: 'chat' }) },
      './profile/PreviewScope': { AssistantPreviewScope: ({ children }) => children },
      './voice/VoiceProvider': { VoiceProvider: ({ children }) => children },
      './ConnectionSettings': { ConnectionSettings: () => null },
      './Login': { Login: () => null },
      './CatalogDialog': { CatalogDialog: () => null }
    },
    globals
  )
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  t.after(async () => {
    await React.act(() => root.unmount())
    assert.equal(activations.size, 0)
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await React.act(() => root.render(React.createElement(App)))
  await React.act(() => document.getElementById('ready').click())
  const count = (method) => calls.filter((value) => value === method).length
  const baseline = { bots: count('listBots'), activity: count('botActivity') }
  const row = document.getElementById('bot-row')
  const chat = document.getElementById('chat')
  await React.act(() => {
    for (let i = 0; i < 3; i++) {
      now += 2_000
      window.dispatchEvent(new dom.window.Event('blur'))
      window.dispatchEvent(new dom.window.Event('focus'))
    }
  })
  assert.equal(count('listBots'), baseline.bots)
  assert.equal(count('botActivity'), baseline.activity)
  delay = true
  await React.act(() => activations.forEach((listener) => listener()))
  assert.equal(count('listBots'), baseline.bots + 1)
  assert.equal(count('botActivity'), baseline.activity + 1)
  assert.equal(document.getElementById('bot-row'), row)
  assert.equal(document.getElementById('chat'), chat)
  now += 2_000
  await React.act(() => activations.forEach((listener) => listener()))
  assert.equal(count('listBots'), baseline.bots + 1, 'coalesces a pending list refresh')
  await React.act(() => deferred.resolve([{ id: 'bosi', name: 'Updated Bosi' }]))
  assert.equal(document.getElementById('bot-row'), row)
  assert.equal(row.textContent, 'Updated Bosi')
  assert.equal(document.getElementById('chat'), chat)
  now += 2_000
  await React.act(() => activations.forEach((listener) => listener()))
  await React.act(() => deferred.reject(new Error('Temporary failure')))
  assert.equal(document.getElementById('bot-row'), row)
  assert.equal(document.querySelector('[role=alert]'), null)
  await React.act(() => document.getElementById('refresh').click())
  assert.match(document.querySelector('aside').textContent, /loading/)
  await React.act(() => deferred.resolve(bots))
  assert.equal(document.getElementById('bot-row').textContent, 'Bosi')
})
