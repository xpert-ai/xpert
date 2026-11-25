const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { parseProjectNavigation } = require('../electron/project-navigation.mjs')
const focus = {
  pipelineInstanceId: '11111111-1111-4111-8111-111111111111',
  pipelineRoundId: '22222222-2222-4222-8222-222222222222',
  pipelineNodeId: '33333333-3333-4333-8333-333333333333'
}
const target = { target: 'project.pipelines', projectId: 'project', ...focus }
function fixture(organizationId = 'org') {
  const calls = []
  let result = {
    projectId: 'project',
    organizationId,
    assistant: { id: 'bound-assistant', name: 'Bound assistant' },
    view: { viewKey: 'platform.project-tasks__timeline', parameters: { initialTab: 'pipeline', ...focus } }
  }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, headers: options.headers, body: options.body && JSON.parse(options.body) })
      return Response.json(url.includes('/pipelines/workbench-navigation') ? result : { client_secret: 'test-secret' })
    }
  })
  service.profile = {
    user: { id: 'human', tenantId: 'tenant' },
    organizationId: 'org',
    organizations: [{ id: 'org' }, { id: 'other' }]
  }
  service.credentials = { token: 'account-token', tenantId: 'tenant' }
  service.bots = []
  return {
    service,
    calls,
    result,
    change: (value) => {
      result = value
    }
  }
}

test('resolves the bound Assistant and opens its project session without catalog membership or a business action', async () => {
  const { service, calls } = fixture()
  const entry = await service.resolveWorkbenchEntry(target)
  assert.equal(entry.bot.id, 'bound-assistant')
  assert.deepEqual(entry.parameters, { initialTab: 'pipeline', ...focus })
  assert.equal(entry.source.organizationId, 'org')
  assert.equal('secret' in entry, false)
  const session = await service.workbenchSession({
    botId: entry.bot.id,
    target: 'assistant.project',
    assistantId: entry.assistantId,
    projectId: entry.projectId,
    source: entry.source,
    sourceAssistantId: entry.assistantId
  })
  assert.equal(session.assistantId, 'bound-assistant')
  assert.equal(session.threadId, null)
  assert.deepEqual(calls.at(-1).body, { assistant: { id: 'bound-assistant' }, project: { id: 'project' } })
  assert.equal(calls.filter((call) => call.body).length, 1, 'only a credential is created; no chat, decision or run')
  assert.equal(calls.filter((call) => call.url.includes('workbench-navigation')).length, 2, 'renewal rechecks routing')
})

for (const organizationId of [null, 'other'])
  test(`every request retains explicit ${organizationId} scope`, async () => {
    const { service, calls } = fixture(organizationId)
    const entry = await service.resolveWorkbenchEntry({ ...target, organizationId })
    const input = {
      botId: entry.bot.id,
      target: 'assistant.project',
      projectId: 'project',
      source: entry.source,
      sourceAssistantId: entry.assistantId
    }
    await service.workbenchSession(input)
    await service.workbenchSession(input)
    for (const call of calls) {
      assert.equal(call.headers['organization-id'], organizationId ?? undefined)
      assert.equal(call.headers['x-scope-level'], organizationId === null ? 'tenant' : 'organization')
      assert.equal(call.headers['tenant-id'], 'tenant')
    }
    assert.equal(
      service.profile.organizationId,
      'org',
      'navigation must not silently replace the sidebar account scope'
    )
  })

test('invalid destinations, incomplete focus and inaccessible organizations fail before a request', async () => {
  const { service, calls } = fixture()
  for (const input of [
    { ...target, url: 'https://external.example' },
    { ...target, assistantId: 'injected' },
    { ...target, pipelineNodeId: undefined },
    { ...target, projectId: '../other' },
    { ...target, organizationId: 'unavailable' }
  ])
    await assert.rejects(service.resolveWorkbenchEntry(input))
  assert.equal(calls.length, 0)
  assert.equal(parseProjectNavigation({ ...target, organizationId: null }).organizationId, null)
})

test('foreign focus, wrong scope and malformed responses cannot open another approval', async () => {
  const { service, result, change, calls } = fixture()
  for (const value of [
    { ...result, projectId: 'other' },
    { ...result, organizationId: null },
    { ...result, assistant: { id: '../other', name: 'Other' } },
    { ...result, view: { ...result.view, parameters: { ...result.view.parameters, pipelineNodeId: 'other' } } }
  ]) {
    change(value)
    await assert.rejects(service.resolveWorkbenchEntry(target), { status: 403 })
  }
  assert.ok(calls.every((call) => !call.body))
})

test('an account switch invalidates a pending destination before a session is minted', async () => {
  const { service, result } = fixture()
  service.request = async () => {
    service.generation++
    return result
  }
  await assert.rejects(service.resolveWorkbenchEntry(target), { status: 409 })
})

test('a removed Assistant binding during credential renewal is not replaced with the current Bot', async () => {
  const { service, calls } = fixture()
  const entry = await service.resolveWorkbenchEntry(target)
  service.bots = [{ id: 'unrelated' }]
  service.request = async () => {
    throw Object.assign(new Error('Revoked'), { status: 403 })
  }
  await assert.rejects(
    service.workbenchSession({
      botId: 'unrelated',
      target: 'assistant.project',
      projectId: 'project',
      source: entry.source,
      sourceAssistantId: entry.assistantId
    }),
    { status: 403 }
  )
  assert.equal(calls.length, 1)
})

test('a changed source Assistant cannot silently renew the previous project session', async () => {
  const { service, result, change, calls } = fixture()
  const entry = await service.resolveWorkbenchEntry(target)
  change({ ...result, assistant: { id: 'replacement', name: 'Replacement' } })
  await assert.rejects(
    service.workbenchSession({
      botId: entry.bot.id,
      target: 'assistant.project',
      projectId: 'project',
      source: entry.source,
      sourceAssistantId: entry.assistantId
    }),
    { status: 409 }
  )
  assert.ok(calls.every((call) => !call.body))
})

test('project-scoped inspection can open a canonical execution conversation in the same organization scope', async () => {
  const { service } = fixture('other')
  const entry = await service.resolveWorkbenchEntry({ ...target, organizationId: 'other' })
  const calls = []
  const request = service.request.bind(service)
  service.request = async (path, options) => {
    calls.push({ path, options })
    if (path.includes('/chat-conversation/'))
      return {
        conversationId: 'execution',
        xpertId: 'executor',
        threadId: 'thread',
        projectId: 'project'
      }
    return request(path, options)
  }
  const session = await service.workbenchSession({
    botId: entry.bot.id,
    target: 'assistant.conversation',
    conversationId: 'execution',
    source: entry.source,
    sourceAssistantId: entry.assistantId
  })
  assert.equal(session.assistantId, 'executor')
  assert.equal(session.threadId, 'thread')
  assert.ok(calls.every(({ options }) => options.organizationId === 'other' && options.scope === 'organization'))
  assert.deepEqual(calls.at(-1).options.body.conversation, { id: 'execution', requesterXpertId: entry.assistantId })
})
