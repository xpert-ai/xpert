const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createBosiMethods } = require('../electron/bosi.cjs')
class ClientError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}
function fixture(request) {
  return {
    ...createBosiMethods(ClientError),
    profile: { organizationId: 'org' },
    bots: [{ id: 'alias', assistantId: 'assistant' }],
    request,
    clearBotProfile() {}
  }
}
test('initialization is organization scoped, explicit and non-retrying', async () => {
  const calls = []
  const host = fixture(async (...args) => {
    calls.push(args)
    return {}
  })
  await host.bosiSetup({ capabilities: ['cloud-computer'] })
  await host.createBosi({ modelId: 'model', capabilities: ['desktop-shell', 'desktop-shell'] })
  await host.bosiWelcome()
  assert.equal(calls[0][0], '/api/assistant-binding/bosi/setup?capabilities=cloud-computer')
  for (const [, options] of calls) assert.equal(options.scope, 'organization')
  assert.equal(calls[1][1].retry, false)
  assert.deepEqual(calls[1][1].body, { modelId: 'model', capabilities: ['desktop-shell'] })
  assert.equal(calls[2][1].retry, false)
})
test('unavailable server and denied binding cannot look like uninitialized Bosi', async () => {
  for (const status of [403, 404, 500]) {
    const host = fixture(async () => {
      throw new ClientError('failure', status)
    })
    await assert.rejects(host.bosiSetup({}), { status })
  }
  const host = fixture(async () => {
    throw new ClientError('Organization membership is missing.', 404)
  })
  await assert.rejects(host.createBosi({ modelId: 'model', capabilities: [] }), /Organization membership is missing/)
  await assert.rejects(host.bosiSetup({}), /Organization membership is missing/)
  host.request = async () => {
    throw new ClientError('Cannot GET /api/assistant-binding/bosi/setup', 404)
  }
  await assert.rejects(host.bosiSetup({}), /Update the Xpert server/)
})
test('onboarding choices go to the server with a revision and no implicit retries', async () => {
  const calls = []
  const host = fixture(async (...args) => {
    calls.push(args)
    return {}
  })
  const choice = { revision: 3, kind: 'plugin', id: 'package', selected: true }
  await host.bosiOnboarding()
  await host.bosiChoose(choice)
  assert.equal(calls[0][0], '/api/assistant-binding/bosi/onboarding')
  assert.deepEqual(calls[1][1], {
    scope: 'organization',
    includeServerMessage: true,
    method: 'POST',
    body: choice,
    retry: false
  })
})
test('onboarding authorization polls the reserved workspace and rejects organization switches', async () => {
  const target = { workspaceId: 'workspace', bindingId: 'binding', organizationId: 'org' }
  const host = fixture(async (path, options) => {
    if (path.endsWith('/connection')) return target
    assert.deepEqual(options.body, { workspaceId: 'workspace', bindingId: 'binding' })
    return { connected: true }
  })
  host.generation = 1
  const result = await host.bosiConnect({ provider: 'mail' })
  assert.equal(result.target.target, 'bosi.connector.connect')
  assert.deepEqual(await host.bosiCheckConnection({ attemptId: result.attemptId }), { status: 'connected' })
  const next = await host.bosiConnect({ provider: 'mail' })
  host.profile.organizationId = 'other'
  host.generation++
  await assert.rejects(host.bosiCheckConnection({ attemptId: next.attemptId }), { status: 409 })
})
test('catalog results cannot arrive into a different organization after a slow request', async () => {
  let finish
  const host = fixture(
    () =>
      new Promise((resolve) => {
        finish = resolve
      })
  )
  const response = host.bosiOnboarding()
  host.profile.organizationId = 'other'
  finish({ items: [] })
  await assert.rejects(response, { status: 409 })
})
test('mount and focus share a catalog reservation without keeping stale results', async () => {
  let finish
  let calls = 0
  const host = fixture(() => {
    calls++
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  const first = host.bosiOnboarding()
  const second = host.bosiOnboarding()
  assert.equal(calls, 1)
  finish({ items: [] })
  assert.deepEqual(await first, await second)
  const third = host.bosiOnboarding()
  assert.equal(calls, 2)
  finish({ items: [] })
  await third
})
test('pre-Assistant connection URLs contain exact scope identities without credentials', async () => {
  const { platformCommandUrl } = await import('../electron/workbench-platform.mjs')
  const target = {
    target: 'bosi.connector.connect',
    workspaceId: 'workspace',
    bindingId: 'binding',
    organizationId: 'org'
  }
  const url = new URL(platformCommandUrl('https://xpert.example', target))
  assert.equal(url.pathname, '/workspace-connection')
  assert.equal(url.searchParams.get('workspaceId'), 'workspace')
  assert.equal(url.searchParams.has('assistantId'), false)
  assert.equal(platformCommandUrl('https://xpert.example', { ...target, workspaceId: '../other' }), null)
})
