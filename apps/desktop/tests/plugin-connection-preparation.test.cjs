const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ClientError } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { createPluginConnectionMethods } = require('../electron/plugin-connections.cjs')

function fixture({ canManage = true, installed = true, bindings = [], items = [], afterRequest } = {}) {
  const calls = []
  const scope = { type: 'workspace', workspaceId: 'workspace' }
  const service = {
    generation: 0,
    config: { locale: 'en' },
    profile: { organizationId: 'organization' },
    bots: [{ id: 'bot', assistantId: 'assistant' }],
    ...createPluginConnectionMethods(ClientError),
    async request(path, options) {
      calls.push({ path, options })
      let result
      if (path.startsWith('/api/ai/assistants/'))
        result = {
          scope,
          workspaceScope: scope,
          canManageWorkspace: canManage,
          items
        }
      else if (path.startsWith('/api/connector/definitions?')) result = installed ? [{ provider: 'github' }] : []
      else if (path.startsWith('/api/connector/bindings?')) result = bindings
      else {
        assert.equal(path, '/api/connector/bindings')
        assert.equal(options.method, 'POST')
        result = { id: 'created', provider: 'github', scope, credentials: 'never-return' }
      }
      afterRequest?.(calls.length, service)
      return result
    }
  }
  return { service, calls }
}
const request = { assistantId: 'assistant', provider: 'github' }

test('IPC prepares a shared binding in the host-resolved workspace and organization', async () => {
  const { service, calls } = fixture()
  const response = await dispatch(service, 'preparePluginConnection', {
    ...request,
    workspaceId: 'forged',
    organizationId: 'forged',
    bindingId: 'forged',
    url: 'https://untrusted.invalid'
  })
  assert.deepEqual(response, {
    ok: true,
    value: { success: true, data: { assistantId: 'assistant', bindingId: 'created' } }
  })
  assert.equal(calls.length, 4)
  for (const { options } of calls) assert.equal(options.scope, 'organization')
  assert.match(calls[1].path, /scopeType=workspace&scopeId=workspace$/)
  assert.deepEqual(calls[3].options.body, {
    scope: { type: 'workspace', workspaceId: 'workspace' },
    provider: 'github',
    authorizationMode: 'shared'
  })
  assert.doesNotMatch(JSON.stringify({ response, calls }), /forged|untrusted|never-return/)
})

test('existing shared and legacy personal bindings are reused without creating duplicates', async () => {
  for (const authorizationMode of ['shared', 'personal']) {
    const { service, calls } = fixture({ bindings: [{ id: 'existing', provider: 'github', authorizationMode }] })
    assert.deepEqual(await service.preparePluginConnection(request), {
      success: true,
      data: { assistantId: 'assistant', bindingId: 'existing' }
    })
    assert.equal(calls.length, 3)
    assert.ok(calls.every(({ options }) => options.method !== 'POST'))
  }
})

test('active authorized workspace connections need no configuration permission', async () => {
  const item = {
    bindingId: 'active',
    provider: 'github',
    scope: { type: 'workspace', workspaceId: 'workspace' },
    authorizationMode: 'shared',
    status: 'active',
    granted: true
  }
  const { service, calls } = fixture({ canManage: false, items: [item] })
  assert.equal((await service.preparePluginConnection(request)).data.bindingId, 'active')
  assert.equal(calls.length, 1)
  for (const override of [
    { granted: false },
    { authorizationMode: 'personal' },
    { status: 'disconnected' },
    { scope: { type: 'workspace', workspaceId: 'other' } },
    { scope: { type: 'project', projectId: 'project' } }
  ]) {
    const f = fixture({ canManage: false, items: [{ ...item, ...override }] })
    assert.equal((await f.service.preparePluginConnection(request)).code, 'workspace_management_required')
    assert.equal(f.calls.length, 1)
  }
})

test('missing provider, management permission, and invalid identities fail before mutation', async () => {
  for (const [options, code, count] of [
    [{ installed: false }, 'connector_not_installed', 2],
    [{ canManage: false }, 'workspace_management_required', 1]
  ]) {
    const { service, calls } = fixture(options)
    assert.equal((await service.preparePluginConnection(request)).code, code)
    assert.equal(calls.length, count)
  }
  for (const input of [
    undefined,
    {},
    { ...request, provider: '../github' },
    { ...request, assistantId: '../assistant' }
  ]) {
    const { service, calls } = fixture()
    assert.equal((await service.preparePluginConnection(input)).code, 'invalid_payload')
    assert.equal(calls.length, 0)
  }
  const { service, calls } = fixture()
  assert.equal((await service.preparePluginConnection({ ...request, assistantId: 'other' })).code, 'forbidden')
  service.profile.organizationId = null
  assert.equal((await service.preparePluginConnection(request)).code, 'forbidden')
  assert.equal(calls.length, 0)
})

test('account or organization changes at each asynchronous boundary stop the old preparation', async () => {
  for (const field of ['generation', 'organizationId'])
    for (const boundary of [1, 2, 3, 4]) {
      const { service, calls } = fixture({
        afterRequest(count, service) {
          if (count === boundary) {
            if (field === 'generation') service.generation++
            else service.profile.organizationId = 'other'
          }
        }
      })
      assert.equal((await service.preparePluginConnection(request)).code, 'context_changed')
      assert.equal(calls.length, boundary, 'no later request may run in the new organization')
    }
})
