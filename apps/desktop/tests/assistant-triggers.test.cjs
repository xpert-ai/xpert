const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantTriggerMethods } = require('../electron/assistant-triggers.cjs')
const { presentTriggerSettings } = require('../src/profile/triggers/model.ts')
class ClientError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
const snapshot = {
  revision: 'a'.repeat(64),
  canEdit: true,
  items: [],
  providers: [
    {
      name: 'telegram',
      schema: {
        properties: {
          integrationId: { 'x-ui': { selectUrl: '/api/integration/select-options?provider=telegram' } }
        }
      }
    }
  ]
}
test('Bosi resolves its catalog locally and gives explicit provider metadata precedence', () => {
  const data = {
    ...snapshot,
    providers: [
      ...snapshot.providers,
      { name: 'schedule' },
      { name: 'custom-event', label: { en_US: 'Telegram' } },
      { name: 'linear', presentation: { category: 'automation', kind: 'webhook' } }
    ],
    items: ['telegram', 'schedule', 'custom-event', 'linear', 'slack'].map((provider) => ({ provider }))
  }
  const result = presentTriggerSettings(data)
  assert.equal(data.providers[0].presentation, undefined)
  assert.deepEqual(result.providers[0].presentation, {
    category: 'channel',
    channel: 'telegram',
    accountFields: ['integrationId', 'connectorId']
  })
  assert.equal(result.providers[1].presentation.instructionField, 'task')
  assert.equal(result.providers[2].presentation.kind, 'app-event')
  assert.equal(result.providers[3].presentation.kind, 'webhook')
  assert.deepEqual(
    result.items.map((item) => item.category),
    ['channel', 'automation', 'automation', 'automation', 'channel']
  )
})
const fixture = (request) => ({
  ...createAssistantTriggerMethods(ClientError),
  generation: 1,
  config: { locale: 'en', webUrl: 'https://app.example.test' },
  profile: { organizationId: 'org' },
  bots: [{ id: 'copy', assistantId: 'actual' }],
  request
})
test('trigger settings resolve the assistant and retain organization scope', async () => {
  const service = fixture(async (path, options) => {
    assert.equal(path, '/api/xpert/actual/trigger-settings')
    assert.equal(options.scope, 'organization')
    return snapshot
  })
  assert.deepEqual(await service.assistantTriggers({ botId: 'copy' }), snapshot)
  assert.throws(() => service.assistantTriggers({ botId: 'forged' }), { status: 403 })
})
test('mutation never retries and reports stale revisions', async () => {
  let calls = 0
  const service = fixture(async (path, options) => {
    calls++
    assert.equal(options.retry, false)
    assert.equal(options.scope, 'organization')
    assert.equal(path, '/api/xpert/actual/trigger-settings')
    throw new ClientError('conflict', 409)
  })
  await assert.rejects(
    service.saveAssistantTrigger({
      botId: 'copy',
      change: { revision: snapshot.revision, operation: 'delete', provider: 'telegram' }
    }),
    /Reload/
  )
  assert.equal(calls, 1)
})
test('account selectors use provider metadata, server workspace and label-only projection', async () => {
  const service = fixture(async (path, options) => {
    assert.equal(options.scope, 'organization')
    if (path.endsWith('/trigger-settings')) return snapshot
    if (path.endsWith('/profile')) return { workspace: { id: 'workspace' } }
    assert.equal(path, '/api/integration/select-options?provider=telegram&workspaceId=workspace')
    return [{ value: 'account', label: { en_US: '@example' }, token: 'never-return' }]
  })
  assert.deepEqual(
    await service.assistantTriggerOptions({ botId: 'copy', provider: 'telegram', field: 'integrationId' }),
    [{ value: 'account', label: '@example', disabled: false }]
  )
})
test('arbitrary selector URLs and stale organization responses are rejected', async () => {
  const poisoned = structuredClone(snapshot)
  poisoned.providers[0].schema.properties.integrationId['x-ui'].selectUrl = 'https://external.test/secret'
  const service = fixture(async () => poisoned)
  await assert.rejects(
    service.assistantTriggerOptions({ botId: 'copy', provider: 'telegram', field: 'integrationId' }),
    { status: 422 }
  )
  service.request = async () => {
    service.generation++
    return snapshot
  }
  await assert.rejects(service.assistantTriggers({ botId: 'copy' }), { status: 409 })
})

test('QR lifecycle uses the canonical assistant and projects public fields only', async () => {
  const data = { ...snapshot, providers: [{ name: 'lark', quickConnect: { method: 'qr' } }] }
  const requests = []
  const service = fixture(async (path, options) => {
    requests.push([path, options])
    if (path.endsWith('/trigger-settings')) return data
    if (path.endsWith('/complete'))
      return { connected: true, enabled: true, state: 'connected', options: { appSecret: 'hidden' } }
    if (options.method === 'GET') return { status: 'waiting', deviceCode: 'hidden' }
    if (options.method === 'DELETE') return
    return {
      id: 'session',
      authorizationUrl: 'https://open.feishu.cn/page/cli?user_code=example',
      expiresAt: Date.now() + 60000,
      intervalSeconds: 3,
      deviceCode: 'hidden'
    }
  })
  const input = { botId: 'copy', provider: 'lark', session: 'session' }
  const qr = await service.beginAssistantTriggerQr(input)
  assert.equal(qr.deviceCode, undefined)
  assert.deepEqual(await service.pollAssistantTriggerQr(input), { status: 'waiting' })
  assert.deepEqual(await service.completeAssistantTriggerQr(input), {
    provider: 'lark',
    connected: true,
    enabled: true,
    state: 'connected'
  })
  await service.cancelAssistantTriggerQr(input)
  for (const [path, options] of requests.slice(1)) {
    assert.ok(path.startsWith('/api/xpert/actual/trigger-connections/lark/qr'))
    assert.equal(options.scope, 'organization')
    assert.equal(options.retry, false)
  }
  await assert.rejects(service.pollAssistantTriggerQr({ ...input, session: '../forged' }))
  data.canEdit = false
  await assert.rejects(service.beginAssistantTriggerQr(input), { status: 403 })
})
