const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantConfigurationMethods } = require('../electron/assistant-configuration.cjs')
class ClientError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
const reply = {
  revision: 'a'.repeat(64),
  workspace: { id: 'w', name: 'Workspace' },
  prompt: 'role',
  modelId: 'provider/model',
  capabilities: [],
  setup: {
    canInstall: true,
    optionalCapabilities: [],
    models: [{ id: 'provider/model', label: 'Model', copilotModel: { copilotId: 'secret-internal-id' } }]
  }
}
function fixture(request) {
  return {
    ...createAssistantConfigurationMethods(ClientError),
    profile: { organizationId: 'org' },
    bots: [{ id: 'copy', assistantId: 'actual' }],
    request
  }
}
test('loads the actual assistant in organization scope without returning internal model bindings', async () => {
  const calls = []
  const service = fixture(async (...args) => {
    calls.push(args)
    return reply
  })
  const result = await service.assistantConfiguration({ botId: 'copy' })
  assert.equal(result.canEdit, true)
  assert.deepEqual(result.preflight.models, [{ id: 'provider/model', label: 'Model' }])
  assert.deepEqual(calls[0], ['/api/xpert/actual/configuration', { scope: 'organization' }])
})
test('a denied user gets no editable prompt and unknown bots cannot address arbitrary assistants', async () => {
  const service = fixture(async () => {
    throw new ClientError('denied', 403)
  })
  assert.deepEqual(await service.assistantConfiguration({ botId: 'copy' }), { canEdit: false })
  await assert.rejects(service.assistantConfiguration({ botId: 'other' }), { status: 403 })
})
test('saving publishes once, scopes the request, and passes an empty prompt unchanged', async () => {
  let called = 0
  const service = fixture(async (path, options) => {
    called++
    assert.equal(path, '/api/xpert/actual/configuration')
    assert.equal(options.retry, false)
    assert.equal(options.scope, 'organization')
    assert.equal(options.method, 'POST')
    assert.equal(options.body.prompt, '')
  })
  assert.deepEqual(
    await service.saveAssistantConfiguration({
      botId: 'copy',
      revision: reply.revision,
      prompt: '',
      modelId: reply.modelId,
      capabilities: []
    }),
    { botId: 'copy' }
  )
  assert.equal(called, 1)
  await assert.rejects(
    service.saveAssistantConfiguration({
      botId: 'copy',
      revision: reply.revision,
      prompt: 'x'.repeat(32001),
      modelId: reply.modelId,
      capabilities: []
    })
  )
  assert.equal(called, 1)
})

test('conflicts, failed publishing and uncertain saves get actionable messages without retrying', async () => {
  for (const [status, message] of [
    [409, /changed in Xpert/],
    [422, /saved as a draft/],
    [503, /not confirmed yet/]
  ]) {
    let called = 0
    const service = fixture(async () => {
      called++
      throw new ClientError('generic', status)
    })
    await assert.rejects(
      service.saveAssistantConfiguration({
        botId: 'copy',
        revision: reply.revision,
        prompt: '',
        modelId: reply.modelId,
        capabilities: []
      }),
      (error) => error.status === status && message.test(error.message)
    )
    assert.equal(called, 1)
  }
})
