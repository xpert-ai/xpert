const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const React = require('react')
const { JSDOM } = require('jsdom')

class HostError extends Error {
  constructor(message, status, errorCode) {
    super(message)
    this.status = status
    this.errorCode = errorCode
  }
}
const missingMembership = () =>
  new HostError('Join this organization first.', 403, 'GROUP_ORGANIZATION_MEMBERSHIP_REQUIRED')

async function mount(t, initial) {
  const dom = new JSDOM('<div id="root"></div>')
  const previous = { window: global.window, document: global.document, act: global.IS_REACT_ACT_ENVIRONMENT }
  global.window = dom.window
  global.document = dom.window.document
  global.IS_REACT_ACT_ENVIRONMENT = true
  const timers = new Set()
  let handler = initial,
    binding = 'org-a',
    state
  const calls = []
  const exports = {}
  const code = ts.transpileModule(readFileSync(resolve(__dirname, '../src/groups/useGroupList.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  runInNewContext(code, {
    exports,
    Error,
    setInterval: (callback) => {
      timers.add(callback)
      return callback
    },
    clearInterval: (callback) => timers.delete(callback),
    require: (name) => {
      if (name === 'react') return React
      if (name === '../i18n') return { t: (key) => key }
      if (name === '../host')
        return {
          HostError,
          invoke: async (method) => {
            calls.push({ method, binding })
            return handler(method, binding)
          }
        }
      throw new Error(`Unexpected import ${name}`)
    }
  })
  function Probe() {
    state = exports.useGroupList(binding, 0, null)
    return null
  }
  const root = require('react-dom/client').createRoot(document.getElementById('root'))
  const render = () => React.act(async () => root.render(React.createElement(Probe)))
  await render()
  t.after(async () => {
    await React.act(async () => root.unmount())
    dom.window.close()
    global.window = previous.window
    global.document = previous.document
    global.IS_REACT_ACT_ENVIRONMENT = previous.act
  })
  return {
    calls,
    state: () => state,
    respond: (next) => {
      handler = next
    },
    poll: () =>
      React.act(async () => {
        for (const callback of timers) callback()
      }),
    reload: () => React.act(async () => state.reload()),
    switchOrganization: async (next) => {
      binding = next
      await render()
    }
  }
}

test('missing membership clears previous groups and pauses polling until an explicit refresh succeeds', async (t) => {
  const view = await mount(t, async () => [{ id: 'previous-group' }])
  assert.equal(view.state().items.length, 1)
  view.respond(async () => {
    throw missingMembership()
  })
  await view.poll()
  assert.equal(view.state().membershipRequired, true)
  assert.equal(view.state().items.length, 0)
  assert.equal(view.state().error, '')
  const count = view.calls.length
  await view.poll()
  assert.equal(view.calls.length, count)
  view.respond(async () => [{ id: 'joined-group' }])
  await view.reload()
  assert.equal(view.state().membershipRequired, false)
  assert.equal(view.state().items[0].id, 'joined-group')
  await view.poll()
  assert.equal(view.calls.length, count + 2)
})

test('ordinary permission failures retain error/retry behavior instead of claiming missing membership', async (t) => {
  const view = await mount(t, async () => {
    throw new HostError('Permission denied', 403)
  })
  assert.equal(view.state().membershipRequired, false)
  assert.equal(view.state().error, 'Permission denied')
  await view.poll()
  assert.equal(view.calls.length, 2)
})

test('a previous organization response cannot set the new organization membership notice', async (t) => {
  let rejectOld
  const pending = new Promise((_, reject) => {
    rejectOld = reject
  })
  const view = await mount(t, () => pending)
  view.respond(async () => [{ id: 'org-b-group' }])
  await view.switchOrganization('org-b')
  await React.act(async () => rejectOld(missingMembership()))
  assert.equal(view.state().membershipRequired, false)
  assert.equal(view.state().items[0].id, 'org-b-group')
  assert.equal(view.state().error, '')
})
