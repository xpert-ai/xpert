const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { AssistantActivity, installAssistantActivity } = require('../electron/assistant-activity.cjs')
const { DesktopService } = require('../electron/service.cjs')

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const summary = (xpertId, unreadMessages) => ({ xpertId, unreadMessages, unreadConversations: 1 })

function fixture(t, platform = 'darwin') {
  const service = {
    config: { apiUrl: 'https://api.example.test' },
    credentials: { token: 'fixture' },
    profile: { user: { id: 'user', tenantId: 'tenant' }, organizationId: 'org' },
    generation: 1,
    bots: [{ id: 'a' }, { id: 'b' }, { id: 'copy-a', assistantId: 'a' }],
    fetchBotActivity: t.mock.fn(async () => [summary('a', 2), summary('b', 3)])
  }
  const activity = new AssistantActivity(service)
  const badges = []
  const sent = []
  const app = Object.assign(new EventEmitter(), {
    setBadgeCount: (count) => {
      badges.push(count)
      return true
    }
  })
  let window = {
    isDestroyed: () => false,
    webContents: { isDestroyed: () => false, send: (channel) => sent.push(channel) }
  }
  const dispose = installAssistantActivity({ app, activity, getWindow: () => window, platform })
  t.after(dispose)
  return {
    service,
    activity,
    badges,
    sent,
    app,
    dispose,
    closeWindow: () => {
      window = undefined
    }
  }
}

test('Dock and sidebar share a single snapshot and continue polling after the window closes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 })
  const { service, activity, badges, sent, closeWindow, app } = fixture(t)
  const [first, second] = await Promise.all([activity.read(), activity.read()])
  assert.equal(first, second)
  assert.equal(service.fetchBotActivity.mock.callCount(), 1)
  assert.deepEqual(badges, [0, 5])
  assert.ok(sent.includes('xpert:assistant-activity-changed'))
  await activity.read()
  assert.equal(service.fetchBotActivity.mock.callCount(), 1)
  const sentBeforeClosing = sent.length
  closeWindow()
  service.fetchBotActivity.mock.mockImplementation(async () => [summary('a', 7)])
  t.mock.timers.tick(15000)
  await activity.read()
  assert.equal(badges.at(-1), 7)
  assert.equal(sent.length, sentBeforeClosing)
  assert.equal(service.fetchBotActivity.mock.callCount(), 2)
  app.emit('will-quit')
  assert.equal(badges.at(-1), 0)
  t.mock.timers.tick(30000)
  assert.equal(service.fetchBotActivity.mock.callCount(), 2)
  assert.equal(activity.listenerCount('change'), 0)
})

test('a poll started before marking read cannot overwrite the post-read snapshot', async (t) => {
  const { service, activity, badges } = fixture(t)
  await activity.read()
  const old = deferred()
  service.fetchBotActivity.mock.mockImplementation(() => old.promise)
  const oldRequest = activity.read(true)
  service.fetchBotActivity.mock.mockImplementation(async () => [summary('a', 0), summary('b', 0)])
  activity.invalidate()
  await activity.read()
  assert.equal(badges.at(-1), 0)
  old.resolve([summary('a', 12)])
  assert.deepEqual(await oldRequest, [summary('a', 0), summary('b', 0)])
  assert.equal(activity.unreadCount, 0)
  assert.deepEqual(badges, [0, 5, 0])
})

for (const scope of ['organization', 'user', 'tenant', 'server', 'logout']) {
  test(`${scope} changes clear the badge and reject late responses from the previous scope`, async (t) => {
    const { service, activity, badges } = fixture(t)
    await activity.read()
    const old = deferred()
    service.fetchBotActivity.mock.mockImplementation(() => old.promise)
    const oldRequest = activity.read(true)
    if (scope === 'organization') service.profile.organizationId = 'new-org'
    if (scope === 'user') service.profile.user.id = 'new-user'
    if (scope === 'tenant') service.profile.user.tenantId = 'new-tenant'
    if (scope === 'server') service.config.apiUrl = 'https://other.example.test'
    if (scope === 'logout') service.credentials = null
    const next = deferred()
    service.fetchBotActivity.mock.mockImplementation(() => next.promise)
    activity.sync()
    assert.equal(badges.at(-1), 0)
    const current = activity.read()
    next.resolve([summary('a', 1)])
    await current
    old.resolve([summary('a', 99)])
    await oldRequest
    assert.equal(activity.unreadCount, scope === 'logout' ? 0 : 1)
    assert.equal(badges.includes(99), false)
  })
}

test('deduplicates Assistant identities, preserves counts on outages and retries on the next poll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 1000 })
  const { service, activity, badges } = fixture(t)
  await activity.read()
  service.fetchBotActivity.mock.mockImplementation(async () => [summary('a', 2), summary('a', 2), summary('b', 3)])
  await activity.read(true)
  assert.equal(activity.unreadCount, 5)
  assert.deepEqual(badges, [0, 5], 'unchanged badge does not need another native update')
  service.fetchBotActivity.mock.mockImplementation(async () => {
    throw new Error('offline')
  })
  await assert.rejects(activity.read(true), /offline/)
  assert.equal(activity.unreadCount, 5)
  service.fetchBotActivity.mock.mockImplementation(async () => [summary('a', 1)])
  t.mock.timers.tick(15000)
  await activity.read()
  assert.equal(activity.unreadCount, 1)
})

test('stopping drops pending work and other platforms still receive activity updates without a Dock API', async (t) => {
  const { service, activity, badges, sent, dispose } = fixture(t, 'win32')
  await activity.read()
  assert.deepEqual(badges, [])
  assert.ok(sent.length > 0)
  const pending = deferred()
  service.fetchBotActivity.mock.mockImplementation(() => pending.promise)
  const request = activity.read(true)
  dispose()
  const calls = service.fetchBotActivity.mock.callCount()
  pending.resolve([summary('a', 8)])
  assert.deepEqual(await request, [])
  assert.equal(activity.unreadCount, 0)
  assert.equal(service.fetchBotActivity.mock.callCount(), calls)
})

test('service lifecycle invalidates shared counts after read writes, list changes, scope changes and logout', async (t) => {
  let unread = 4
  let bots = [{ id: 'a', name: 'Assistant' }]
  const calls = []
  const service = new DesktopService({
    fetcher: async (url, options) => {
      calls.push({ url, options })
      let body
      if (url.includes('/mobile/xperts')) body = { items: bots, total: bots.length }
      else if (url.endsWith('/unread/xperts')) body = [summary('a', unread), summary('inaccessible', 200)]
      else if (url.includes('/by-thread')) body = { id: 'conversation', xpertId: 'a', threadId: 'thread' }
      else if (url.includes('/chat-conversation/xpert/'))
        body = { items: [{ id: 'conversation', xpertId: 'a' }], total: 1 }
      else if (url.includes('/read-state')) {
        unread = 0
        body = {}
      } else throw new Error(`Unexpected request: ${url}`)
      return new Response(JSON.stringify(body))
    }
  })
  service.credentials = { token: 'fixture', tenantId: 'tenant' }
  service.profile = {
    user: { id: 'user', tenantId: 'tenant' },
    organizationId: 'org',
    organizations: [{ id: 'org' }, { id: 'org-2' }]
  }
  t.after(() => service.assistantActivity.stop())
  await service.listBots()
  service.assistantActivity.start()
  const copy = service.duplicateBot({ botId: 'a', name: 'Local copy' })
  await Promise.all([service.botActivity(), service.botActivity()])
  assert.equal(service.assistantActivity.unreadCount, 4)
  assert.equal(calls.filter((call) => call.url.endsWith('/unread/xperts')).length, 1)
  assert.deepEqual(JSON.parse(calls.find((call) => call.url.endsWith('/unread/xperts')).options.body).xpertIds, ['a'])
  service.updateSidebar({ action: 'unread', botId: copy.botId, unread: true })
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 4)
  await service.markBotRead({ botId: copy.botId, threadId: 'thread' })
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 0)
  unread = 7
  await service.botActivity({ refresh: true })
  await service.markAllBotRead('a')
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 0)
  unread = 5
  await service.botActivity({ refresh: true })
  bots = []
  await service.listBots()
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 0)
  bots = [{ id: 'a', name: 'Assistant' }]
  await service.listBots()
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 5)
  await service.selectOrganization('org-2')
  assert.equal(service.assistantActivity.unreadCount, 0)
  await service.listBots()
  await service.botActivity()
  assert.equal(service.assistantActivity.unreadCount, 5)
  service.logout()
  assert.equal(service.assistantActivity.unreadCount, 0)
})

test('unread response normalization only accepts finite nonnegative integer counts', async (t) => {
  const service = new DesktopService({
    fetcher: async () =>
      new Response(
        JSON.stringify([summary('a', 'Infinity'), summary('b', -4), summary('c', '3.9'), summary('d', null)])
      )
  })
  service.credentials = { token: 'fixture' }
  service.profile = { user: { id: 'user' }, organizationId: 'org' }
  service.bots = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  t.after(() => service.assistantActivity.stop())
  assert.deepEqual(
    (await service.botActivity()).map((item) => item.unreadMessages),
    [0, 0, 3, 0]
  )
  assert.equal(service.assistantActivity.unreadCount, 3)
})

test('waits for the signed-in user identity before polling and limits native badge values to signed integers', async (t) => {
  const { service, activity, badges } = fixture(t)
  await activity.read()
  delete service.profile.user
  activity.sync()
  const calls = service.fetchBotActivity.mock.callCount()
  assert.deepEqual(await activity.read(true), [])
  assert.equal(service.fetchBotActivity.mock.callCount(), calls)
  assert.equal(badges.at(-1), 0)
  service.profile.user = { id: 'user', tenantId: 'tenant' }
  service.fetchBotActivity.mock.mockImplementation(async () => [summary('a', Number.MAX_SAFE_INTEGER)])
  activity.sync()
  await activity.read()
  assert.equal(badges.at(-1), 2147483647)
})
