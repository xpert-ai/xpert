const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { inlineAvatar } = require('./fixtures/avatar.cjs')

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

test('expert discovery exposes the published business area separately from marketplace categories', async () => {
  const entry = expert('owned')
  entry.xpert.businessArea = { id: 'area-sales', name: 'Sales', secret: 'never-expose' }
  const { service } = fixture(() => ({ items: [entry], total: 1 }))
  const [item] = await service.listCatalog('experts')
  assert.deepEqual(item.businessArea, { id: 'area-sales', name: 'Sales' })
  assert.deepEqual(item.categories, ['productivity'])
  assert.doesNotMatch(JSON.stringify(item), /never-expose/)
})

test('template and expert catalogs preserve inline avatar images and normalize invalid URLs', async () => {
  const avatars = [
    { url: inlineAvatar },
    { url: 'https://example.com/avatar.png' },
    { url: 'data:text/html;base64,PHNjcmlwdD4=', emoji: { id: 'smile', unified: '1F600' } }
  ]
  const { service } = fixture((path) => ({
    items: avatars.map((avatar, index) =>
      path === '/api/xpert-marketplace'
        ? { ...expert('owned'), xpert: { ...expert().xpert, id: `expert-${index}`, avatar } }
        : { id: `template-${index}`, title: 'Assistant', type: 'agent', avatar }
    ),
    total: avatars.length
  }))
  for (const kind of ['templates', 'experts']) {
    const items = await service.listCatalog(kind)
    assert.deepEqual(
      items.map((item) => item.avatarUrl),
      [inlineAvatar, 'https://example.com/avatar.png', null]
    )
    assert.deepEqual(items[2].avatarEmoji, { id: 'smile', unified: '1F600' })
  }
})

test('application screenshots are normalized consistently for catalog and detail without exposing local files', async () => {
  const inline = 'data:image/png;base64,cHJldmlldw=='
  const sources = [
    inline,
    ' https://cdn.example.com/screen.webp ',
    inline,
    '/assets/screenshot.png',
    'http://127.0.0.1:4200/local.png',
    './assets/unresolved-plugin-file.png',
    'file:///private/screenshot.png',
    'javascript:alert(1)',
    'data:text/html;base64,cHJldmlldw==',
    'https://user:secret@example.com/private.png',
    '//untrusted.example.com/image.png',
    'http://remote.example.com/insecure.png',
    'https://',
    '  ',
    null,
    42
  ]
  const response = {
    ...detail,
    application: { ...app, config: { presentation: { screenshots: sources } } }
  }
  const { service } = fixture((path) => (path.endsWith('/catalog') ? [response] : response))
  service.configure({ ...service.config, webUrl: 'https://workspace.example.com/explore' })
  service.credentials = { token: 'fixture' }
  service.profile = { organizationId: 'org-1' }
  const expected = [
    inline,
    'https://cdn.example.com/screen.webp',
    'https://workspace.example.com/assets/screenshot.png',
    'http://127.0.0.1:4200/local.png'
  ]
  assert.deepEqual((await service.listCatalog('applications'))[0].screenshots, expected)
  assert.deepEqual((await service.applicationSetup(app)).application.screenshots, expected)
  response.application.config.presentation.screenshots = null
  assert.deepEqual((await service.listCatalog('applications'))[0].screenshots, [])
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
    if (path.endsWith('/setup')) return new Response('not found', { status: 404 })
    if (path === '/api/copilot/availables/primary')
      return { id: 'primary', copilotModel: { model: 'default', modelType: 'llm' } }
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
    if (path.endsWith('/setup')) return new Response('not found', { status: 404 })
    if (path === '/api/copilot/availables/primary')
      return { id: 'primary', copilotModel: { model: 'default', modelType: 'llm' } }
    if (path.endsWith('/my')) return { items: [{ id: 'workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/install')) throw new Error('Connection reset after sending request')
    return { type: 'agent' }
  })
  await assert.rejects(service.installTemplate({ id: 'template', workspaceId: 'workspace', title: 'Test' }), {
    status: 503
  })
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
})

test('template preflight requires an authorized primary default and never exposes its configuration', async () => {
  let primary = null
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my'))
      return { items: [{ id: 'workspace', name: 'Workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/setup')) return new Response('not found', { status: 404 })
    if (path === '/api/copilot/availables/primary') return primary
    // A secondary model alone is insufficient for managed import.
    if (path === '/api/copilot/models') return [{ id: 'secondary' }]
    return { type: 'agent' }
  })
  for (const invalid of [
    null,
    { id: 'primary' },
    { id: 'primary', copilotModel: { model: ' ' } },
    { id: 'primary', copilotModel: { model: 'embed', modelType: 'text-embedding' } }
  ]) {
    primary = invalid
    assert.deepEqual(await service.templateSetup(), {
      workspaces: [{ id: 'workspace', name: 'Workspace' }],
      hasPrimaryLanguageModel: false
    })
    await assert.rejects(service.installTemplate({ id: 'template', workspaceId: 'workspace', title: 'Test' }), {
      status: 403
    })
  }
  assert.ok(calls.every((call) => call.method === 'GET'))
  for (const modelType of ['llm', undefined]) {
    primary = { id: 'primary', copilotModel: { model: 'custom-default', modelType }, credentials: 'never-expose' }
    assert.equal((await service.templateSetup()).hasPrimaryLanguageModel, true)
    assert.doesNotMatch(JSON.stringify(await service.templateSetup()), /never-expose|custom-default/)
  }
})

test('template install rechecks the primary default after setup and fails closed on lookup errors', async () => {
  let primary = { id: 'primary', copilotModel: { model: 'default', modelType: 'llm' } }
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my')) return { items: [{ id: 'workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/setup')) return new Response('not found', { status: 404 })
    if (path === '/api/copilot/availables/primary') return primary
    return { type: 'agent' }
  })
  assert.equal((await service.templateSetup()).hasPrimaryLanguageModel, true)
  primary = null
  await assert.rejects(service.installTemplate({ id: 'template', workspaceId: 'workspace', title: 'Test' }), {
    status: 403
  })
  primary = new Response('denied', { status: 403 })
  await assert.rejects(service.templateSetup(), { status: 403 })
  assert.ok(calls.every((call) => call.method === 'GET'))
})

test('capability template setup selects a compatible model without relying on the organization default', async () => {
  let allowed = true
  const model = { copilotId: 'vision-provider', model: 'vision-model', modelType: 'llm' }
  const { service, calls } = fixture((path, _options, url) => {
    if (path.endsWith('/my'))
      return { items: [{ id: 'workspace', name: 'Workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/setup')) {
      assert.equal(url.searchParams.get('capabilities'), 'document-analysis')
      return {
        canInstall: allowed,
        reason: allowed ? '' : 'Model access revoked',
        requiredModelFeatures: ['vision', 'tool-call'],
        models: allowed
          ? [{ id: 'vision', label: 'Vision model', copilotModel: model, credentials: 'never-expose' }]
          : [],
        optionalCapabilities: [
          { key: 'document-analysis', label: 'Document analysis', description: 'Optional analysis capability' }
        ]
      }
    }
    if (path.endsWith('/install')) return { xpert: { id: 'installed' } }
    return { type: 'agent' }
  })
  const input = {
    id: 'sample-template',
    capabilities: ['document-analysis'],
    workspaceId: 'workspace',
    title: 'Sample Assistant'
  }
  const setup = await service.templateSetup(input)
  assert.deepEqual(setup.preflight.models, [{ id: 'vision', label: 'Vision model' }])
  assert.doesNotMatch(JSON.stringify(setup), /never-expose|copilotModel|vision-provider/)
  await assert.rejects(service.installTemplate(input), /compatible model/)
  await assert.rejects(service.installTemplate({ ...input, modelId: 'forged' }), /compatible model/)
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0)
  await service.installTemplate({ ...input, modelId: 'vision', basic: { copilotModel: { copilotId: 'forged' } } })
  assert.deepEqual(calls.at(-1).body, {
    workspaceId: 'workspace',
    publish: true,
    basic: { title: 'Sample Assistant', copilotModel: model },
    capabilities: ['document-analysis']
  })
  assert.ok(calls.every((call) => !call.path.includes('/availables/primary')))
  allowed = false
  await assert.rejects(service.installTemplate({ ...input, modelId: 'vision' }), /Model access revoked/)
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1)
})

test('older servers do not silently ignore explicit template capabilities', async () => {
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my')) return { items: [{ id: 'workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/setup')) return new Response('not found', { status: 404 })
    return { type: 'agent' }
  })
  await assert.rejects(
    service.installTemplate({
      id: 'template',
      workspaceId: 'workspace',
      title: 'Test',
      capabilities: ['document-analysis']
    }),
    { status: 404 }
  )
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0)
})

test('blank assistant creation requires an authorized model even with no optional capabilities', async () => {
  const model = { copilotId: 'provider', model: 'text-model', modelType: 'llm' }
  const { service, calls } = fixture((path) => {
    if (path.endsWith('/my'))
      return { items: [{ id: 'writable', name: 'Workspace', capabilities: { canWrite: true } }] }
    if (path.endsWith('/setup'))
      return {
        canInstall: true,
        requiresModel: true,
        requiredModelFeatures: [],
        optionalCapabilities: [],
        models: [{ id: 'model', label: 'Text model', copilotModel: model }]
      }
    if (path.endsWith('/install')) return { xpert: { id: 'created' } }
    if (path === '/api/xpert-template/xpert-blank-assistant') return { type: 'agent' }
    throw new Error(`Unexpected request: ${path}`)
  })
  const input = { id: 'xpert-blank-assistant', title: 'My expert', workspaceId: 'writable', capabilities: [] }
  const setup = await service.templateSetup(input)
  assert.equal(setup.preflight.requiresModel, true)
  assert.equal(setup.hasPrimaryLanguageModel, false)
  await assert.rejects(service.installTemplate(input), /compatible model/)
  await assert.rejects(service.installTemplate({ ...input, workspaceId: 'read-only', modelId: 'model' }), /edit access/)
  assert.equal(calls.filter((call) => call.method === 'POST').length, 0)
  assert.deepEqual(await service.installTemplate({ ...input, modelId: 'model' }), { botId: 'created' })
  assert.deepEqual(calls.at(-1).body, {
    workspaceId: 'writable',
    publish: true,
    basic: { title: 'My expert', copilotModel: model }
  })
  assert.equal(calls.at(-1).headers['organization-id'], 'org-1')
})
