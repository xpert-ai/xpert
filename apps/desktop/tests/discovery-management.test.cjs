const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DesktopService, ClientError } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { platformCommandUrl } = require('../electron/workbench-platform.mjs')

test('plugin access uses the protected organization route and Git writes carry only the package source', async () => {
  const service = new DesktopService()
  const organizationId = randomUUID()
  service.profile = { organizationId }
  let status = 200
  const requests = []
  service.request = async (path, options) => {
    requests.push({ path, options })
    if (status !== 200) throw new ClientError('Permission denied.', status)
    if (options.method === 'HEAD') return ''
    return { id: randomUUID(), organizationId, descriptor: { name: 'Review' }, importStatus: 'existing' }
  }
  assert.equal(await service.organizationPluginAccess(randomUUID()), false)
  assert.equal(requests.length, 0)
  assert.equal(await service.organizationPluginAccess(organizationId), true)
  status = 403
  assert.equal(await service.organizationPluginAccess(organizationId), false)
  status = 503
  await assert.rejects(service.organizationPluginAccess(organizationId), { status: 503 })
  const input = { organizationId, url: 'https://example.org/plugins.git', ref: 'main', subdirectory: 'review' }
  status = 200
  assert.deepEqual((await dispatch(service, 'installOrganizationPlugin', input)).value, {
    existing: true,
    name: 'Review'
  })
  const { path, options } = requests.at(-1)
  assert.equal(path, '/api/agent-plugins/git')
  assert.equal(options.scope, 'organization')
  assert.equal(options.retry, false)
  assert.deepEqual(options.body, { url: input.url, ref: 'main', subdirectory: 'review' })
  assert.equal(
    (await dispatch(service, 'installOrganizationPlugin', { ...input, organizationId: randomUUID() })).status,
    409
  )
})

test('ZIP imports send multipart bytes under file, reject empty files and bind the receipt to the selected organization', async () => {
  const service = new DesktopService()
  const organizationId = randomUUID()
  service.profile = { organizationId }
  let requests = 0
  let resultOrg = organizationId
  const input = { organizationId, bytes: Uint8Array.from([0x50, 0x4b, 0, 255]) }
  service.request = async (path, options) => {
    requests++
    assert.equal(path, '/api/agent-plugins/zip')
    assert.equal(options.method, 'POST')
    assert.equal(options.scope, 'organization')
    assert.equal(options.retry, false)
    assert.deepEqual([...options.body.keys()], ['file'])
    assert.deepEqual(new Uint8Array(await options.body.get('file').arrayBuffer()), input.bytes)
    return { id: randomUUID(), organizationId: resultOrg, descriptor: { name: 'Review' }, importStatus: 'existing' }
  }
  const upload = (input) => dispatch(service, 'installOrganizationPluginZip', input)
  assert.equal((await upload({ ...input, organizationId: randomUUID() })).status, 409)
  assert.equal((await upload({ ...input, bytes: new Uint8Array() })).status, 400)
  assert.equal((await upload({ ...input, bytes: './package.zip' })).status, 400)
  assert.equal(requests, 0)
  assert.deepEqual((await upload(input)).value, { name: 'Review', existing: true })
  resultOrg = randomUUID()
  assert.equal((await upload(input)).status, 502)
})

test('workspace connectors redact credentials, validate key methods and scope every write including disconnect', async () => {
  const service = new DesktopService()
  const target = { workspaceId: randomUUID(), organizationId: randomUUID() }
  const bindingId = randomUUID()
  service.profile = { organizationId: target.organizationId }
  let switchOrganization = false
  const requests = []
  const scope = { type: 'workspace', workspaceId: target.workspaceId }
  service.request = async (path, options) => {
    requests.push({ path, options })
    if (path.includes('definitions?'))
      return [
        {
          provider: 'demo',
          label: 'Demo',
          authMethods: [
            { id: 'old-key', type: 'api_key', deprecated: true },
            { id: 'browser', type: 'oauth2' },
            { id: 'managed', type: 'api_key', credentials: { integration: { provider: 'demo' } } },
            {
              id: 'key',
              type: 'api_key',
              label: 'Token',
              credentials: {
                fields: [{ name: 'token', secret: true, required: true }],
                defaultValues: { token: 'private-default' }
              }
            }
          ]
        }
      ]
    if (path.includes('bindings?')) {
      if (switchOrganization) service.profile = { organizationId: randomUUID() }
      return [
        {
          provider: 'demo',
          scope,
          authorizationMode: 'shared',
          status: 'active',
          id: bindingId,
          profile: { name: 'private-profile' }
        },
        {
          provider: 'demo',
          scope: { type: 'workspace', workspaceId: randomUUID() },
          id: randomUUID(),
          status: 'pending'
        }
      ]
    }
    if (options.method === 'POST') return { status: 'active', connector: { scope, provider: 'demo' } }
  }
  const [item] = (await dispatch(service, 'workspaceConnectors', target)).value
  assert.equal(item.bindingId, bindingId)
  assert.equal(item.status, 'active')
  assert.equal(item.hasWebMethods, true)
  assert.deepEqual(
    item.keyMethods.map((m) => m.id),
    ['key']
  )
  assert.doesNotMatch(JSON.stringify(item), /private-default|private-profile/)
  assert.ok(
    requests.every(
      ({ path, options }) =>
        path.endsWith('scopeType=workspace&scopeId=' + target.workspaceId) && options.scope === 'organization'
    )
  )
  const input = { ...target, provider: 'demo', methodId: 'key', values: { token: 'fixture-token' } }
  for (const methodId of ['old-key', 'browser', 'managed']) {
    assert.equal((await dispatch(service, 'connectWorkspaceApiKey', { ...input, methodId })).status, 400)
  }
  assert.equal(requests.filter((r) => r.options.method === 'POST').length, 0)
  assert.deepEqual((await dispatch(service, 'connectWorkspaceApiKey', input)).value, { connected: true })
  const request = requests.at(-1)
  assert.equal(request.path, '/api/connector/' + target.workspaceId + '/demo/connect')
  assert.deepEqual(request.options.body, { authMethodId: 'key', values: input.values })
  assert.equal(request.options.retry, false)
  await dispatch(service, 'disconnectWorkspaceConnector', { ...target, bindingId })
  assert.equal(requests.at(-1).path, '/api/connector/' + target.workspaceId + '/' + bindingId)
  assert.equal(requests.at(-1).options.method, 'DELETE')
  switchOrganization = true
  assert.equal((await dispatch(service, 'connectWorkspaceApiKey', input)).status, 409)
  assert.equal(requests.filter((r) => r.options.method === 'POST').length, 1)
})

test('connector browser setup names the exact organization, workspace and provider in the platform URL', () => {
  const navigation = {
    target: 'workspace.connectors.manage',
    workspaceId: randomUUID(),
    organizationId: randomUUID(),
    provider: 'custom:payments/v2'
  }
  const link = new URL(platformCommandUrl('https://example.org/app', navigation))
  assert.equal(link.pathname, '/app/xpert/w/' + navigation.workspaceId + '/connectors')
  for (const key of ['provider', 'workspaceId', 'organizationId'])
    assert.equal(link.searchParams.get(key), navigation[key])
  assert.equal(platformCommandUrl('https://example.org', { ...navigation, provider: {} }), null)
})
