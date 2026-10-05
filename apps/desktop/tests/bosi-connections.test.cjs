const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const { createRequire } = require('node:module')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const sharedRequire = createRequire(join(__dirname, '../../../package.json'))
const React = sharedRequire('react')

async function mount(t, invoke) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src/bosi/BosiConnections.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  const exports = {}
  const opened = []
  dom.window.xpertDesktop = {
    openPlatform: async (target) => {
      opened.push(target)
      return true
    }
  }
  runInNewContext(code, {
    exports,
    window: dom.window,
    document: dom.window.document,
    setTimeout,
    clearTimeout,
    Error,
    require(id) {
      if (id === '../host') return { invoke }
      if (id === '../i18n') return { t: (key) => key }
      if (id.endsWith('workbench-platform.mjs')) return { platformCommandUrl: () => null }
      if (id === '@xpert-ai/shadcn-ui')
        return {
          Button: ({ variant, size, ...props }) => React.createElement('button', props)
        }
      if (id === 'lucide-react')
        return { Check: () => null, LoaderCircle: () => null, Plug: () => null, RefreshCw: () => null }
      return sharedRequire(id)
    }
  })
  const root = sharedRequire('react-dom/client').createRoot(document.getElementById('root'))
  let skipped = 0
  let continued = 0
  t.after(async () => {
    await React.act(() => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await React.act(() =>
    root.render(
      React.createElement(exports.BosiConnections, {
        onEmpty: () => skipped++,
        onContinue: () => continued++
      })
    )
  )
  return { dom, opened, skipped: () => skipped, continued: () => continued }
}

const catalog = (items, revision = 0) => ({ workspace: { id: 'workspace', name: 'Bosi' }, revision, items })
const plugin = {
  id: 'documents',
  name: 'Documents',
  kind: 'plugin',
  status: 'available',
  selected: false,
  canSelect: true,
  canConnect: false
}
const button = (text) => [...document.querySelectorAll('button')].find((element) => element.textContent === text)

test('only a successful empty catalog skips the optional step; errors remain actionable', async (t) => {
  let failure = true
  const view = await mount(t, async () => {
    if (failure) throw new Error('Scope unavailable')
    return catalog([])
  })
  assert.equal(view.skipped(), 0)
  assert.match(document.querySelector('[role="alert"]').textContent, /Scope unavailable/)
  await React.act(() => button('Set up later').click())
  assert.equal(view.continued(), 1)
  failure = false
  await React.act(() => button('Retry').click())
  assert.equal(document.querySelector('[role="alert"]'), null)
  assert.match(document.body.textContent, /You can start using Bosi now/)
})

test('an empty initial catalog skips automatically without opening a connection manager', async (t) => {
  const view = await mount(t, async () => catalog([]))
  assert.equal(view.skipped(), 1)
  assert.equal(view.opened.length, 0)
})

test('selection persists its revision, renders server results, and can remove a disabled selection', async (t) => {
  const calls = []
  const view = await mount(t, async (method, input) => {
    calls.push({ method, input })
    if (method === 'bosiOnboarding') return catalog([plugin], 3)
    return catalog([{ ...plugin, selected: input.selected, status: 'unavailable', canSelect: false }], 4)
  })
  await React.act(() => button('Enable').click())
  assert.equal(
    JSON.stringify(calls[1]),
    JSON.stringify({ method: 'bosiChoose', input: { revision: 3, kind: 'plugin', id: 'documents', selected: true } })
  )
  assert.equal(button('Selected').getAttribute('aria-pressed'), 'true')
  await React.act(() => button('Selected').click())
  assert.equal(calls[2].input.selected, false)
  assert.equal(calls[2].input.revision, 4)
  assert.equal(view.skipped(), 0)
})

test('connection opens only the host-provided pre-Assistant target and stays optional', async (t) => {
  const target = { target: 'bosi.connector.connect', workspaceId: 'private', bindingId: 'mail', organizationId: 'org' }
  const calls = []
  let revision = 0
  let selected = false
  const view = await mount(t, async (method, input) => {
    calls.push({ method, input })
    if (method === 'bosiChoose') {
      assert.equal(input.revision, revision)
      selected = input.selected
      revision++
    }
    if (method === 'bosiOnboarding' || method === 'bosiChoose')
      return catalog(
        [
          {
            id: 'mail',
            name: 'Mail',
            kind: 'connector',
            status: 'requires_auth',
            selected,
            canSelect: true,
            canConnect: true
          }
        ],
        revision
      )
    selected = true
    revision++
    return { attemptId: 'attempt', target }
  })
  await React.act(() => button('Connect account').click())
  assert.equal(calls[1].method, 'bosiConnect')
  assert.equal(calls[1].input.provider, 'mail')
  assert.deepEqual(view.opened, [target])
  assert.match(document.body.textContent, /Complete authorization in your browser/)
  assert.equal(button('Continue').disabled, false)
  assert.equal(button('Selected').getAttribute('aria-pressed'), 'true')
  await React.act(() => button('Selected').click())
  assert.equal(calls.at(-1).input.revision, 1, 'authorization must refresh the choice revision before another mutation')
  assert.equal(button('Enable').getAttribute('aria-pressed'), 'false')
})
