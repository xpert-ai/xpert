const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { DesktopService } = require('../electron/service.cjs')
const { createStorage } = require('../electron/storage.cjs')
const { dispatch } = require('../electron/dispatch.cjs')

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'bosi-last-session-'))
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  const storage = createStorage(directory, { isEncryptionAvailable: () => false })
  const requests = []
  let status = 200
  let deferred
  const profile = { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org', organizations: [] }
  const create = () => {
    const service = new DesktopService({
      storage,
      fetcher: async (url, options) => {
        requests.push({ url, options })
        if (deferred) await deferred
        if (status !== 200) return new Response('', { status })
        if (url.includes('workbench-navigation'))
          return Response.json({
            conversationId: 'delegated',
            xpertId: 'child',
            threadId: 'child-thread',
            projectId: null
          })
        if (url.endsWith('/chatkit/sessions')) return Response.json({ client_secret: 'temporary-secret' })
        return Response.json({ id: 'conversation', xpertId: 'assistant', threadId: 'thread' })
      }
    })
    service.profile = structuredClone(profile)
    service.credentials = { token: 'fixture', tenantId: 'tenant' }
    service.bots = [{ id: 'assistant' }, { id: 'copy', assistantId: 'assistant' }, { id: 'other' }]
    return service
  }
  const scope = (service) =>
    JSON.stringify([
      service.config.apiUrl,
      service.profile.user.tenantId,
      service.profile.user.id,
      service.profile.organizationId
    ])
  return {
    create,
    scope,
    requests,
    status: (value) => {
      status = value
    },
    defer: (value) => {
      deferred = value
    }
  }
}

test('last Assistant and conversation survive a disk-backed restart and explicit new-chat selection', async (t) => {
  const { create, scope, requests } = fixture(t)
  const service = create()
  assert.equal(await service.restoreSession(), null)
  const session = { botId: 'copy', threadId: 'thread' }
  assert.equal((await dispatch(service, 'rememberSession', { scope: scope(service), session })).ok, true)
  const restarted = create()
  assert.deepEqual((await dispatch(restarted, 'restoreSession')).value, session)
  assert.equal(requests[0].options.headers['organization-id'], 'org')
  assert.equal(requests[0].options.headers['tenant-id'], 'tenant')
  restarted.rememberSession({ scope: scope(restarted), session: { botId: 'assistant', threadId: null } })
  assert.deepEqual(await create().restoreSession(), { botId: 'assistant', threadId: null })
})

test('navigation is isolated by server, tenant, account and organization; stale writes cannot cross scope', async (t) => {
  const { create, scope } = fixture(t)
  const service = create()
  const session = { botId: 'assistant', threadId: null }
  const originalScope = scope(service)
  service.rememberSession({ scope: originalScope, session })
  for (const change of [
    (value) => {
      value.config.apiUrl = 'https://other.example.com'
    },
    (value) => {
      value.profile.user.tenantId = 'other'
    },
    (value) => {
      value.profile.user.id = 'other'
    },
    (value) => {
      value.profile.organizationId = 'other'
    }
  ]) {
    const other = create()
    change(other)
    assert.equal(await other.restoreSession(), null)
    assert.throws(() => other.rememberSession({ scope: originalScope, session }), { status: 409 })
  }
  service.logout()
  assert.throws(() => service.rememberSession({ scope: originalScope, session }), { status: 403 })
  assert.deepEqual(await create().restoreSession(), session)
})

test('removed Assistants are skipped and deleted or forbidden conversations reopen a fresh chat', async (t) => {
  const { create, scope, status } = fixture(t)
  for (const code of [403, 404]) {
    const service = create()
    service.rememberSession({ scope: scope(service), session: { botId: 'assistant', threadId: 'thread' } })
    status(code)
    assert.deepEqual(await service.restoreSession(), { botId: 'assistant', threadId: null })
    assert.equal(service.sidebarState().lastSession.threadId, null)
  }
  const removed = create()
  removed.bots = []
  assert.equal(await removed.restoreSession(), null)
})

test('temporary failures preserve the remembered session and a late failure cannot overwrite newer navigation', async (t) => {
  const { create, scope, status, defer } = fixture(t)
  const service = create()
  const session = { botId: 'assistant', threadId: 'thread' }
  service.rememberSession({ scope: scope(service), session })
  status(503)
  await assert.rejects(service.restoreSession(), { status: 503 })
  assert.deepEqual(service.sidebarState().lastSession, session)
  let resolve
  defer(
    new Promise((done) => {
      resolve = done
    })
  )
  status(404)
  const pending = service.restoreSession()
  service.rememberSession({ scope: scope(service), session: { botId: 'other', threadId: null } })
  resolve()
  await pending
  assert.deepEqual(service.sidebarState().lastSession, { botId: 'other', threadId: null })
})

test('delegated conversations revalidate access without persisting or returning session secrets', async (t) => {
  const { create, scope, requests } = fixture(t)
  const service = create()
  const session = {
    botId: 'assistant',
    threadId: 'child-thread',
    conversation: { assistantId: 'child', conversationId: 'delegated' }
  }
  service.rememberSession({ scope: scope(service), session: { ...session, secret: 'must-not-persist' } })
  assert.deepEqual(await create().restoreSession(), session)
  assert.ok(requests.some((item) => item.url.includes('/workbench-navigation?')))
  assert.doesNotMatch(JSON.stringify(service.sidebarState()), /must-not-persist|temporary-secret/)
  assert.throws(
    () => service.rememberSession({ scope: scope(service), session: { botId: 'unknown', threadId: null } }),
    { status: 403 }
  )
  assert.throws(
    () => service.rememberSession({ scope: scope(service), session: { botId: 'assistant', threadId: '../invalid' } }),
    { status: 400 }
  )
})
