const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { DesktopShellController } = require('../electron/shell/controller.cjs')

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-permission-'))
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }))
  const requests = [],
    ipc = []
  const service = {
    config: { apiUrl: 'http://localhost:3000' },
    profile: { user: { id: randomUUID(), tenantId: randomUUID() }, organizationId: randomUUID() },
    async request(url, { body }) {
      requests.push({ url, body })
      if (url.endsWith('/prepare'))
        return {
          kind: 'desktop-shell',
          grantId: randomUUID(),
          cwd: body.cwd,
          deviceName: 'Fixture',
          decision: 'pending',
          expiresAt: Date.now() + 600000
        }
      return {}
    }
  }
  const controller = new DesktopShellController(service, dir)
  const child = new EventEmitter()
  child.connected = true
  child.send = (message, done) => {
    ipc.push(message)
    done?.()
  }
  let starts = 0
  controller.enable = async () => {
    starts++
    controller.deviceId = randomUUID()
    controller.connected = true
    controller.child = child
  }
  const input = {
    kind: 'desktop-shell',
    assistantId: randomUUID(),
    threadId: randomUUID(),
    runId: randomUUID(),
    toolCallId: 'call_1',
    command: 'pwd',
    timeoutSec: 30
  }
  const acknowledge = () => {
    const last = ipc.at(-1)
    child.emit('message', { type: 'grants-applied', requestId: last.requestId })
  }
  return { controller, service, requests, ipc, child, input, dir, acknowledge, starts: () => starts }
}
const nextTick = () => new Promise((resolve) => setImmediate(resolve))

test('connects on demand and deduplicates concurrent preparations without execution permits', async (t) => {
  const f = fixture(t)
  const [a, b] = await Promise.all([f.controller.prepare(f.input), f.controller.prepare(f.input)])
  assert.equal(a.grantId, b.grantId)
  assert.equal(a.decision, 'pending')
  assert.equal(f.starts(), 1)
  assert.equal(f.requests.length, 1)
  assert.equal(f.controller.grants.size, 0)
  await assert.rejects(f.controller.prepare({ ...f.input, command: 'touch different' }), /OPERATION_CONFLICT/)
})
test('approval waits for the worker receipt before it can resume the Agent', async (t) => {
  const f = fixture(t),
    ready = await f.controller.prepare(f.input)
  let accepted = false
  const approval = f.controller.decide({ id: ready.grantId, decision: 'approve' }).then(() => {
    accepted = true
  })
  await nextTick()
  assert.equal(accepted, false)
  assert.equal(ready.decision, 'pending')
  assert.match(f.ipc.at(-1).grants[0].argsHash, /^[a-f0-9]{64}$/)
  f.acknowledge()
  await approval
  assert.equal(accepted, true)
  assert.equal(ready.decision, 'approved')
})
test('persistent allow is scoped to account, organization, platform and installation', async (t) => {
  const f = fixture(t)
  await f.controller.setPolicy('allow')
  const restored = new DesktopShellController(f.service, f.dir)
  assert.equal(restored.policy(), 'allow')
  const org = f.service.profile.organizationId
  f.service.profile.organizationId = randomUUID()
  assert.equal(restored.policy(), 'ask')
  f.service.profile.organizationId = org
  f.service.config.apiUrl = 'https://another.example'
  assert.equal(restored.policy(), 'ask')
})
test('deny connects to no device; unknown and expired permits never approve', async (t) => {
  const f = fixture(t)
  await f.controller.setPolicy('deny')
  await assert.rejects(f.controller.prepare(f.input), /SHELL_DENIED/)
  assert.equal(f.starts(), 0)
  await f.controller.setPolicy('ask')
  await assert.rejects(f.controller.decide({ id: randomUUID(), decision: 'approve' }), /GRANT_REVOKED/)
  const ready = await f.controller.prepare(f.input)
  ready.expiresAt = 0
  await assert.rejects(f.controller.decide({ id: ready.grantId, decision: 'approve' }), /GRANT_REVOKED/)
  assert.equal(f.controller.grants.size, 0)
})
test('always allow still waits for a one-command permit acknowledgement', async (t) => {
  const f = fixture(t)
  await f.controller.setPolicy('allow')
  const pending = f.controller.prepare(f.input)
  await nextTick()
  f.acknowledge()
  const ready = await pending
  assert.equal(ready.decision, 'approved')
  assert.equal(f.controller.grants.size, 1)
})
test('reject removes the permit and cannot be reversed by an old card', async (t) => {
  const f = fixture(t),
    ready = await f.controller.prepare(f.input)
  const reject = f.controller.decide({ id: ready.grantId, decision: 'reject' })
  await nextTick()
  f.acknowledge()
  await reject
  assert.equal(f.controller.grants.size, 0)
  await assert.rejects(f.controller.decide({ id: ready.grantId, decision: 'approve' }), /OPERATION_CONFLICT/)
  await assert.rejects(f.controller.prepare(f.input), /SHELL_DENIED/)
})
test('organization change during authorization prevents the Agent from resuming', async (t) => {
  const f = fixture(t),
    ready = await f.controller.prepare(f.input)
  const pending = f.controller.decide({ id: ready.grantId, decision: 'approve' })
  const rejected = assert.rejects(pending, /SESSION_CHANGED/)
  await nextTick()
  f.service.profile.organizationId = randomUUID()
  f.acknowledge()
  await rejected
})
