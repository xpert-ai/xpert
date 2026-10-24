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

const avatarColors = loadRenderer('avatar/color.ts', { '../../electron/theme-defaults.json': defaults })

test('presentation and Assistant/group navigation reuse the frame with isolated options and listeners', async (t) => {
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
  const threadChanges = []
  const voiceBindings = []
  class ChatKitElement extends dom.window.HTMLElement {
    setOptions(options) {
      received.push(options)
    }
    setThreadId(id) {
      threadChanges.push(id)
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
  let workbenchConnection
  const connectionRequests = []
  const sessionRequests = []
  let sessionFailure
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
      './WorkspaceConnection': {
        useWorkspaceConnection: (_url, assistantId) => ({
          connect(request) {
            connectionRequests.push({ assistantId, request })
            return Promise.resolve({ status: 'connected' })
          },
          status: null
        })
      },
      './avatar/AssistantAppearanceDialog': {
        AssistantAppearanceDialog: (props) => {
          appearanceDialog = props
          return null
        }
      },
      '../electron/connection/urls.mjs': { apiRootUrl: (url) => url },
      './files/DeliveredFile': { useDeliveredFile: () => ({ open() {}, dialog: null }) },
      './workbench': {
        createWorkbenchHandler: (_botId, _url, onSession, connection) => {
          navigate = onSession
          workbenchConnection = connection
          return () => {}
        }
      },
      './shell/useShellIntegration': { useShellIntegration: () => shell },
      './voice/VoiceProvider': {
        useVoiceOptions: (target, onThread, enabled) => {
          voiceBindings.push({ target, onThread, enabled })
          return undefined
        }
      },
      './i18n': { t: (key) => key },
      '@xpert-ai/chatkit-web-component': {},
      '@xpert-ai/shadcn-ui': { Button: 'button' },
      'lucide-react': { LoaderCircle: () => null },
      './host': {
        invoke: async (method, id) => {
          sessionRequests.push([method, id])
          if (sessionFailure) throw sessionFailure
          return { secret: `test-only-${id}` }
        }
      },
      './theme': theme,
      './avatar/color': avatarColors
    },
    {
      Error,
      window: dom.window,
      document: dom.window.document,
      queueMicrotask,
      AbortController: dom.window.AbortController
    }
  )
  let appearance = structuredClone(defaults.appearance)
  appearance.chatkit.messagePresentation = 'bubbles'
  appearance.chatkit.accentPrimary = '#f59e0b'
  let bot = {
    id: 'test-bot',
    name: 'Test assistant',
    avatar: { appearance: { version: 1, kind: 'character', id: 'bosi', color: '#2563eb' } }
  }
  let groupId = null
  let selectionVersion = 0
  const reads = []
  const sessions = []
  const render = () =>
    root.render(
      React.createElement(ChatPanel, {
        bot,
        groupId,
        selectionVersion,
        config: { ...DEFAULT_CONFIG, appearance },
        dark: false,
        initialThread: 'existing-thread',
        onConversationRead: (...args) => reads.push(args),
        onSessionChange: (session) => sessions.push(JSON.parse(JSON.stringify(session))),
        onAppearanceSaved: async () => appearanceSaves++
      })
    )
  await React.act(render)
  const element = document.querySelector('xpertai-chatkit')
  assert.ok(element)
  // A recovered session clears its failure without waiting for another iframe ready event.
  sessionFailure = new Error('Xpert is restarting. Please reconnect shortly.')
  await React.act(async () => {
    await assert.rejects(received[0].api.getClientSecret(), /restarting/)
  })
  assert.match(document.querySelector('[role="alert"]').textContent, /restarting/)
  sessionFailure = undefined
  await React.act(async () => {
    await received[0].api.getClientSecret()
  })
  assert.equal(document.querySelector('[role="alert"]'), null)
  await React.act(() =>
    element.dispatchEvent(
      new dom.window.CustomEvent('chatkit.error', {
        detail: { error: new Error('An unrelated tool error') }
      })
    )
  )
  await React.act(async () => {
    await received[0].api.getClientSecret()
  })
  assert.match(document.querySelector('[role="alert"]').textContent, /unrelated tool/)
  await React.act(() => element.dispatchEvent(new dom.window.Event('chatkit.ready')))
  sessionRequests.length = 0
  assert.equal(workbenchConnection.assistantId(), 'test-bot')
  const connectionRequest = { assistantId: 'test-bot', bindingId: 'github' }
  await workbenchConnection.connect(connectionRequest)
  await received[0].composer.resources.onConnect(connectionRequest)
  assert.deepEqual(
    connectionRequests.slice(0, 2),
    [
      { assistantId: 'test-bot', request: connectionRequest },
      { assistantId: 'test-bot', request: connectionRequest }
    ],
    'view commands and composer connections share the same flow'
  )
  await React.act(() =>
    element.dispatchEvent(new dom.window.CustomEvent('chatkit.thread.change', { detail: { threadId: 'new-thread' } }))
  )
  assert.deepEqual(sessions.at(-1), { botId: 'test-bot', threadId: 'new-thread' })
  await React.act(() =>
    element.dispatchEvent(new dom.window.CustomEvent('chatkit.thread.change', { detail: { threadId: null } }))
  )
  assert.deepEqual(sessions.at(-1), { botId: 'test-bot', threadId: null })
  assert.equal(received[0].messagePresentation.mode, 'bubbles')
  assert.equal(received[0].theme.color.accent.primary, '#2563eb')
  const originalApi = received[0].api
  await React.act(() => element.dispatchEvent(new dom.window.Event('chatkit.ready')))
  bot = { ...bot, avatar: { appearance: { ...bot.avatar.appearance, color: '#a855f7' } } }
  await React.act(render)
  assert.equal(received.at(-1).theme.color.accent.primary, '#a855f7', 'avatar edits update the active frame')
  assert.equal(received.at(-1).api, originalApi, 'color updates retain the authenticated session')
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
  assert.equal(workbenchConnection.assistantId(), 'navigated-assistant')
  await workbenchConnection.connect({ assistantId: 'navigated-assistant', bindingId: 'github' })
  assert.equal(
    connectionRequests.at(-1).assistantId,
    'navigated-assistant',
    'the view uses the updated connection hook'
  )
  const beforeDelegated = sessions.length
  await React.act(() =>
    navigate({ assistantId: 'navigated-assistant', threadId: 'next-thread', conversationId: 'delegated' })
  )
  assert.equal(sessions.length, beforeDelegated + 1)
  assert.deepEqual(sessions.at(-1), {
    botId: 'test-bot',
    threadId: 'next-thread',
    conversation: { assistantId: 'navigated-assistant', conversationId: 'delegated' }
  })
  await React.act(() => customize('test-bot'))
  assert.equal(appearanceDialog, undefined, 'old assistant events are ignored after workbench navigation')
  await React.act(() => customize('navigated-assistant'))
  assert.equal(appearanceDialog.botId, 'navigated-assistant')

  const previousSessionKey = received.at(-1).sessionKey
  const previousVoice = voiceBindings.at(-1)
  const oldConnection = workbenchConnection
  bot = {
    id: 'second-bot',
    name: 'Second assistant',
    avatar: { appearance: { version: 1, kind: 'character', id: 'custom', color: '#16a34a' } }
  }
  await React.act(render)
  assert.equal(oldConnection.assistantId(), undefined, 'disposed view commands cannot authorize another Assistant')
  assert.equal(document.querySelector('xpertai-chatkit'), element, 'Assistant switching preserves the iframe host')
  assert.equal(received.at(-1).api.xpertId, 'second-bot')
  assert.equal(received.at(-1).theme.color.accent.primary, '#16a34a')
  assert.notEqual(received.at(-1).sessionKey, previousSessionKey)
  await React.act(() => previousVoice.onThread('late-voice-thread'))
  assert.deepEqual(threadChanges, [], 'late voice startup cannot navigate the newly selected Assistant')
  await React.act(() => element.dispatchEvent(new dom.window.Event('chatkit.thread.load.end')))
  assert.deepEqual(reads, [['second-bot', 'existing-thread']], 'old Assistant listeners are removed')
  const assistantSessionKey = received.at(-1).sessionKey
  selectionVersion++
  await React.act(render)
  assert.notEqual(received.at(-1).sessionKey, assistantSessionKey, 'same-Assistant navigation resets logical UI state')
  assert.equal(document.querySelector('xpertai-chatkit'), element)
  for (const id of ['group-one', 'group-two', null]) {
    groupId = id
    await React.act(render)
    assert.equal(
      document.querySelector('xpertai-chatkit'),
      element,
      'group/private transitions preserve the iframe host'
    )
    assert.equal(received.at(-1).group?.id, id ?? undefined)
    assert.equal(received.at(-1).api.xpertId, id ? undefined : 'second-bot')
    assert.equal(received.at(-1).theme.color.accent.primary, id ? '#f59e0b' : '#16a34a')
    assert.equal(voiceBindings.at(-1).enabled, !id, 'group mode leaves call controls with the app voice provider')
    await received.at(-1).api.getClientSecret(null)
    assert.deepEqual(
      JSON.parse(JSON.stringify(sessionRequests.at(-1))),
      id ? ['chatSession', { scope: { kind: 'conversation', conversationId: id } }] : ['chatSession', 'second-bot']
    )
  }
})

test('Assistant accents preserve theme presets and fall back for avatars without a color', () => {
  const { getChatKitTheme } = loadRenderer('theme.ts', {
    '../electron/theme-defaults.json': defaults,
    './appearance-types': { defaultAppearance: () => structuredClone(defaults.appearance) }
  })
  for (const dark of [false, true]) {
    for (const radius of ['sharp', 'round']) {
      for (const density of ['compact', 'spacious']) {
        const appearance = structuredClone(defaults.appearance)
        Object.assign(appearance.chatkit, { radius, density, accentPrimary: '#f59e0b' })
        const theme = getChatKitTheme(dark, appearance, '#a855f7')
        assert.equal(theme.color.accent.primary, '#a855f7')
        assert.equal(theme.color.accent.level, appearance.chatkit.accentLevel)
        assert.equal(theme.colorScheme, dark ? 'dark' : 'light')
        assert.equal(theme.radius, radius)
        assert.equal(theme.density, density)
        assert.equal(getChatKitTheme(dark, appearance).color.accent.primary, '#f59e0b')
        appearance.chatkit.accentPrimary = ''
        assert.equal(
          getChatKitTheme(dark, appearance).color.accent.primary,
          defaults.colors[dark ? 'dark' : 'light'].primary
        )
      }
    }
  }
})

test('Assistant accents match custom and generated avatar colors', () => {
  const { assistantAccentColor, avatarColorIndex } = avatarColors
  const bot = { id: 'fallback-assistant', avatarUrl: null, avatarEmoji: null }
  assert.equal(assistantAccentColor(bot), defaults.avatarPalette[avatarColorIndex(bot)])
  assert.equal(assistantAccentColor({ ...bot, id: 'copy', assistantId: bot.id }), assistantAccentColor(bot))
  assert.equal(assistantAccentColor({ ...bot, avatar: { background: '#0f766e' } }), '#0f766e')
  assert.equal(
    assistantAccentColor({
      ...bot,
      avatar: {
        background: '#0f766e',
        appearance: { version: 1, kind: 'character', id: 'bosi', color: '#a855f7' }
      }
    }),
    '#a855f7'
  )
  assert.equal(assistantAccentColor({ ...bot, avatarUrl: 'https://example.com/avatar.png' }), undefined)
  assert.equal(assistantAccentColor({ ...bot, avatarEmoji: { id: 'smile' } }), undefined)
  assert.equal(assistantAccentColor(undefined), undefined)
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
