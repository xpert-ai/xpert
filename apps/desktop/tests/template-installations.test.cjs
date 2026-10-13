const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createTemplateInstallationMethods } = require('../electron/template-installations.cjs')
class ClientError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
const receipt = {
  id: 'op',
  templateId: 'template',
  workspaceId: 'workspace',
  status: 'running',
  stage: 'importing',
  attempt: 1,
  publish: true,
  assistantId: null,
  retryable: false,
  resourceInstallationIds: [],
  pendingAuthInstallationIds: [],
  createdAt: '2026-10-13',
  updatedAt: '2026-10-13',
  error: null
}
function host(result = receipt) {
  const calls = []
  return {
    calls,
    profile: { organizationId: 'org' },
    ...createTemplateInstallationMethods(ClientError),
    async request(path, options) {
      calls.push({ path, options })
      return result
    }
  }
}
test('durable host routes preserve organization scope and disable automatic mutation retries', async () => {
  const service = host()
  const input = { templateId: 'template', workspaceId: 'workspace', idempotencyKey: 'key', publish: true }
  await service.createTemplateInstallation(input)
  await service.getTemplateInstallation('op')
  await service.retryTemplateInstallation('op')
  assert.deepEqual(
    service.calls.map((c) => c.path),
    [
      '/api/xpert-template-installations',
      '/api/xpert-template-installations/op',
      '/api/xpert-template-installations/op/retry'
    ]
  )
  assert(service.calls.every((c) => c.options.scope === 'organization'))
  assert.equal(service.calls[0].options.body, input)
  assert.equal(service.calls[0].options.retry, false)
  assert.deepEqual(service.calls[2].options.body, {})
  assert.equal(service.calls[2].options.retry, false)
})
test('receipts project only public fields and list history uses the requested workspace', async () => {
  const service = host({ items: [{ ...receipt, credentials: 'secret', input: { export_data: 'DSL' } }], total: 23 })
  assert.deepEqual(await service.listTemplateInstallations({ workspaceId: 'workspace', skip: 20 }), {
    items: [receipt],
    total: 23
  })
  assert.equal(service.calls[0].path, '/api/xpert-template-installations?workspaceId=workspace&skip=20&take=20')
})
test('missing organization, invalid pagination and unknown statuses fail closed', async () => {
  const service = host()
  service.profile.organizationId = ''
  await assert.rejects(service.createTemplateInstallation({}), { status: 400 })
  assert.equal(service.calls.length, 0)
  service.profile.organizationId = 'org'
  await assert.rejects(service.listTemplateInstallations({ workspaceId: 'workspace', skip: -1 }), { status: 400 })
  await assert.rejects(host({ ...receipt, status: 'ready' }).getTemplateInstallation('op'), { status: 502 })
})
