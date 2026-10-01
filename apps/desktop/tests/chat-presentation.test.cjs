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
  const shell = { handlers: {}, dialog: null }
  const { ChatPanel } = loadRenderer(
    'ChatPanel.tsx',
    {
      react: React,
      'react/jsx-runtime': require('react/jsx-runtime'),
      './WorkspaceConnection': { useWorkspaceConnection: () => ({ connect() {}, status: null }) },
      '../electron/connection/urls.mjs': { apiRootUrl: (url) => url },
      './files/DeliveredFile': { useDeliveredFile: () => ({ open() {}, dialog: null }) },
      './workbench': { createWorkbenchHandler: () => () => {} },
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
        onConversationRead() {}
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
  const calls = received.length
  await React.act(render)
  assert.equal(received.length, calls, 'unchanged options do not update the iframe again')
})
