const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

async function mount(t, { restored = { botId: 'b', threadId: 'previous-thread' }, waitForRestore } = {}) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  let state = {
    config: { apiUrl: 'https://example.com', locale: 'en', theme: 'light' },
    profile: { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org', organizations: [] }
  }
  const scope = () => JSON.stringify([state.config.apiUrl, 'tenant', 'user', state.profile.organizationId])
  const saved = new Map([[scope(), restored]])
  const view = { sidebar: null, chat: null, bosi: null, onboardingMounts: 0 }
  const i18n = { t: (key) => key, useLocale: () => 'en', setLocale() {}, localizeValidation() {}, clearValidation() {} }
  const imports = {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    './i18n': i18n,
    './host': {
      HostError: class HostError extends Error {},
      invoke: async (method, input) => {
        if (method === 'state') return state
        if (method === 'listBots')
          return [
            { id: 'a', name: 'A' },
            { id: 'b', name: 'B' }
          ]
        if (method === 'restoreSession') {
          if (waitForRestore) await waitForRestore
          return saved.get(scope()) ?? null
        }
        if (method === 'rememberSession') {
          saved.set(input.scope, input.session)
          return
        }
        if (method === 'selectOrganization') {
          state = { ...state, profile: { ...state.profile, organizationId: input } }
          return state
        }
        throw new Error(`Unexpected host call: ${method}`)
      }
    },
    './theme': { applyDesktopTheme() {} },
    './appearance-types': { defaultAppearance: () => ({}) },
    './app-activation': { subscribeAppActivation: () => () => {} },
    '@xpert-ai/shadcn-ui': { Button: 'button' },
    'lucide-react': { Bot: () => null, LoaderCircle: () => null },
    './Sidebar': {
      Sidebar: (props) => {
        view.sidebar = props
        return null
      }
    },
    './ChatPanel': {
      ChatPanel: (props) => {
        view.chat = props
        return React.createElement('div', { id: 'chat' }, `${props.bot.id}:${props.initialThread}`)
      }
    },
    './bosi/BosiOnboarding': {
      BosiOnboarding: (props) => {
        React.useEffect(() => {
          view.onboardingMounts++
        }, [])
        view.bosi = props
        return React.createElement('div', { id: 'onboarding' })
      }
    },
    './profile/PreviewScope': { AssistantPreviewScope: ({ children }) => children },
    './voice/VoiceProvider': { VoiceProvider: ({ children }) => children },
    './groups/CreateGroupDialog': { CreateGroupDialog: () => null },
    './ConnectionSettings': { ConnectionSettings: () => null },
    './Login': { Login: () => null },
    './CatalogDialog': { CatalogDialog: () => null }
  }
  const exports = {}
  runInNewContext(
    ts.transpileModule(readFileSync(join(__dirname, '../src/App.tsx'), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
    }).outputText,
    {
      exports,
      require: (id) => {
        if (Object.hasOwn(imports, id)) return imports[id]
        throw new Error(`Unexpected import: ${id}`)
      },
      window: dom.window,
      document: dom.window.document,
      matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
    }
  )
  let root
  const open = async () => {
    root = require('react-dom/client').createRoot(document.getElementById('root'))
    await React.act(() => root.render(React.createElement(React.StrictMode, null, React.createElement(exports.App))))
  }
  const reopen = async () => {
    await React.act(() => root.unmount())
    await open()
  }
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await open()
  return { view, saved, scope, reopen }
}

test('reopening resumes the last Assistant and changed thread without the Bosi default replacing it', async (t) => {
  const { view, saved, scope, reopen } = await mount(t)
  assert.equal(view.onboardingMounts, 0)
  assert.equal(view.chat.bot.id, 'b')
  assert.equal(view.chat.initialThread, 'previous-thread')
  const oldScopeChange = view.chat.onSessionChange
  const selectionVersion = view.chat.selectionVersion
  await React.act(() => view.chat.onSessionChange({ botId: 'b', threadId: 'new-thread' }))
  assert.equal(saved.get(scope()).threadId, 'new-thread')
  assert.equal(view.chat.selectionVersion, selectionVersion, 'saving navigation must not reset ChatKit')
  await reopen()
  assert.equal(view.chat.initialThread, 'new-thread')
  await React.act(() => view.sidebar.onSelect('a', null))
  await reopen()
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, null)
  await React.act(() => view.sidebar.onOrganization('another-org'))
  assert.ok(document.getElementById('onboarding'))
  await React.act(() => view.bosi.onReady('b', 'welcome'))
  assert.equal(view.chat.initialThread, 'welcome')
  await React.act(() => oldScopeChange({ botId: 'b', threadId: 'stale' }))
  assert.equal(saved.get(scope()).threadId, 'welcome', 'old account/org callbacks cannot replace the current scope')
  await React.act(() => view.sidebar.onOrganization('org'))
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, null)
})

test('startup waits for restore and still starts normal onboarding when there is no remembered session', async (t) => {
  let finish
  const waitForRestore = new Promise((resolve) => {
    finish = resolve
  })
  const { view } = await mount(t, { restored: null, waitForRestore })
  assert.equal(view.onboardingMounts, 0)
  assert.equal(view.chat, null)
  await React.act(() => finish())
  assert.ok(document.getElementById('onboarding'))
  await React.act(() => view.bosi.onReady('a', 'welcome-thread'))
  assert.equal(view.chat.bot.id, 'a')
  assert.equal(view.chat.initialThread, 'welcome-thread')
})
