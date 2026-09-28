const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ClientError } = require('../electron/service.cjs')
const { createPluginConnectionMethods } = require('../electron/plugin-connections.cjs')

function fixture(overrides = {}, extra = {}) {
  const calls = []
  const binding = {
    bindingId: 'binding',
    provider: 'service',
    scope: { type: 'workspace', workspaceId: 'workspace' },
    authorizationMode: 'shared',
    status: 'disconnected',
    granted: false,
    canManage: true,
    credentials: 'must-not-leave-host',
    ...overrides
  }
  const service = {
    generation: 0,
    profile: { organizationId: 'organization' },
    bots: [{ id: 'bot', assistantId: 'assistant' }],
    request: async (...args) => {
      calls.push(args)
      return {
        scope: binding.scope,
        workspaceScope: { type: 'workspace', workspaceId: 'workspace' },
        canManageWorkspace: true,
        items: [binding],
        ...extra
      }
    },
    ...createPluginConnectionMethods(ClientError)
  }
  return { service, calls, binding }
}
const request = { assistantId: 'assistant', bindingId: 'binding' }

test('connection handoff derives organization and scope in the host without exposing credentials', async () => {
  const { service, calls } = fixture()
  const result = await service.pluginConnection({
    ...request,
    organizationId: 'forged',
    url: 'https://untrusted.invalid'
  })
  assert.deepEqual(result, {
    connected: false,
    target: { target: 'workspace.connector.connect', ...request, organizationId: 'organization' }
  })
  assert.equal(calls[0][1].scope, 'organization')
  assert.doesNotMatch(JSON.stringify(result), /must-not-leave-host|forged|untrusted/)
})
test('unknown assistants and malformed identities are rejected before making a request', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.pluginConnection({ ...request, assistantId: 'other' }), { status: 403 })
  await assert.rejects(service.pluginConnection({ ...request, bindingId: '../binding' }), { status: 403 })
  assert.equal(calls.length, 0)
})
test('both workspace and binding configuration permission are required for unconnected services', async () => {
  for (const [binding, options] of [
    [{ canManage: false }, {}],
    [{}, { canManageWorkspace: false }],
    [{ scope: { type: 'project', projectId: 'project' } }, {}],
    [{ scope: { type: 'workspace', workspaceId: 'different' } }, {}]
  ]) {
    await assert.rejects(fixture(binding, options).service.pluginConnection(request), { status: 403 })
  }
})
test('authorized users can use an already active shared connection without administrator permission', async () => {
  const { service } = fixture({ status: 'active', granted: true, canManage: false }, { canManageWorkspace: false })
  assert.equal((await service.pluginConnection(request)).connected, true)
  await assert.rejects(
    fixture({ status: 'active', granted: false, canManage: false }).service.pluginConnection(request),
    { status: 403 }
  )
})
test('browser handoff is limited to the configured platform and validated identities', async () => {
  const { platformCommandUrl } = await import('../electron/workbench-platform.mjs')
  const target = (await fixture().service.pluginConnection(request)).target
  const url = new URL(platformCommandUrl('https://platform.example', target))
  assert.equal(url.origin, 'https://platform.example')
  assert.equal(url.pathname, '/workspace-connection')
  assert.equal(url.searchParams.get('organizationId'), 'organization')
  assert.equal(url.searchParams.get('autostart'), '1')
  assert.equal(platformCommandUrl('https://platform.example', { ...target, bindingId: '//evil' }), null)
})

test('automatic return requires the exact pending attempt and a fresh server-verified shared connection', async () => {
  const { service, binding } = fixture()
  const started = await service.startPluginConnection(request)
  assert.equal(started.status, 'pending')
  assert.equal((await service.checkPluginConnection(started)).status, 'pending')
  binding.status = 'active'
  binding.granted = false
  assert.equal((await service.checkPluginConnection(started)).status, 'pending')
  binding.granted = true
  assert.deepEqual(await service.checkPluginConnection(started), { status: 'connected' })
  await assert.rejects(service.checkPluginConnection(started), { status: 409 })
})
test('cancellation, timeout, organization changes and newer attempts cannot return a stale success', async () => {
  for (const reason of ['cancel', 'timeout', 'organization', 'generation', 'replaced']) {
    const { service, binding } = fixture()
    const started = await service.startPluginConnection(request)
    if (reason === 'cancel') await service.cancelPluginConnection(started)
    if (reason === 'timeout') service.pluginConnectionAttempt.expiresAt = 0
    if (reason === 'organization') service.profile.organizationId = 'different'
    if (reason === 'generation') service.generation++
    if (reason === 'replaced') await service.startPluginConnection(request)
    binding.status = 'active'
    binding.granted = true
    await assert.rejects(service.checkPluginConnection(started), { status: reason === 'timeout' ? 408 : 409 })
  }
})
test('an in-flight completion cannot reactivate Desktop after cancellation', async () => {
  const { service } = fixture()
  const started = await service.startPluginConnection(request)
  let complete
  service.pluginConnection = () =>
    new Promise((resolve) => {
      complete = resolve
    })
  const checking = service.checkPluginConnection(started)
  await service.cancelPluginConnection(started)
  complete({ connected: true })
  await assert.rejects(checking, { status: 409 })
})
test('starting a newer flow supersedes an earlier asynchronous preflight', async () => {
  const { service } = fixture()
  const response = await service.pluginConnection(request)
  let complete
  const normal = service.pluginConnection
  service.pluginConnection = () =>
    new Promise((resolve) => {
      complete = resolve
    })
  const first = service.startPluginConnection(request)
  service.pluginConnection = normal
  const second = await service.startPluginConnection(request)
  complete(response)
  await assert.rejects(first, { status: 409 })
  assert.equal(service.pluginConnectionAttempt.id, second.attemptId)
})
