const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const { runInNewContext } = require('node:vm')
const ts = require('typescript')
const code = ts.transpileModule(readFileSync(join(__dirname, '../src/workspace-connection-flow.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const request = { assistantId: 'assistant', bindingId: 'binding' }
const target = { target: 'workspace.connector.connect', ...request, organizationId: 'organization' }
async function settle() {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}
function fixture(overrides = {}) {
  const calls = { opened: [], cancelled: [], progress: [] }
  const timers = new Map()
  let timerId = 0
  let status = 'pending'
  const exports = {}
  runInNewContext(code, {
    exports,
    setTimeout: (fn) => {
      timers.set(++timerId, fn)
      return timerId
    },
    clearTimeout: (id) => timers.delete(id)
  })
  const deps = {
    assistantId: 'assistant',
    start: async () => ({ status: 'pending', attemptId: 'attempt', target }),
    check: async () => ({ status }),
    cancel: async (id) => calls.cancelled.push(id),
    open: async (value) => calls.opened.push(value),
    onProgress: (value) => calls.progress.push(value),
    isFatal: (error) => error.status === 403,
    invalidRequest: () => new Error('Invalid request'),
    ...overrides
  }
  return {
    flow: exports.createWorkspaceConnectionFlow(deps),
    calls,
    timers,
    deps,
    ready: () => {
      status = 'connected'
    }
  }
}

test('a ChatKit command opens the browser directly, deduplicates, and waits for verified readiness', async () => {
  const { flow, calls, timers, ready } = fixture()
  const result = flow.connect(request)
  assert.equal(flow.connect(request), result)
  await settle()
  assert.deepEqual(calls.opened, [target])
  assert.equal(calls.progress[0], 'opening')
  assert.equal(timers.size, 1)
  ready()
  await flow.check()
  assert.equal((await result).status, 'connected')
  assert.equal(calls.progress.at(-1), null)
  assert.equal(timers.size, 0)
})
test('an already ready shared connection does not open a browser', async () => {
  const { flow, calls } = fixture({ start: async () => ({ status: 'connected' }) })
  assert.equal((await flow.connect(request)).status, 'connected')
  assert.equal(calls.opened.length, 0)
})
test('cancelling during preflight prevents late navigation and releases the host attempt', async () => {
  let resolve
  const { flow, calls } = fixture({
    start: () =>
      new Promise((done) => {
        resolve = done
      })
  })
  const result = flow.connect(request)
  flow.cancel()
  resolve({ status: 'pending', attemptId: 'attempt', target })
  await settle()
  assert.equal((await result).status, 'cancelled')
  assert.equal(calls.opened.length, 0)
  assert.deepEqual(calls.cancelled, ['attempt'])
})
test('navigation failure rejects to ChatKit and releases the connection attempt', async () => {
  const { flow, calls, timers } = fixture({
    open: async () => {
      throw new Error('Browser unavailable')
    }
  })
  await assert.rejects(flow.connect(request), /Browser unavailable/)
  assert.deepEqual(calls.cancelled, ['attempt'])
  assert.equal(timers.size, 0)
  assert.equal(calls.progress.at(-1), null)
})
test('an unrelated assistant or concurrent binding cannot replace the current flow', async () => {
  const { flow, calls } = fixture()
  await assert.rejects(flow.connect({ ...request, assistantId: 'other' }), /Invalid/)
  const result = flow.connect(request)
  await assert.rejects(flow.connect({ ...request, bindingId: 'other' }), /Invalid/)
  await settle()
  assert.equal(calls.opened.length, 1)
  flow.cancel()
  assert.equal((await result).status, 'cancelled')
})
test('temporary polling errors retry, but revoked permission rejects to ChatKit', async () => {
  const { flow, calls, deps, timers } = fixture({
    check: async () => {
      throw new Error('Offline')
    }
  })
  const result = flow.connect(request)
  const rejected = assert.rejects(result, /Forbidden/)
  await settle()
  assert.equal(calls.progress.at(-1), 'retrying')
  assert.equal(timers.size, 1)
  deps.check = async () => {
    const error = new Error('Forbidden')
    error.status = 403
    throw error
  }
  await flow.check()
  await rejected
  assert.equal(timers.size, 0)
})
test('an in-flight status response cannot complete after cancellation', async () => {
  let resolve
  const { flow, calls } = fixture({
    check: () =>
      new Promise((done) => {
        resolve = done
      })
  })
  const result = flow.connect(request)
  await settle()
  flow.cancel()
  resolve({ status: 'connected' })
  await settle()
  assert.equal((await result).status, 'cancelled')
  assert.equal(calls.progress.at(-1), null)
})
