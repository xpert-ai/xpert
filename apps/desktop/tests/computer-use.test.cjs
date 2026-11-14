const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createWindowControl } = require('../electron/computer-use/controller.cjs')

function setup(t, response = 1) {
  const scope = { assistantId: randomUUID(), threadId: randomUUID(), runId: randomUUID() }
  const snapshot = randomUUID()
  const actions = []
  const prompts = []
  const service = {
    config: { apiUrl: 'http://localhost', locale: 'en' },
    profile: { organizationId: randomUUID(), user: { id: randomUUID(), tenantId: randomUUID() } },
    bots: [{ assistantId: scope.assistantId, name: 'Window test' }]
  }
  const host = createWindowControl({
    service,
    getWindow: () => ({}),
    dialog: {
      showMessageBox: async (_window, options) => {
        prompts.push(options)
        return { response }
      }
    },
    makeDriver: () => ({
      close() {},
      async call(input) {
        actions.push(input.action)
        if (input.action === 'windows')
          return {
            windows: [
              { id: 1, app: 'Bosi', title: 'Chat' },
              { id: 2, app: 'TextEdit', title: 'Sample' }
            ]
          }
        if (input.action === 'select') {
          assert.equal(input.window, 2)
          return { snapshot }
        }
        return { applied: true }
      }
    })
  })
  t.after(host.stop)
  const request = (input) => ({ ...scope, toolCallId: randomUUID(), input })
  const start = request({ action: 'start', task: 'Update the selected document.' })
  const write = request({ action: 'type', snapshot, element: 0, text: '中文。' })
  return { host, actions, prompts, service, start, write }
}

test('window consent and tool call receipts are scoped to a single assistant run', async (t) => {
  const { host, actions, prompts, service, start, write } = setup(t)
  await Promise.all([host.run(start), host.run(start)])
  assert.deepEqual(prompts[0].buttons, ['Cancel', 'TextEdit — Sample'])
  assert.equal(prompts.length, 1)
  await assert.rejects(host.run({ ...write, runId: randomUUID() }))
  await assert.rejects(host.run({ ...write, assistantId: randomUUID() }))
  await assert.rejects(host.run({ ...write, threadId: randomUUID() }))
  const originalOrg = service.profile.organizationId
  service.profile.organizationId = randomUUID()
  await assert.rejects(host.run(write))
  service.profile.organizationId = originalOrg
  await Promise.all([host.run(write), host.run(write)])
  await assert.rejects(host.run({ ...write, input: { ...write.input, text: 'Different' } }))
  assert.deepEqual(actions, ['windows', 'select', 'type'])
  host.stop()
  await assert.rejects(host.run(write))
  await assert.rejects(host.run(start))
  assert.equal(host.active(), undefined)
})

test('declining a window prevents observation and later operations from that run', async (t) => {
  const { host, actions, prompts, start, write } = setup(t, 0)
  await assert.rejects(host.run(start))
  await assert.rejects(host.run(write))
  await assert.rejects(host.run({ ...start, toolCallId: randomUUID() }))
  assert.deepEqual(actions, ['windows'])
  assert.equal(prompts.length, 1)
  assert.equal(host.active(), undefined)
})

test('system permission checks never enumerate windows or start a task', async (t) => {
  const { host, actions, prompts } = setup(t)
  await host.status()
  await host.requestScreenPermission()
  assert.deepEqual(actions, ['status', 'requestScreenPermission'])
  assert.equal(prompts.length, 0)
  assert.equal(host.active(), undefined)
})
