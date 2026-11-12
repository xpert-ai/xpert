const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { randomUUID } = require('node:crypto')

function fixture() {
  const calls = [],
    hostId = randomUUID(),
    artifactId = randomUUID(),
    projectId = randomUUID()
  const manifest = {
    key: 'live-dashboard__live-dashboard',
    source: { plugin: 'dashboard' },
    clientCommands: [{ key: 'artifact.use-grants.manage' }],
    actions: [{ key: 'group-grant-offer' }]
  }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      return new Response(
        JSON.stringify(
          url.endsWith('/manifest')
            ? manifest
            : url.includes('/actions/')
              ? { success: true, data: { id: 'grant' } }
              : { id: artifactId, projectId, pluginName: 'dashboard' }
        )
      )
    }
  })
  service.credentials = { token: 'human-token', tenantId: 'tenant' }
  service.profile = { organizationId: 'org' }
  service.bots = [{ id: 'bot', assistantId: hostId }]
  return {
    service,
    calls,
    manifest,
    projectId,
    request: {
      botId: 'bot',
      hostId,
      viewKey: manifest.key,
      payload: {
        actionKey: 'group-grant-offer',
        input: { artifactId, versionId: randomUUID(), targetGroupId: randomUUID(), days: 1 }
      }
    }
  }
}
test('source management re-resolves the authoring View with normal login and canonical source Project', async () => {
  const f = fixture()
  assert.deepEqual(await f.service.manageArtifactGrant(f.request), { success: true, data: { id: 'grant' } })
  assert.equal(f.calls.length, 3)
  assert.equal(f.calls[2].options.headers.Authorization, 'Bearer human-token')
  assert.equal(f.calls[2].options.headers['x-xpert-view-project-id'], f.projectId)
  assert.deepEqual(JSON.parse(f.calls[2].options.body), { input: f.request.payload.input })
})
test('foreign Bot, undeclared manifest and non-grant actions cannot use authoring transport', async () => {
  for (const mode of ['bot', 'manifest', 'action', 'source']) {
    const f = fixture()
    if (mode === 'bot') f.request.hostId = randomUUID()
    if (mode === 'manifest') f.manifest.clientCommands = []
    if (mode === 'action') f.request.payload.actionKey = 'publish'
    if (mode === 'source') f.manifest.source.plugin = 'foreign'
    await assert.rejects(f.service.manageArtifactGrant(f.request))
    assert.equal(
      f.calls.some((call) => call.options.method === 'POST'),
      false
    )
  }
})
test('switching account after source resolution prevents the mutation', async () => {
  const f = fixture(),
    fetcher = f.service.fetcher
  f.service.fetcher = async (...args) => {
    const response = await fetcher(...args)
    f.service.generation++
    return response
  }
  await assert.rejects(f.service.manageArtifactGrant(f.request))
  assert.equal(f.calls.length, 1)
})
