const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantConfigurationMethods } = require('../electron/assistant-configuration.cjs')
class ClientError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}
function fixture() {
  const calls = []
  return {
    ...createAssistantConfigurationMethods(ClientError),
    calls,
    profile: { organizationId: 'org' },
    bots: [{ id: 'local', assistantId: 'published' }],
    request: async (...args) => {
      calls.push(args)
      return {}
    }
  }
}
test('setup uses the published Assistant and organization scope', async () => {
  const service = fixture()
  await service.assistantTemplateSetup({ botId: 'local' })
  assert.deepEqual(service.calls, [['/api/xpert/published/template-setup', { scope: 'organization' }]])
})
test('preference writes preserve optimistic revision and are not blindly retried', async () => {
  const service = fixture(),
    update = { revision: 2, preferences: { language: 'zh' } }
  await service.updateAssistantTemplateSetup({ botId: 'local', update })
  assert.equal(service.calls[0][1].retry, false)
  assert.deepEqual(service.calls[0][1].body, update)
})
test('routine writes cannot escape the selected Assistant or route', async () => {
  const service = fixture()
  await assert.rejects(service.updateAssistantTemplateRoutine({ botId: 'foreign', key: 'weekly', update: {} }), {
    status: 403
  })
  await assert.rejects(service.updateAssistantTemplateRoutine({ botId: 'local', key: '../other', update: {} }))
  assert.equal(service.calls.length, 0)
})
