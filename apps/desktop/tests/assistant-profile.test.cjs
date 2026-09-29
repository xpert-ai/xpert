const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { isProfileMessage, interactionHeld } = require('../src/profile/remote-protocol.ts')

function fixture() {
  const calls = []
  let enabled = true
  const manifest = {
    key: 'provider__activity',
    hostType: 'agent',
    slot: 'agent.profile.tabs',
    title: { en_US: 'Activity' },
    view: { type: 'remote_component', protocolVersion: 1 },
    actions: [{ key: 'approve', actionType: 'invoke' }],
    parameters: [{ key: 'project', optionSource: { mode: 'provider' } }],
    clientCommands: [{ key: 'workbench.navigation.open' }, { key: 'assistant.profile.interaction' }]
  }
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      if (url.includes('remote-component/entry'))
        return new Response('<!doctype html><script>window.parent.postMessage({type:"ready"},"*")</script>')
      if (url.includes('/slots/agent.profile.tabs/'))
        return Response.json(enabled ? [manifest, { ...manifest, key: 'hidden', visible: false }] : [])
      if (url.includes('/slots/agent.workbench.fixed/'))
        return Response.json([{ ...manifest, key: 'provider__studio', slot: 'agent.workbench.fixed' }])
      if (url.includes('/api/xpert/source/profile'))
        return Response.json({
          id: 'source',
          name: 'Original',
          description: '{"en_US":"Hello","zh_Hans":"你好"}',
          version: '1',
          tags: [],
          indicators: { skillCount: null, toolCount: 7, subAgentCount: 2, conversationCount30d: 0 },
          prompt: 'private',
          credentials: { token: 'private' }
        })
      if (url.includes('/chat-conversation/my'))
        return Response.json({
          total: 1,
          items: [
            {
              id: 'conversation',
              xpertId: 'source',
              threadId: 'thread',
              status: 'idle',
              title: 'Task title',
              messages: ['private']
            },
            { id: 'foreign', xpertId: 'other', title: 'Foreign' }
          ]
        })
      return Response.json({ items: [], success: true })
    }
  })
  service.profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' }
  service.credentials = { token: 'account-token', refreshToken: 'refresh', tenantId: 'tenant' }
  service.bots = [{ id: 'copy', assistantId: 'source' }]
  return {
    service,
    calls,
    manifest,
    disable: () => {
      enabled = false
    }
  }
}
test('profile is a scoped display projection; descriptions localize and unavailable counts stay null', async () => {
  const { service, calls } = fixture()
  service.config.locale = 'zh-Hans'
  const value = await service.botProfile('copy')
  assert.equal(value.description, '你好')
  assert.equal(value.indicators.skillCount, null)
  assert.equal(value.indicators.toolCount, 7)
  assert.ok(!JSON.stringify(value).includes('private'))
  assert.equal(calls[0].options.headers['organization-id'], 'org')
  assert.equal(calls[0].options.headers['tenant-id'], 'tenant')
  assert.equal(calls[0].options.headers['x-scope-level'], 'organization')
  await assert.rejects(service.botProfile('unknown'), { status: 403 })
  assert.equal(calls.length, 1)
})
test('recent conversations use the original assistant and current-user endpoint, retaining titles and actual status', async () => {
  const { service, calls } = fixture()
  const value = await service.botConversations({ botId: 'copy', page: 2 })
  const query = JSON.parse(new URL(calls[0].url).searchParams.get('data'))
  assert.deepEqual(query, { where: { xpertId: 'source' }, take: 5, skip: 5, order: { updatedAt: 'DESC' } })
  assert.equal(value.items.length, 1)
  assert.equal(value.items[0].status, 'idle')
  assert.equal(value.items[0].title, 'Task title')
  assert.ok(!JSON.stringify(value).includes('private'))
  await assert.rejects(service.botConversations({ botId: 'copy', page: -1 }), { status: 403 })
})
test('only enabled profile tabs can be opened; isolated HTML carries no auth and is revoked on close', async () => {
  const { service, calls } = fixture()
  assert.equal((await service.botProfileViews('copy')).length, 1)
  await assert.rejects(service.openProfileView({ botId: 'copy', viewKey: 'hidden' }), { status: 403 })
  const opened = await service.openProfileView({ botId: 'copy', viewKey: 'provider__activity' })
  const response = await fetch(opened.entryUrl)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/)
  assert.match(response.headers.get('content-security-policy'), /sandbox allow-scripts/)
  assert.doesNotMatch(response.headers.get('content-security-policy'), /allow-same-origin/)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
  assert.ok(!(await response.text()).includes('account-token'))
  assert.equal((await fetch(opened.entryUrl, { method: 'POST' })).status, 404)
  assert.equal((await fetch(opened.entryUrl + '/wrong')).status, 404)
  assert.ok(!JSON.stringify(opened).includes('account-token'))
  assert.ok(calls.find((call) => call.url.endsWith('/entry')).options.headers.Authorization)
  service.closeProfileView(opened.sessionId)
  assert.equal((await fetch(opened.entryUrl)).status, 404)
  await assert.rejects(service.profileViewRequest({ sessionId: opened.sessionId, operation: 'data' }), { status: 403 })
})
test('custom View requests reject undeclared actions/options and recheck activation before invoking', async () => {
  const { service, disable, calls } = fixture()
  const { sessionId } = await service.openProfileView({ botId: 'copy', viewKey: 'provider__activity' })
  const request = (body) => service.profileViewRequest({ sessionId, ...body })
  await request({
    operation: 'data',
    query: { page: 2, search: 'query', hostId: 'injected', parameters: { status: 'open' } }
  })
  const url = new URL(calls.at(-1).url)
  assert.equal(url.searchParams.get('hostId'), null)
  assert.equal(url.searchParams.get('parameters'), '{"status":"open"}')
  await assert.rejects(request({ operation: 'action', actionKey: 'delete' }), { status: 403 })
  await assert.rejects(request({ operation: 'options', parameterKey: 'unknown' }), { status: 403 })
  await request({ operation: 'action', actionKey: 'approve', targetId: 'case', input: { decision: 'approve' } })
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { targetId: 'case', input: { decision: 'approve' } })
  disable()
  await assert.rejects(request({ operation: 'action', actionKey: 'approve' }), { status: 403 })
  service.closeProfileView(sessionId)
})
test('organization change invalidates HTML and all outstanding View capabilities', async () => {
  const { service } = fixture()
  const opened = await service.openProfileView({ botId: 'copy', viewKey: 'provider__activity' })
  service.logout()
  assert.equal((await fetch(opened.entryUrl)).status, 404)
  await assert.rejects(service.profileViewRequest({ sessionId: opened.sessionId, operation: 'data' }), { status: 403 })
  service.closeProfileView(opened.sessionId)
})
test('workbench navigation resolves an authorized view alias without trusting plugin URLs', async () => {
  const { service } = fixture()
  const opened = await service.openProfileView({ botId: 'copy', viewKey: 'provider__activity' })
  const result = await service.profileViewRequest({
    sessionId: opened.sessionId,
    operation: 'command',
    commandKey: 'workbench.navigation.open',
    payload: {
      target: 'workbench.view',
      viewKey: 'studio',
      selectionId: 'case',
      url: 'https://evil.example',
      parameters: { tab: 'overview' }
    }
  })
  const url = new URL(result.url)
  assert.equal(url.origin, 'https://app.xpertai.cn')
  assert.equal(url.pathname, '/chat/x/source')
  assert.equal(url.searchParams.get('view'), 'provider__studio')
  assert.equal(url.searchParams.get('viewSelection'), 'case')
  await assert.rejects(
    service.profileViewRequest({ sessionId: opened.sessionId, operation: 'command', commandKey: 'arbitrary' }),
    { status: 403 }
  )
  service.closeProfileView(opened.sessionId)
})
test('remote protocol validates envelopes and interaction locks use explicit booleans', () => {
  assert.ok(isProfileMessage({ channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready' }))
  for (const value of [
    null,
    {},
    { channel: 'wrong', protocolVersion: 1, type: 'ready' },
    { channel: 'xpertai.remote_component', protocolVersion: 2, type: 'ready' },
    { channel: 'xpertai.remote_component', protocolVersion: 1, type: 'ready', requestId: {} }
  ])
    assert.equal(isProfileMessage(value), false)
  assert.equal(interactionHeld({ busy: 'true' }), false)
  assert.equal(interactionHeld({ busy: true }), true)
})

test('profile ownership prevents duplicate layouts and stale cleanup from retaining or stealing the lock', () => {
  const { previewScopeReducer: reduce } = require('../src/profile/preview-scope-state.ts')
  let state = reduce({ active: null, locked: false }, { type: 'open', id: 'expanded-trigger' })
  state = reduce(state, { type: 'lock', id: 'expanded-trigger', locked: true })
  assert.deepEqual(reduce(state, { type: 'open', id: 'compact-trigger' }), state)
  state = reduce(state, { type: 'close', id: 'expanded-trigger' })
  state = reduce(state, { type: 'lock', id: 'expanded-trigger', locked: true })
  assert.deepEqual(state, { active: null, locked: false })
  state = reduce(state, { type: 'open', id: 'compact-trigger' })
  state = reduce(state, { type: 'lock', id: 'compact-trigger', locked: true })
  assert.deepEqual(reduce(state, { type: 'lock', id: 'expanded-trigger', locked: false }), state)
  assert.deepEqual(reduce(state, { type: 'close', id: 'expanded-trigger' }), state)
  state = reduce(state, { type: 'close', id: 'compact-trigger' })
  assert.deepEqual(reduce(state, { type: 'open', id: 'expanded-trigger' }), {
    active: 'expanded-trigger',
    locked: false
  })
})
