const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ClientError } = require('../electron/service.cjs')
const { createPluginLibraryMethods } = require('../electron/plugin-library.cjs')
const plugin = {
  id: 'package',
  name: 'Documents',
  description: { zh_Hans: 'Localized' },
  icon: '/assets/icon.svg',
  version: '1',
  status: 'available',
  scope: 'organization',
  components: [{ kind: 'skill', name: 'write' }],
  expertReferences: []
}
function fixture({ workspaces = [{ id: 'workspace', name: 'Editable' }], items = [plugin], experts = [], fail } = {}) {
  const calls = []
  const service = {
    generation: 1,
    profile: { organizationId: 'organization' },
    config: { locale: 'zh-Hans', webUrl: 'https://platform.example' },
    ...createPluginLibraryMethods(ClientError),
    request: async (path, options) => {
      calls.push({ path, options })
      if (fail) throw fail
      if (path.endsWith('workspace-options')) return { workspaces, experts }
      if (path.endsWith('/plugins')) return { status: 'added', bindingId: 'binding', secret: 'private' }
      return { items }
    }
  }
  return { service, calls }
}
test('reads the installation catalog without workspace authoring access and strips private configuration', async () => {
  const { service, calls } = fixture({ workspaces: [], items: [{ ...plugin, config: { secret: 'private' } }] })
  const result = await service.pluginLibrary({ workspaceId: 'forged', organizationId: 'forged' })
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].scope, 'organization')
  assert.equal(result.items[0].description, 'Localized')
  assert.equal(result.items[0].icon, 'https://platform.example/assets/icon.svg')
  assert.doesNotMatch(JSON.stringify(result), /private|workspaceId|expertReferences/)
  assert.deepEqual(calls, [{ path: '/api/agent-plugins/catalog', options: { scope: 'organization' } }])
  assert.equal(service.addWorkspacePlugin, undefined)
})
test('uses tenant scope from the host session when no organization is selected', async () => {
  const { service, calls } = fixture({ items: [{ ...plugin, scope: 'tenant' }] })
  service.profile = { tenantId: 'tenant' }
  assert.equal((await service.pluginLibrary()).items[0].scope, 'tenant')
  assert.equal(calls[0].options.scope, 'tenant')
})
test('session changes and revoked access discard the catalog', async () => {
  const { service, calls } = fixture()
  const read = service.request
  service.request = async (...args) => {
    const result = await read(...args)
    service.generation++
    return result
  }
  await assert.rejects(service.pluginLibrary(), { status: 409 })
  assert.ok(calls.every(({ options }) => !options.method))
  await assert.rejects(fixture({ fail: new ClientError('Forbidden', 403) }).service.pluginLibrary(), { status: 403 })
})
test('invalid and credential-bearing icon sources cannot reach the renderer', async () => {
  const icons = [
    'javascript:alert(1)',
    'file:///private/icon.svg',
    'https://user:secret@example.test/icon.svg',
    undefined,
    'data:image/png;base64,aWNvbg=='
  ]
  const { items } = await fixture({
    items: icons.map((icon, index) => ({ ...plugin, id: String(index), icon }))
  }).service.pluginLibrary({})
  assert.ok(items.filter((item) => item.id !== '4').every((item) => item.icon === null))
  assert.equal(items.find((item) => item.id === '4').icon, icons[4])
})
