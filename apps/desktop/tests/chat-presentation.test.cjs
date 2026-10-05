const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const React = require('react')
const defaults = require('../electron/theme-defaults.json')
const { DEFAULT_CONFIG } = require('../electron/service.cjs')

function loadRenderer(file, imports, globals = {}) {
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src', file), 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true
    }
  }).outputText
  const exports = {}
  runInNewContext(code, {
    exports,
    require(id) {
      if (Object.hasOwn(imports, id)) return imports[id]
      throw new Error(`Unexpected renderer import: ${id}`)
    },
    ...globals
  })
  return exports
}

test('bubble preferences reach initial and live ChatKit options without remounting the conversation', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  const received = []
  class ChatKitElement extends dom.window.HTMLElement {
    setOptions(options) {
      received.push(options)
    }
  }
  dom.window.customElements.define('xpertai-chatkit', ChatKitElement)
  const theme = loadRenderer('theme.ts', {
    '../electron/theme-defaults.json': defaults,
    './appearance-types': { defaultAppearance: () => structuredClone(defaults.appearance) }
  })
  let computerOpens = 0
  let appearanceDialog
  let appearanceSaves = 0
  let navigate
  const shell = {
    handlers: {},
    dialog: null,
    computer: { name: 'My Mac', status: 'ready' },
    openComputer: () => computerOpens++
  }
  const { ChatPanel } = loadRenderer(
    'ChatPanel.tsx',
    {
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      './WorkspaceConnection': { useWorkspaceConnection: () => ({ connect() {}, status: null }) },
      './avatar/AssistantAppearanceDialog': {
        AssistantAppearanceDialog: (props) => {
          appearanceDialog = props
          return null
        }
      },
      '../electron/connection/urls.mjs': { apiRootUrl: (url) => url },
      './files/DeliveredFile': { useDeliveredFile: () => ({ open() {}, dialog: null }) },
      './workbench': {
        createWorkbenchHandler: (_botId, _url, onSession) => {
          navigate = onSession
          return () => {}
        }
      },
      './shell/useShellIntegration': { useShellIntegration: () => shell },
      './i18n': { t: (key) => key },
      '@xpert-ai/chatkit-web-component': {},
      '@xpert-ai/shadcn-ui': { Button: 'button' },
      'lucide-react': { LoaderCircle: () => null },
      './host': {
        invoke: () => {
          throw new Error('No host requests expected')
        }
      },
      './theme': theme
    },
    { window: dom.window, document: dom.window.document, queueMicrotask }
  )
  let appearance = structuredClone(defaults.appearance)
  appearance.chatkit.messagePresentation = 'bubbles'
  const render = () =>
    root.render(
      React.createElement(ChatPanel, {
        bot: { id: 'test-bot', name: 'Test assistant' },
        config: { ...DEFAULT_CONFIG, appearance },
        dark: false,
        initialThread: 'existing-thread',
        onConversationRead() {},
        onAppearanceSaved: async () => appearanceSaves++
      })
    )
  await React.act(render)
  const element = document.querySelector('xpertai-chatkit')
  assert.ok(element)
  assert.equal(received[0].messagePresentation.mode, 'bubbles')
  const originalApi = received[0].api
  await React.act(() => element.dispatchEvent(new dom.window.Event('chatkit.ready')))
  for (const mode of ['transcript', 'bubbles']) {
    appearance = { ...appearance, chatkit: { ...appearance.chatkit, messagePresentation: mode } }
    await React.act(render)
    assert.equal(document.querySelector('xpertai-chatkit'), element)
    assert.equal(received.at(-1).messagePresentation.mode, mode)
    assert.equal(received.at(-1).api, originalApi)
    assert.equal(received.at(-1).initialThread, 'existing-thread')
  }
  assert.equal(received.at(-1).header.character.computers.cloud.viewKey, 'ProComputer__pro-computer')
  shell.computer = { name: 'My Mac', status: 'connected' }
  await React.act(render)
  assert.equal(received.at(-1).header.character.computers.local.status, 'connected')
  assert.equal(document.querySelector('xpertai-chatkit'), element)
  for (const assistantId of ['other-assistant', 'test-bot']) {
    await React.act(() =>
      element.dispatchEvent(
        new dom.window.CustomEvent('chatkit.effect', {
          detail: { name: 'assistant.computer.open', data: { kind: 'local', assistantId } }
        })
      )
    )
  }
  assert.equal(computerOpens, 1, 'only the currently authenticated assistant opens local controls')
  const calls = received.length
  await React.act(render)
  assert.equal(received.length, calls, 'unchanged options do not update the iframe again')
  const customize = (assistantId) =>
    element.dispatchEvent(
      new dom.window.CustomEvent('chatkit.effect', {
        detail: { name: 'assistant.customize', data: { assistantId } }
      })
    )
  await React.act(() => customize('other-assistant'))
  assert.equal(appearanceDialog, undefined, 'unrelated assistants cannot open the appearance editor')
  await React.act(() => customize('test-bot'))
  assert.equal(appearanceDialog.botId, 'test-bot')
  await React.act(() => appearanceDialog.onSaved())
  assert.equal(appearanceSaves, 1)
  assert.equal(received.length, calls + 1, 'saving refreshes the current frame options')
  assert.equal(document.querySelector('xpertai-chatkit'), element)
  assert.equal(received.at(-1).api, originalApi)
  await React.act(() => appearanceDialog.onClose())
  appearanceDialog = undefined
  await React.act(() => navigate({ assistantId: 'navigated-assistant', threadId: 'next-thread' }))
  await React.act(() => customize('test-bot'))
  assert.equal(appearanceDialog, undefined, 'old assistant events are ignored after workbench navigation')
  await React.act(() => customize('navigated-assistant'))
  assert.equal(appearanceDialog.botId, 'navigated-assistant')
})

test('local computer status uses policy and connection state without starting a Shell', () => {
  const { localComputerState } = loadRenderer('shell/useShellIntegration.tsx', {
    react: React,
    'react/jsx-runtime': require('react/jsx-runtime'),
    '@xpert-ai/desktop-protocol': {},
    '@xpert-ai/shadcn-ui': {},
    '../host': {},
    '../i18n': {},
    './ShellSettings': {}
  })
  const state = { available: true, connected: false, enabled: false, policy: 'ask', settings: { name: 'My Mac' } }
  assert.equal(localComputerState(null).status, 'loading')
  assert.equal(localComputerState(state).status, 'ready')
  assert.equal(localComputerState({ ...state, policy: 'deny' }).status, 'disabled')
  assert.equal(localComputerState({ ...state, connected: true }).status, 'connected')
  assert.equal(localComputerState({ ...state, available: false }).status, 'unavailable')
  assert.equal(localComputerState({ ...state, errorCode: 'offline' }).status, 'error')
})

test('local computer polling ignores stale scope responses and stops after unmount', async (t) => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const { createRoot } = require('react-dom/client')
  const root = createRoot(document.getElementById('root'))
  let mounted = true
  t.after(async () => {
    if (mounted) await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  const pending = []
  const timers = new Map()
  let timerId = 0
  const { useShellIntegration } = loadRenderer(
    'shell/useShellIntegration.tsx',
    {
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      '@xpert-ai/desktop-protocol': {},
      '@xpert-ai/shadcn-ui': Object.fromEntries(
        ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle'].map((name) => [name, () => null])
      ),
      '../host': {
        invoke: (method) => {
          assert.equal(method, 'shellState', 'reading status must not prepare or execute a Shell')
          return new Promise((resolve, reject) => pending.push({ resolve, reject }))
        }
      },
      '../i18n': { t: (key) => key },
      './ShellSettings': { ShellSettings: () => null }
    },
    {
      setTimeout: (callback, delay) => {
        assert.equal(delay, 3000)
        timers.set(++timerId, callback)
        return timerId
      },
      clearTimeout: (id) => timers.delete(id)
    }
  )
  let integration
  function Probe({ scope }) {
    integration = useShellIntegration(scope)
    return null
  }
  await React.act(() => root.render(React.createElement(Probe, { scope: 'first' })))
  assert.equal(integration.computer.status, 'loading')
  assert.equal(timers.size, 0, 'polling waits for the current request to finish')
  await React.act(() => root.render(React.createElement(Probe, { scope: 'second' })))
  const state = { available: true, policy: 'ask', connected: false, settings: { name: 'Current computer' } }
  await React.act(() => pending[1].resolve(state))
  await React.act(() => pending[0].resolve({ ...state, settings: { name: 'Previous computer' } }))
  assert.equal(integration.computer.name, 'Current computer')
  assert.equal(timers.size, 1, 'obsolete scope requests cannot schedule another poll')
  const poll = async () => {
    const [id, callback] = timers.entries().next().value
    timers.delete(id)
    await React.act(() => {
      void callback()
    })
  }
  await poll()
  await React.act(() => pending[2].reject(new Error('Temporarily unavailable')))
  assert.equal(integration.computer.status, 'error')
  await poll()
  await React.act(() => pending[3].resolve({ ...state, connected: true }))
  assert.equal(integration.computer.status, 'connected', 'a later poll recovers from a read failure')
  await React.act(() => integration.openComputer())
  assert.equal(timers.size, 0, 'opening settings cancels the previous poll and refreshes immediately')
  assert.equal(pending.length, 5)
  await React.act(() => root.unmount())
  mounted = false
  await React.act(() => pending[4].resolve(state))
  assert.equal(timers.size, 0, 'an in-flight request cannot restart polling after unmount')
})
