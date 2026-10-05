const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { platformCommandUrl } = require('../electron/workbench-platform.mjs')

test('Studio links open the selected assistant within the configured deployment', () => {
  assert.equal(
    platformCommandUrl('https://customer.example/platform/', { target: 'assistant.studio', assistantId: 'expert-1' }),
    'https://customer.example/platform/xpert/x/expert-1/agents'
  )
  for (const assistantId of [undefined, '', '..', '../other', 'id?redirect=elsewhere', 'https://other.example']) {
    assert.equal(platformCommandUrl('https://customer.example', { target: 'assistant.studio', assistantId }), null)
  }
})

test('registration opens the configured web deployment without accepting arbitrary destinations', () => {
  for (const base of ['https://app.example.com', 'https://customer.example/xpert/', 'http://localhost:4200']) {
    assert.equal(platformCommandUrl(base, { target: 'auth.register' }), `${base.replace(/\/$/, '')}/auth/register`)
    assert.equal(
      platformCommandUrl(base, {
        target: 'auth.register',
        url: 'https://other.example',
        redirect: 'https://other.example'
      }),
      `${base.replace(/\/$/, '')}/auth/register`
    )
  }
})

function fixture(
  resolved = { conversationId: 'conversation', xpertId: 'external', threadId: 'thread', projectId: 'project' }
) {
  const calls = []
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, body: options.body && JSON.parse(options.body) })
      return new Response(
        JSON.stringify(url.includes('workbench-navigation') ? resolved : { client_secret: 'scoped-secret' })
      )
    }
  })
  service.profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' }
  service.credentials = { token: 'account-token', refreshToken: 'refresh', tenantId: 'tenant' }
  service.bots = [{ id: 'local-copy', assistantId: 'root' }]
  return { service, calls }
}
test('navigation resolves canonical ownership before creating a delegated ChatKit session', async () => {
  const { service, calls } = fixture()
  const session = await service.workbenchSession({
    botId: 'local-copy',
    target: 'assistant.conversation',
    conversationId: 'conversation',
    xpertId: 'spoofed'
  })
  assert.match(calls[0].url, /requesterXpertId=root&organizationId=org/)
  assert.deepEqual(calls[1].body, {
    assistant: { id: 'external' },
    project: { id: 'project' },
    conversation: { id: 'conversation', requesterXpertId: 'root' }
  })
  assert.equal(session.assistantId, 'external')
  assert.equal(session.secret, 'scoped-secret')
  assert.ok(!JSON.stringify(session).includes('account-token'))
})
test('rejects unknown bots and mismatched conversation hints without minting a session', async () => {
  const { service, calls } = fixture()
  await assert.rejects(
    service.workbenchSession({ botId: 'unknown', target: 'assistant.project', projectId: 'project' }),
    { status: 403 }
  )
  assert.equal(calls.length, 0)
  await assert.rejects(
    service.workbenchSession({
      botId: 'local-copy',
      target: 'assistant.conversation',
      conversationId: 'conversation',
      threadId: 'wrong'
    }),
    { status: 409 }
  )
  assert.equal(calls.length, 1)
})
test('project navigation creates a project-scoped session for the original assistant', async () => {
  const { service, calls } = fixture()
  const result = await service.workbenchSession({
    botId: 'local-copy',
    target: 'assistant.project',
    projectId: 'project'
  })
  assert.deepEqual(calls[0].body, { assistant: { id: 'root' }, project: { id: 'project' } })
  assert.equal(result.threadId, null)
})
test('a workspace switch invalidates in-flight navigation', async () => {
  const { service } = fixture()
  service.request = async () => {
    service.generation++
    return { conversationId: 'conversation', xpertId: 'external', threadId: 'thread', projectId: null }
  }
  await assert.rejects(
    service.workbenchSession({ botId: 'local-copy', target: 'assistant.conversation', conversationId: 'conversation' }),
    { status: 409 }
  )
})
test('platform links keep source anchors but never serialize evidence or accept injected routes', () => {
  const base = 'https://xpert.example'
  assert.equal(platformCommandUrl(base, { target: 'agent-evolution.target', targetId: '../settings' }), null)
  assert.equal(platformCommandUrl(base, { target: 'workbench.view', url: 'javascript:alert(1)' }), null)
  const url = new URL(
    platformCommandUrl(base, {
      target: 'knowledgebase.documents',
      knowledgebaseId: 'kb',
      documentId: 'doc',
      page: 3,
      chunkId: 'chunk',
      sourceBlockIds: ['block'],
      evidenceText: 'PRIVATE'
    })
  )
  assert.equal(url.pathname, '/xpert/knowledges/kb/documents/doc')
  assert.equal(url.searchParams.get('page'), '3')
  assert.equal(url.searchParams.get('block'), 'block')
  assert.ok(!url.href.includes('PRIVATE'))
  assert.equal(platformCommandUrl(base, { target: 'platform.data-source.create' }), `${base}/settings/data-sources`)
})
