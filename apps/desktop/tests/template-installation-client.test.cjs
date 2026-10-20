const { test } = require('node:test')
const assert = require('node:assert/strict')
const {
  createInstallationClient,
  installationStatusLabel,
  canOpenInstalledAssistant
} = require('./helpers/template-installation.cjs')
const input = { templateId: 'template', workspaceId: 'workspace', publish: true, basic: { title: 'Assistant' } }
const operation = (patch = {}) => ({
  id: 'operation',
  templateId: 'template',
  workspaceId: 'workspace',
  status: 'succeeded',
  stage: 'completed',
  attempt: 1,
  assistantId: 'assistant',
  publish: true,
  retryable: false,
  error: null,
  resourceInstallationIds: [],
  pendingAuthInstallationIds: [],
  createdAt: '2026-10-13T00:00:00Z',
  updatedAt: '2026-10-13T00:00:00Z',
  ...patch
})
function harness(t, overrides = {}, entries = new Map(), scope = 'account') {
  let state
  const calls = []
  const transport = {
    create: async (input) => {
      calls.push(input)
      return operation()
    },
    get: async () => operation(),
    list: async () => ({ items: [], total: 0 }),
    retry: async () => operation(),
    ...overrides
  }
  const client = createInstallationClient({
    transport,
    storage: {
      getItem: (key) => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: (key) => entries.delete(key)
    },
    scope,
    ...input,
    changed: (value) => {
      state = value
    },
    errorMessage: (error) => error.message,
    interval: 5
  })
  t.after(() => client.dispose())
  return {
    client,
    calls,
    entries,
    get state() {
      return state
    }
  }
}
test('lost POST response survives remount and replays exactly the same intent and key', async (t) => {
  let original
  const first = harness(t, {
    create: async (input) => {
      original = input
      throw Error('offline')
    }
  })
  await first.client.start(input)
  assert.equal(first.state.uncertain, true)
  await first.client.start(input)
  first.client.newInstance()
  first.client.dispose()
  const second = harness(t, {}, first.entries)
  await second.client.restore()
  assert.deepEqual(second.calls, [original])
  assert.equal(second.state.operation.assistantId, 'assistant')
  const third = harness(
    t,
    {
      get: async (id) => {
        assert.equal(id, 'operation')
        return operation()
      }
    },
    second.entries
  )
  await third.client.restore()
  assert.equal(third.calls.length, 0)
})
test('double submit is serialized and an explicit new instance gets a different key', async (t) => {
  const h = harness(t)
  await Promise.all([h.client.start(input), h.client.start(input)])
  assert.equal(h.calls.length, 1)
  await h.client.start(input)
  assert.equal(h.calls.length, 1)
  h.client.newInstance()
  await h.client.start(input)
  assert.notEqual(h.calls[0].idempotencyKey, h.calls[1].idempotencyKey)
})
test('deleted target restores its successful history without replaying creation and refresh returns current availability', async (t) => {
  const first = harness(t)
  await first.client.start(input)
  first.client.dispose()
  const deleted = operation({ assistantAvailability: 'unavailable' })
  const reopened = harness(t, { get: async () => deleted }, first.entries)
  await reopened.client.restore()
  assert.equal(reopened.calls.length, 0)
  assert.equal(installationStatusLabel(reopened.state.operation), 'Installation complete')
  assert.equal(canOpenInstalledAssistant(reopened.state.operation), false)
  assert.deepEqual(await reopened.client.refresh(), deleted)
  await reopened.client.retry()
  assert.equal(reopened.calls.length, 0)
  reopened.client.newInstance()
  assert.equal(reopened.state.operation, null)
  assert.equal(reopened.state.history[0].id, deleted.id)
  await reopened.client.start(input)
  assert.equal(reopened.calls.length, 1)
  assert.notEqual(reopened.calls[0].idempotencyKey, first.calls[0].idempotencyKey)
})
test('opening requires a successful imported target and supports receipts from older servers', () => {
  assert.equal(canOpenInstalledAssistant(operation()), true)
  assert.equal(canOpenInstalledAssistant(operation({ assistantAvailability: 'available' })), true)
  assert.equal(canOpenInstalledAssistant(operation({ assistantId: null })), false)
  assert.equal(canOpenInstalledAssistant(operation({ status: 'running' })), false)
  assert.equal(canOpenInstalledAssistant(operation({ assistantAvailability: 'unavailable' })), false)
})
test('retry uses the durable operation id and keeps pending configuration distinct from completion', async (t) => {
  let retried
  const h = harness(t, {
    create: async () => operation({ status: 'interrupted', stage: 'dependencies', retryable: true }),
    retry: async (id) => {
      retried = id
      return operation({ pendingAuthInstallationIds: ['connection'] })
    }
  })
  await h.client.start(input)
  await h.client.retry()
  assert.equal(retried, 'operation')
  assert.equal(installationStatusLabel(h.state.operation), 'Configuration required')
})
test('source changes cannot be retried, and polling stops when the operation finishes', async (t) => {
  let reads = 0,
    retries = 0
  const h = harness(t, {
    create: async () => operation({ status: 'running', stage: 'importing' }),
    get: async () => {
      reads++
      return operation({
        status: 'failed',
        retryable: false,
        error: { code: 'SOURCE_CHANGED', message: 'Source changed' }
      })
    },
    retry: async () => {
      retries++
      return operation()
    }
  })
  await h.client.start(input)
  await new Promise((resolve) => setTimeout(resolve, 35))
  await h.client.retry()
  assert.equal(reads, 1)
  assert.equal(retries, 0)
})
test('scope changes cannot restore another account intent, and late responses cannot update a disposed view', async (t) => {
  let resolve
  const first = harness(t, {
    create: () =>
      new Promise((done) => {
        resolve = done
      })
  })
  const request = first.client.start(input)
  first.client.dispose()
  resolve(operation())
  await request
  assert.equal(first.state.operation, null)
  const second = harness(t, {}, first.entries, 'different-account')
  await second.client.restore()
  assert.equal(second.calls.length, 0)
})
test('history paginates across other templates and opens server records created on another client', async (t) => {
  const offsets = []
  const h = harness(t, {
    list: async (_workspace, skip) => {
      offsets.push(skip)
      return skip ? { items: [operation()], total: 2 } : { items: [operation({ templateId: 'other' })], total: 2 }
    }
  })
  await h.client.history()
  assert.equal(h.state.hasMore, true)
  assert.equal(h.state.history.length, 0)
  await h.client.history(true)
  assert.deepEqual(offsets, [0, 1])
  await h.client.select(h.state.history[0])
  assert.equal(h.state.operation.id, 'operation')
})
test('storage failure prevents POST; invalid persisted input is never sent', async (t) => {
  const h = harness(
    t,
    {},
    new Map([
      [
        'xpert.template-installation.v1:' + JSON.stringify(['account', 'workspace', 'template']),
        '{"kind":"intent","input":{"basic":{"copilotModel":{"credentials":"secret"}}}}'
      ]
    ])
  )
  await h.client.restore()
  assert.equal(h.calls.length, 0)
  let called = false
  const client = createInstallationClient({
    ...input,
    scope: '',
    storage: {
      getItem: () => null,
      setItem: () => {
        throw Error('blocked')
      },
      removeItem() {}
    },
    changed() {},
    errorMessage: (e) => e.message,
    transport: {
      create: async () => {
        called = true
        return operation()
      }
    }
  })
  t.after(() => client.dispose())
  await client.start(input)
  assert.equal(called, false)
})
