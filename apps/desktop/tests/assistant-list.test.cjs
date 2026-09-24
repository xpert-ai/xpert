const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { assistantRows, resizeSidebar } = require('../src/assistant-list-model.ts')

function fixture() {
  let saved
  const calls = []
  const storage = {
    read: () => saved,
    write: (state) => {
      saved = structuredClone(state)
    }
  }
  const service = new DesktopService({
    storage,
    fetcher: async (url, options) => {
      calls.push({ url, options })
      if (url.includes('/mobile/xperts'))
        return new Response(
          JSON.stringify({ items: [{ id: 'source', name: 'Original', description: 'Original description' }], total: 1 })
        )
      if (url.includes('/chatkit/sessions')) return new Response(JSON.stringify({ client_secret: 'scoped-secret' }))
      if (url.includes('/by-thread'))
        return new Response(
          JSON.stringify({ id: 'conversation', threadId: 'thread', xpertId: 'source', title: 'Latest task' })
        )
      if (url.includes('/read-state')) return new Response('{}')
      if (url.endsWith('/unread/xperts'))
        return new Response(
          JSON.stringify([
            {
              xpertId: 'source',
              unreadMessages: 2,
              unreadConversations: 1,
              latestConversationTitle: 'Latest task',
              latestConversationThreadId: 'thread'
            }
          ])
        )
      throw new Error(`Unexpected request: ${url}`)
    }
  })
  service.profile = {
    user: { id: 'user', tenantId: 'tenant' },
    organizationId: 'org',
    organizations: [{ id: 'org' }, { id: 'another' }]
  }
  service.credentials = { token: 'fixture', refreshToken: 'refresh', tenantId: 'tenant' }
  return { service, calls, storage }
}

test('profiles and copies stay local while sessions and activity use the original platform assistant', async () => {
  const { service, calls } = fixture()
  await service.listBots()
  service.editBot({ botId: 'source', name: 'My assistant', description: 'My notes' })
  const copy = service.duplicateBot({ botId: 'source', name: 'Personal copy' })
  const bots = await service.listBots()
  assert.equal(bots.length, 2)
  assert.equal(bots[0].name, 'My assistant')
  assert.equal(bots[1].name, 'Personal copy')
  assert.equal(bots[1].assistantId, 'source')
  await service.chatSession(copy.botId)
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { assistant: { id: 'source' } })
  const activity = await service.botActivity()
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { xpertIds: ['source'] })
  assert.equal(activity[0].latestConversationTitle, 'Latest task')
  await service.markBotRead({ botId: copy.botId, threadId: 'thread' })
  assert.ok(calls.every((call) => !/\/api\/xpert\//.test(call.url)))
  assert.equal(bots[0].description, 'My notes')
})

test('pinning, sections, local unread and profile overrides survive restart and remain account/org/server scoped', async () => {
  const { service, storage } = fixture()
  await service.listBots()
  service.updateSidebar({ action: 'pin', botId: 'source', pinned: true })
  service.updateSidebar({ action: 'section', name: 'Projects', botId: 'source' })
  service.updateSidebar({ action: 'unread', botId: 'source', unread: true })
  service.updateSidebar({ action: 'layout', width: 100, collapsed: true })
  const value = service.sidebarState()
  assert.equal(value.width, 240)
  assert.equal(value.items[0].sectionId, value.sections[0].id)
  assert.ok(value.items[0].unreadAt)
  const resumed = new DesktopService({ storage })
  resumed.profile = structuredClone(service.profile)
  assert.deepEqual(resumed.sidebarState(), value)
  resumed.profile.organizationId = 'another'
  assert.deepEqual(resumed.sidebarState().items, [])
  resumed.profile.organizationId = 'org'
  resumed.profile.user.id = 'other-user'
  assert.deepEqual(resumed.sidebarState().sections, [])
  resumed.profile = structuredClone(service.profile)
  resumed.config.apiUrl = 'http://localhost:3999'
  assert.deepEqual(resumed.sidebarState().items, [])
  assert.throws(() => service.updateSidebar({ action: 'move', botId: 'source', sectionId: 'unknown' }))
  assert.throws(() => service.updateSidebar({ action: 'pin', botId: 'inaccessible', pinned: true }))
})

test('unread sorts first, local copies reuse source activity, and titles fall back only when absent', () => {
  const bots = [
    { id: 'a', name: 'A', description: 'Fallback' },
    { id: 'b', name: 'B', description: 'B' },
    { id: 'copy', assistantId: 'a', name: 'Copy', description: 'Local fallback' }
  ]
  const sidebar = { items: [{ botId: 'b', unreadAt: 100 }], sections: [], copies: [], width: 320, collapsed: false }
  const activity = [
    {
      xpertId: 'a',
      unreadMessages: 0,
      latestConversationTitle: 'Recent conversation',
      latestConversationAt: '2026-09-24'
    }
  ]
  const rows = assistantRows(bots, sidebar, activity, '')
  assert.equal(rows[0].bot.id, 'b')
  assert.equal(rows.find((row) => row.bot.id === 'copy').subtitle, 'Recent conversation')
  assert.equal(assistantRows(bots, sidebar, [], '')[1].subtitle, 'Fallback')
  assert.equal(assistantRows(bots, sidebar, activity, 'recent').length, 2)
})

test('resize clamps before collapsing only past half the minimum width', () => {
  assert.deepEqual(resizeSidebar(239, 1280), { width: 240, collapsed: false })
  assert.deepEqual(resizeSidebar(120, 1280), { width: 240, collapsed: false })
  assert.deepEqual(resizeSidebar(119, 1280), { width: 240, collapsed: true })
  assert.deepEqual(resizeSidebar(800, 800), { width: 440, collapsed: false })
})
