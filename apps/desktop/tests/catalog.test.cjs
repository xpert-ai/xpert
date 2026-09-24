const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')

const app = {
  id: '@test/app:office',
  pluginName: '@test/app',
  appName: 'office',
  displayName: { zh_Hans: '办公助手', en_US: 'Office' },
  config: { presentation: { initializationSteps: [{ zh_Hans: '创建助手' }] }, privateSetting: 'never-expose' }
}
const detail = {
  application: app,
  status: { status: 'not_installed', initializationAccess: 'allowed' },
  preflight: {
    supported: true,
    canInitialize: true,
    modelRequirements: { embedding: true },
    embeddingModels: [{ id: 'model-1', label: { zh_Hans: '嵌入模型' }, privateKey: 'never-expose' }],
    visionModels: [],
    defaultEmbeddingModelId: 'model-1'
  }
}
const expert = (accessStatus = 'not_requested') => ({
  xpert: { id: 'expert-1', title: '专家', name: 'expert', privateKey: 'never-expose' },
  marketplace: { businessCategories: ['productivity'], technical: { categories: ['workflow'] } },
  accessStatus
})
function fixture(handler) {
  const calls = []
  const service = new DesktopService({
    fetcher: async (url, options) => {
      const path = new URL(url).pathname
      calls.push({ url, path, ...options, body: options.body ? JSON.parse(options.body) : undefined })
      const result = await handler(path, options, new URL(url))
      return result instanceof Response ? result : new Response(JSON.stringify(result))
    }
  })
  service.credentials = { token: 'private-account-token', tenantId: 'tenant-1' }
  service.profile = { organizationId: 'org-1', organizations: [{ id: 'org-1' }, { id: 'org-2' }] }
  return { service, calls }
}

test('catalog follows pagination and does not leak DSL, application configuration or account credentials', async () => {
  const { service, calls } = fixture((path, options, url) => {
    if (path === '/api/plugin-applications/catalog') return [detail]
    if (path === '/api/xpert-marketplace') return { items: [expert('owned')], total: 1 }
    if (url.searchParams.get('offset') === '0')
      return {
        items: [
          { id: 'template-1', title: '助手', type: 'agent', export_data: 'never-expose' },
          { id: 'app-template', type: 'agent', application: app },
          { id: 'knowledge', type: 'knowledge' }
        ],
        total: 4
      }
    assert.equal(url.searchParams.get('offset'), '3')
    return { items: [{ id: 'template-2', title: '助手 2', type: 'copilot' }], total: 4 }
  })
  const templates = await dispatch(service, 'listCatalog', 'templates')
  assert.deepEqual(
    templates.value.map((item) => item.id),
    ['template-1', 'template-2']
  )
  const apps = await service.listCatalog('applications')
  const experts = await service.listCatalog('experts')
  assert.equal(apps[0].name, 'Office')
  assert.equal(experts[0].access, 'owned')
  assert.doesNotMatch(JSON.stringify({ templates, apps, experts }), /never-expose|private-account-token/)
  assert.ok(calls.every((call) => call.headers['organization-id'] === 'org-1'))
})

test('expert access request rechecks access and submits only the reason, not renderer scope', async () => {
  let requested = false
  const { service, calls } = fixture((path, options) => {
    if (options.method === 'POST') {
      requested = true
      return { status: 'requested' }
    }
    return expert(requested ? 'requested' : 'rejected')
  })
  const result = await service.requestExpertAccess({
    id: 'expert-1',
    reason: ' 每周报表分析 ',
    organizationId: 'other'
  })
  assert.equal(result.access, 'requested')
  assert.deepEqual(calls.find((call) => call.method === 'POST').body, { reason: '每周报表分析' })
  await service.requestExpertAccess({ id: 'expert-1', reason: '重复点击' })
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
  await assert.rejects(service.requestExpertAccess({ id: 'expert-1', reason: 'x'.repeat(501) }), { status: 400 })
})

test('application initialization validates models and forwards only trusted selections and operation ID', async () => {
  const { service, calls } = fixture((path) =>
    path.endsWith('/initialize') ? { status: 'ready', xpertId: 'new-assistant' } : detail
  )
  const setup = await service.applicationSetup(app)
  assert.deepEqual(setup.embeddingModels, [{ id: 'model-1', label: '嵌入模型' }])
  await assert.rejects(service.initializeApplication({ ...app, operationId: 'op-1', embeddingModelId: 'forged' }), {
    status: 400
  })
  assert.ok(!calls.some((call) => call.method === 'POST'))
  const result = await service.initializeApplication({
    ...app,
    operationId: 'op-1',
    embeddingModelId: 'model-1',
    workspaceId: 'forged',
    organizationId: 'forged'
  })
  assert.equal(result.botId, 'new-assistant')
  assert.deepEqual(calls.at(-1).body, {
    pluginName: '@test/app',
    appName: 'office',
    operationId: 'op-1',
    embeddingModelId: 'model-1'
  })
})

test('application preflight denial and initializing state prevent writes; ready applications open without reinstalling', async () => {
  let result = { ...detail, preflight: { ...detail.preflight, canInitialize: false, reason: 'role_required' } }
  const { service, calls } = fixture(() => result)
  await assert.rejects(service.initializeApplication(app), { status: 403 })
  result = { ...detail, status: { status: 'initializing' } }
  await assert.rejects(service.initializeApplication(app), { status: 409 })
  result = { ...detail, status: { status: 'ready', xpertId: 'existing' } }
  assert.deepEqual(await service.initializeApplication(app), { botId: 'existing' })
  assert.ok(calls.every((call) => call.method === 'GET'))
})

test('template install requires a writable workspace, excludes app templates and publishes the created assistant', async () => {
  let isApp = false
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my'))
      return {
        items: [
          { id: 'writable', name: '可写', capabilities: { canWrite: true } },
          { id: 'readonly', name: '只读', capabilities: { canWrite: false } }
        ]
      }
    if (path.endsWith('/install')) return { xpert: { id: 'published', export_data: 'never-expose' } }
    return { type: 'agent', ...(isApp ? { application: app } : {}) }
  })
  const input = { id: '@test/plugin:template', workspaceId: 'writable', title: '我的助手' }
  await assert.rejects(service.installTemplate({ ...input, workspaceId: 'readonly' }), { status: 403 })
  assert.ok(!calls.some((call) => call.method === 'POST'))
  isApp = true
  await assert.rejects(service.installTemplate(input), /Apps tab/)
  isApp = false
  assert.deepEqual(
    await service.installTemplate({ ...input, tenantId: 'forged', basic: { copilotModel: { secret: 'forged' } } }),
    { botId: 'published' }
  )
  assert.equal(calls.at(-1).path, '/api/xpert-template/%40test%2Fplugin%3Atemplate/install')
  assert.deepEqual(calls.at(-1).body, { workspaceId: 'writable', publish: true, basic: { title: '我的助手' } })
})

test('organization switch while resolving template setup cancels installation before any write', async () => {
  let release
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const { service, calls } = fixture(async () => {
    await gate
    return { items: [{ id: 'workspace', name: '工作区', capabilities: { canWrite: true } }] }
  })
  const pending = service.installTemplate({ id: 'template', workspaceId: 'workspace', title: 'Test' })
  await service.selectOrganization('org-2')
  release()
  await assert.rejects(pending, { status: 409 })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
})

test('ambiguous template POST failures are never automatically retried', async () => {
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my')) return { items: [{ id: 'workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/install')) throw new Error('Connection reset after sending request')
    return { type: 'agent' }
  })
  await assert.rejects(service.installTemplate({ id: 'template', workspaceId: 'workspace', title: 'Test' }), {
    status: 503
  })
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
})
