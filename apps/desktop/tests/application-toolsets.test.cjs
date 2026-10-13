const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { reconcileApplicationToolsets, applicationToolsetsSelected } = require('../src/catalog/application-toolsets.ts')

const app = { pluginName: '@test/app', appName: 'bid' }
const requirement = {
  key: 'image-tools',
  pluginName: '@test/images',
  provider: 'images',
  label: { en_US: 'Image tools', zh_Hans: '图像工具' },
  providerAvailable: true,
  options: [{ id: 'source', name: 'Images', workspaceName: 'Organization', credentials: 'never-expose' }]
}
function fixture(override = () => undefined) {
  const calls = []
  const detail = {
    application: { ...app, id: 'app-id', displayName: 'Bid', config: {} },
    status: { status: 'not_installed', initializationAccess: 'allowed' },
    preflight: {
      supported: true,
      canInitialize: true,
      embeddingModels: [],
      visionModels: [],
      toolsetRequirements: [structuredClone(requirement)]
    }
  }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      const path = new URL(url).pathname
      const body = options.body ? JSON.parse(options.body) : undefined
      calls.push({ path, body, ...options })
      calls.at(-1).body = body
      let result = await override(path, body, detail)
      if (result === undefined) {
        if (path.endsWith('/detail')) result = detail
        else if (path.endsWith('/initialize')) result = { status: 'ready', xpertId: 'assistant' }
        else if (path.endsWith('/credentials-schema'))
          result = [{ name: 'api_key', type: 'secret-input', required: true }]
        else if (path.endsWith('/tools'))
          result = [{ identity: { name: 'image', label: 'Generate image' }, schema: { type: 'object' } }]
        else if (path.endsWith('/prepare'))
          result = { status: 'configuring', workspaceId: 'server-workspace', canDiscardConfiguration: true }
        else if (path.endsWith('/instance')) result = { id: 'managed', credentials: 'never-expose' }
        else if (path.endsWith('/bind-toolset')) result = { status: 'configuring' }
        else throw new Error(`Unexpected request: ${path}`)
      }
      return result instanceof Response ? result : new Response(JSON.stringify(result))
    }
  })
  service.credentials = { token: 'account-secret', tenantId: 'tenant' }
  service.profile = { organizationId: 'organization' }
  return { service, calls, detail }
}
const input = { ...app, operationId: 'op', toolsets: [{ key: requirement.key, toolsetId: 'source' }] }

test('tool preflight includes configuring state and localized authorized options without credentials', async () => {
  const { service, detail } = fixture()
  detail.status.status = 'configuring'
  detail.status.canDiscardConfiguration = true
  const response = await dispatch(service, 'applicationSetup', app)
  assert.equal(response.ok, true)
  assert.equal(response.value.application.status, 'configuring')
  assert.equal(response.value.canConfigure, true)
  assert.equal(response.value.canDiscardConfiguration, true)
  assert.equal(response.value.toolsetRequirements[0].label, 'Image tools')
  assert.doesNotMatch(JSON.stringify(response), /never-expose|account-secret/)
})

test('initialization requires an explicit authorized selection and rechecks it before any write', async () => {
  const { service, calls, detail } = fixture()
  for (const toolsets of [
    undefined,
    [],
    [{ key: 'unknown', toolsetId: 'source' }],
    [{ key: requirement.key, toolsetId: 'forged' }],
    [...input.toolsets, ...input.toolsets],
    [{ ...input.toolsets[0], credentials: 'forged' }]
  ]) {
    await assert.rejects(service.initializeApplication({ ...input, toolsets }), { status: 400 })
  }
  assert.ok(calls.every((call) => call.method === 'GET'))
  assert.deepEqual(await service.initializeApplication({ ...input, workspaceId: 'forged', organizationId: 'forged' }), {
    botId: 'assistant'
  })
  assert.deepEqual(calls.at(-1).body, input)
  assert.equal(calls.at(-1).headers['x-scope-level'], 'organization')
  assert.equal(calls.at(-1).headers['organization-id'], 'organization')
  detail.preflight.toolsetRequirements[0].options = []
  await assert.rejects(service.initializeApplication(input), { status: 400 })
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
})

test('managed bindings cannot be replaced by arbitrary sources and ready apps remain read only', async () => {
  const { service, calls, detail } = fixture()
  detail.preflight.toolsetRequirements[0].configuredToolsetId = 'source'
  await assert.rejects(
    service.initializeApplication({ ...input, toolsets: [{ key: requirement.key, toolsetId: 'other' }] }),
    { status: 400 }
  )
  await service.initializeApplication({ ...input, toolsets: [] })
  assert.deepEqual(calls.at(-1).body.toolsets, input.toolsets)
  detail.status = { status: 'ready', xpertId: 'already-installed' }
  assert.deepEqual(await service.initializeApplication(app), { botId: 'already-installed' })
})

test('refresh preserves valid choices, drops revoked ones and never chooses a source automatically', () => {
  assert.deepEqual(reconcileApplicationToolsets([requirement], []), [])
  assert.equal(applicationToolsetsSelected([requirement], []), false)
  assert.deepEqual(reconcileApplicationToolsets([requirement], input.toolsets), input.toolsets)
  const revoked = { ...requirement, options: [] }
  assert.deepEqual(reconcileApplicationToolsets([revoked], input.toolsets), [])
  assert.equal(applicationToolsetsSelected([revoked], input.toolsets), false)
  assert.equal(applicationToolsetsSelected([{ ...requirement, providerAvailable: false }], input.toolsets), false)
})

test('new tool configuration validates before preparing a workspace and saves then binds server-owned IDs', async () => {
  const { service, calls } = fixture()
  const setup = await dispatch(service, 'applicationToolsetSetup', { ...app, key: requirement.key })
  assert.equal(setup.ok, true)
  assert.equal(setup.value.fields[0].type, 'secret-input')
  assert.ok(calls.every((call) => call.method === 'GET'))
  const save = {
    ...app,
    key: requirement.key,
    name: 'New images',
    credentials: { api_key: 'input-secret' },
    tools: ['image']
  }
  for (const invalid of [
    { ...save, credentials: {} },
    { ...save, tools: [] },
    { ...save, tools: ['forged'] },
    { ...save, credentials: { api_key: 'x', injected: 'y' } }
  ])
    await assert.rejects(service.saveApplicationToolset(invalid), { status: 400 })
  assert.ok(calls.every((call) => call.method === 'GET'))
  const result = await service.saveApplicationToolset({
    ...save,
    workspaceId: 'forged',
    provider: 'forged',
    id: 'forged'
  })
  assert.deepEqual(result, { key: requirement.key, toolsetId: 'managed' })
  const writes = calls.filter((call) => call.method === 'POST')
  assert.deepEqual(
    writes.map((call) => call.path),
    [
      '/api/plugin-applications/prepare',
      '/api/xpert-toolset/builtin-provider/images/instance',
      '/api/plugin-applications/bind-toolset'
    ]
  )
  assert.equal(writes[1].body.workspaceId, 'server-workspace')
  assert.equal(writes[1].body.id, undefined)
  assert.deepEqual(writes[1].body.credentials, save.credentials)
  assert.equal(writes[1].body.tools[0].enabled, true)
  assert.deepEqual(writes[2].body, { ...app, key: requirement.key, toolsetId: 'managed' })
  assert.ok(writes.every((call) => call.headers['x-scope-level'] === 'organization'))
  assert.doesNotMatch(JSON.stringify(result), /secret/)
})

test('editing preserves saved secrets in the host and uses explicit disabled/enabled tool flags', async () => {
  const { service, calls, detail } = fixture((path) => {
    if (path === '/api/xpert-toolset/managed')
      return {
        id: 'managed',
        type: 'images',
        workspaceId: 'server-workspace',
        name: 'Managed',
        tools: [{ id: 'tool', name: 'image', enabled: false }]
      }
    if (path.endsWith('/credentials')) return { api_key: 'saved-secret' }
  })
  detail.preflight.toolsetRequirements[0].configuredToolsetId = 'managed'
  const setup = await service.applicationToolsetSetup({ ...app, key: requirement.key })
  assert.equal(setup.fields[0].hasValue, true)
  assert.equal(setup.fields[0].value, undefined)
  assert.equal(setup.tools[0].enabled, false)
  assert.doesNotMatch(JSON.stringify(setup), /saved-secret/)
  await service.saveApplicationToolset({
    ...app,
    key: requirement.key,
    name: 'Edited',
    credentials: {},
    tools: ['image']
  })
  const write = calls.find((call) => call.path.endsWith('/instance'))
  assert.equal(write.body.credentials.api_key, 'saved-secret')
  assert.equal(write.body.id, 'managed')
  assert.equal(write.body.tools[0].id, 'tool')
})

test('provider schemas requiring advanced controls fail closed without preparing or writing', async () => {
  const { service, calls } = fixture((path) =>
    path.endsWith('/credentials-schema') ? [{ name: 'model', type: 'copilot-model' }] : undefined
  )
  assert.equal((await service.applicationToolsetSetup({ ...app, key: requirement.key })).supported, false)
  await assert.rejects(
    service.saveApplicationToolset({ ...app, key: requirement.key, name: 'Tool', credentials: {}, tools: ['image'] }),
    { status: 400 }
  )
  assert.ok(calls.every((call) => call.method === 'GET'))
})

test('providers without credentials can configure tools; discard rechecks the server capability', async () => {
  const { service, calls, detail } = fixture((path) => {
    if (path.endsWith('/credentials-schema')) return []
    if (path.endsWith('/discard-configuration')) {
      detail.status.canDiscardConfiguration = false
      return { status: 'not_installed' }
    }
  })
  await service.saveApplicationToolset({
    ...app,
    key: requirement.key,
    name: 'Seedream',
    credentials: {},
    tools: ['image']
  })
  await assert.rejects(service.discardApplicationConfiguration(app), { status: 409 })
  detail.status.status = 'configuring'
  detail.status.canDiscardConfiguration = true
  await dispatch(service, 'discardApplicationConfiguration', { ...app, workspaceId: 'forged' })
  assert.deepEqual(calls.find((call) => call.path.endsWith('/discard-configuration')).body, app)
})

test('installation shows scoped server validation messages instead of a generic HTTP 400', async () => {
  const { service } = fixture((path) =>
    path.endsWith('/initialize')
      ? new Response(JSON.stringify({ message: 'Required image tool configuration is unavailable.' }), { status: 400 })
      : undefined
  )
  const result = await dispatch(service, 'initializeApplication', input)
  assert.equal(result.ok, false)
  assert.equal(result.status, 400)
  assert.equal(result.message, 'Required image tool configuration is unavailable.')
})
