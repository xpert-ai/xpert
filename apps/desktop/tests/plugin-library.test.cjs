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
  status: 'not_published',
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
test('lists only server-authorized editable workspaces and safely projects the selected catalog', async () => {
  const { service, calls } = fixture({ items: [{ ...plugin, config: { secret: 'private' } }] })
  const result = await service.pluginLibrary({})
  assert.equal(result.workspaceId, 'workspace')
  assert.equal(result.items[0].description, 'Localized')
  assert.equal(result.items[0].icon, 'https://platform.example/assets/icon.svg')
  assert.doesNotMatch(JSON.stringify(result), /private/)
  assert.ok(calls.every(({ options }) => options.scope === 'organization'))
})
test('rejects forged workspaces without reading or writing their catalog', async () => {
  const { service, calls } = fixture()
  await assert.rejects(service.addWorkspacePlugin({ workspaceId: 'forged', packageId: 'package', experts: {} }), {
    status: 403
  })
  assert.equal(calls.length, 1)
})
test('users with no editable workspaces do not enumerate packages', async () => {
  const { service, calls } = fixture({ workspaces: [] })
  assert.deepEqual((await service.pluginLibrary({})).items, [])
  assert.equal(calls.length, 1)
})
test('adds exactly one package to one workspace and never forwards renderer configuration or scope', async () => {
  const { service, calls } = fixture()
  const result = await service.addWorkspacePlugin({
    workspaceId: 'workspace',
    packageId: 'package',
    organizationId: 'forged',
    workspaceIds: ['other'],
    experts: { unused: 'forged' },
    connectorServers: { secret: 'forged' }
  })
  assert.deepEqual(result, { status: 'added', bindingId: 'binding' })
  assert.deepEqual(calls.at(-1).options.body, { packageId: 'package', experts: {} })
  assert.equal(calls.at(-1).path, '/api/agent-plugins/workspaces/workspace/plugins')
})
test('requires valid accessible expert mappings before adding a package', async () => {
  const { service, calls } = fixture({
    items: [{ ...plugin, expertReferences: ['writer'] }],
    experts: [{ id: 'expert', name: 'Writer' }]
  })
  await assert.rejects(
    service.addWorkspacePlugin({ workspaceId: 'workspace', packageId: 'package', experts: { writer: 'private' } }),
    { status: 400 }
  )
  assert.ok(calls.every(({ options }) => !options.method))
  await service.addWorkspacePlugin({ workspaceId: 'workspace', packageId: 'package', experts: { writer: 'expert' } })
  assert.deepEqual(calls.at(-1).options.body.experts, { writer: 'expert' })
})
test('session changes and revoked access stop additions before mutation', async () => {
  const { service, calls } = fixture()
  const read = service.request
  service.request = async (...args) => {
    const result = await read(...args)
    service.generation++
    return result
  }
  await assert.rejects(service.addWorkspacePlugin({ workspaceId: 'workspace', packageId: 'package' }), { status: 409 })
  assert.ok(calls.every(({ options }) => !options.method))
  await assert.rejects(fixture({ fail: new ClientError('Forbidden', 403) }).service.pluginLibrary({}), { status: 403 })
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
