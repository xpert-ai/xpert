const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const { JSDOM } = require('jsdom')
const React = require('react')

async function mount(t, handler) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const exports = {}
  const calls = []
  const ready = []
  const code = ts.transpileModule(readFileSync(join(__dirname, '../src/bosi/BosiOnboarding.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText
  runInNewContext(code, {
    exports,
    Error,
    require(id) {
      if (id === '../host')
        return {
          invoke: (method, input) => {
            calls.push({ method, input })
            return handler(method, input)
          }
        }
      if (id === '../i18n') return { t: (key) => key }
      if (id === '@xpert-ai/shadcn-ui')
        return {
          Button: ({ variant, ...props }) => React.createElement('button', props),
          Label: 'label',
          Switch: ({ onCheckedChange, checked, ...props }) =>
            React.createElement('input', {
              ...props,
              type: 'checkbox',
              checked,
              onChange: (event) => onCheckedChange(event.target.checked)
            })
        }
      if (id === 'lucide-react')
        return Object.fromEntries(
          ['ArrowLeft', 'Brain', 'Laptop', 'LoaderCircle', 'Monitor', 'ShieldCheck', 'Sparkles'].map((name) => [
            name,
            () => null
          ])
        )
      if (id === '../avatar/AnimatedAssistantAvatar') return { AnimatedAssistantAvatar: () => null }
      if (id === './ComputerPreview') return { ComputerPreview: () => null }
      if (id === '../catalog/ModelCascader')
        return { ModelCascader: ({ value }) => React.createElement('output', { id: 'model' }, value) }
      if (id === './BosiConnections')
        return {
          BosiConnections: ({ onContinue }) => React.createElement('button', { onClick: onContinue }, 'Skip services')
        }
      if (id === 'react' || id === 'react/jsx-runtime') return require(id)
      throw new Error(`Unexpected import: ${id}`)
    }
  })
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  let unmounted = false
  const unmount = async () => {
    if (unmounted) return
    unmounted = true
    await React.act(() => root.unmount())
  }
  t.after(async () => {
    await unmount()
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  await React.act(() =>
    root.render(
      React.createElement(exports.BosiOnboarding, {
        organizationId: 'org',
        onReady: async (...args) => {
          ready.push(args)
        }
      })
    )
  )
  return { calls, ready, unmount }
}
const button = (text) => [...document.querySelectorAll('button')].find((element) => element.textContent === text)
const click = (text) => React.act(() => button(text).click())
const setup = {
  assistantId: null,
  progress: null,
  capabilities: [
    { key: 'cloud-computer', available: true },
    { key: 'desktop-shell', available: true }
  ],
  setup: { canInstall: true, defaultModelId: 'model', models: [{ id: 'model' }] }
}

test('valid existing bindings open without onboarding, shell changes or another welcome', async (t) => {
  const view = await mount(t, async (method) => {
    assert.equal(method, 'bosiSetup')
    return { assistantId: 'existing', progress: null }
  })
  assert.deepEqual(view.ready, [['existing', null]])
  assert.equal(view.calls.length, 1)
})

test('binding errors remain visible and retry never creates an assistant', async (t) => {
  let failure = true
  const view = await mount(t, async (method) => {
    assert.equal(method, 'bosiSetup')
    if (failure) throw new Error('Binding unavailable')
    return { assistantId: 'existing', progress: null }
  })
  assert.match(document.querySelector('[role="alert"]').textContent, /Binding unavailable/)
  assert.equal(view.ready.length, 0)
  failure = false
  await click('Retry')
  assert.deepEqual(view.ready, [['existing', null]])
})

test('new setup defaults to cloud computer, leaves Shell off and opens the welcome thread', async (t) => {
  const view = await mount(t, async (method) => {
    if (method === 'bosiSetup') return setup
    if (method === 'shellState') return { available: true, settings: { name: 'This device' } }
    if (method === 'createBosi') return { assistantId: 'new', progress: { phase: 'welcome_pending' } }
    if (method === 'bosiWelcome')
      return { assistantId: 'new', progress: { phase: 'welcome_running', threadId: 'welcome' } }
    throw new Error(`Unexpected call: ${method}`)
  })
  await click('Continue')
  await click('Skip services')
  assert.equal(document.getElementById('cloud-computer').checked, true)
  assert.equal(document.getElementById('desktop-shell').checked, false)
  assert.equal(document.getElementById('model').textContent, 'model')
  await click('Create Bosi')
  assert.equal(
    JSON.stringify(view.calls.find((call) => call.method === 'createBosi').input),
    JSON.stringify({ capabilities: ['cloud-computer'], modelId: 'model' })
  )
  assert.equal(
    view.calls.some((call) => call.method === 'shellConfigure'),
    false
  )
  assert.deepEqual(view.ready, [['new', 'welcome']])
})

test('failed welcome retries the existing assistant without creating another one', async (t) => {
  let welcomes = 0
  const view = await mount(t, async (method) => {
    if (method === 'bosiSetup')
      return { assistantId: 'existing', progress: { phase: 'welcome_pending', threadId: 'same-thread' } }
    assert.equal(method, 'bosiWelcome')
    if (++welcomes === 1) throw new Error('Welcome interrupted')
    return { assistantId: 'existing', progress: { phase: 'ready', threadId: 'same-thread' } }
  })
  assert.match(document.querySelector('[role="alert"]').textContent, /Welcome interrupted/)
  await click('Retry')
  assert.deepEqual(view.ready, [['existing', 'same-thread']])
  assert.equal(
    view.calls.some((call) => call.method === 'createBosi'),
    false
  )
})

test('leaving the organization while Shell is configuring cancels the pending creation', async (t) => {
  let finishShell
  const view = await mount(t, async (method) => {
    if (method === 'bosiSetup') return setup
    if (method === 'shellState') return { available: true, settings: { name: 'This device' } }
    if (method === 'shellConfigure')
      return new Promise((resolve) => {
        finishShell = resolve
      })
    throw new Error(`Unexpected call: ${method}`)
  })
  await click('Continue')
  await click('Skip services')
  await React.act(() => document.getElementById('desktop-shell').click())
  await click('Create Bosi')
  assert.equal(typeof finishShell, 'function')
  await view.unmount()
  await React.act(() => finishShell({}))
  assert.equal(
    view.calls.some((call) => call.method === 'createBosi'),
    false
  )
  assert.equal(view.ready.length, 0)
})
