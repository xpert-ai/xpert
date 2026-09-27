const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const {
  assistantRows,
  assistantGroups,
  assistantStatusLabel,
  resizeSidebar
} = require('../src/assistant-list-model.ts')

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
          JSON.stringify({
            items: [
              {
                id: 'source',
                name: 'Original',
                description: 'Original description',
                businessArea: { id: 'sales-area', name: 'Sales' }
              }
            ],
            total: 1
          })
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
              latestConversationStatus: 'busy',
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
  assert.deepEqual(
    bots.map((bot) => bot.businessArea),
    [
      { id: 'sales-area', name: 'Sales' },
      { id: 'sales-area', name: 'Sales' }
    ]
  )
  await service.chatSession(copy.botId)
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { assistant: { id: 'source' } })
  const activity = await service.botActivity()
  assert.deepEqual(JSON.parse(calls.at(-1).options.body), { xpertIds: ['source'] })
  assert.equal(activity[0].latestConversationTitle, 'Latest task')
  assert.equal(activity[0].latestConversationStatus, 'busy')
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

test('creation order stays stable while unread state and conversation activity change', () => {
  const bots = [
    { id: 'a', name: 'A', description: 'Fallback', createdAt: '2026-09-24T00:00:00Z' },
    { id: 'b', name: 'B', description: 'B', createdAt: '2026-09-25T00:00:00Z' },
    { id: 'copy', assistantId: 'a', name: 'Copy', description: 'Local fallback', createdAt: '2026-09-24T00:00:00Z' }
  ]
  const sidebar = { items: [{ botId: 'a', unreadAt: 100 }], sections: [], copies: [], width: 320, collapsed: false }
  const activity = [
    {
      xpertId: 'a',
      unreadMessages: 1,
      latestConversationTitle: 'Recent conversation',
      latestConversationAt: '2026-09-27',
      latestUnreadAt: '2026-09-27'
    }
  ]
  const rows = assistantRows(bots, sidebar, activity, '')
  assert.deepEqual(
    rows.map((row) => row.bot.id),
    ['b', 'a', 'copy']
  )
  assert.equal(rows.find((row) => row.bot.id === 'a').unread, true)
  assert.deepEqual(
    assistantRows(bots, { ...sidebar, items: [] }, [], '').map((row) => row.bot.id),
    ['b', 'a', 'copy']
  )
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

test('both sidebar modes share nonempty groups, pinned precedence and stable within-group order', () => {
  const sidebar = {
    items: [
      { botId: 'a', sectionId: 'work', pinnedAt: 1 },
      { botId: 'b', sectionId: 'work' },
      { botId: 'c', sectionId: 'deleted' }
    ],
    sections: [
      { id: 'empty', name: 'Empty' },
      { id: 'work', name: 'Work' }
    ]
  }
  const bots = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: id, description: '' }))
  const groups = assistantGroups(assistantRows(bots, sidebar, [], ''), sidebar)
  assert.deepEqual(
    groups.map((group) => [group.kind, group.rows.map((row) => row.bot.id)]),
    [
      ['pinned', ['a']],
      ['section', ['b']],
      ['unassigned', ['c', 'd']]
    ]
  )
  assert.equal(assistantGroups(assistantRows(bots, sidebar, [], 'missing'), sidebar).length, 0)
})

test('unassigned assistants use published domains after pins and manual sections without duplicates', () => {
  const sidebar = {
    items: [
      { botId: 'pinned', pinnedAt: 1, sectionId: 'manual' },
      { botId: 'manual', sectionId: 'manual' },
      { botId: 'deleted', sectionId: 'deleted' }
    ],
    sections: [{ id: 'manual', name: 'My team' }]
  }
  const bots = [
    { id: 'pinned', businessArea: { id: 'sales-area', name: 'Sales' } },
    { id: 'manual', businessArea: { id: 'sales-area', name: 'Sales' } },
    {
      id: 'sales-old',
      businessArea: { id: 'sales-area', name: 'Sales' },
      businessCategories: ['finance'],
      createdAt: '2026-09-01'
    },
    { id: 'sales-new', businessArea: { id: 'sales-area', name: 'Sales' }, createdAt: '2026-09-02' },
    { id: 'deleted', businessArea: { id: 'finance-area', name: 'Finance' } },
    { id: 'other', businessArea: { id: 'material-area', name: 'Material master data' } },
    { id: 'missing', businessCategories: ['business-operations'] }
  ].map((bot) => ({ name: bot.id, description: 'Finance expert', ...bot }))
  const groups = assistantGroups(assistantRows(bots, sidebar, [], ''), sidebar)
  assert.deepEqual(
    groups.map((group) => [group.kind, group.name, group.rows.map((row) => row.bot.id)]),
    [
      ['pinned', 'Pinned assistants', ['pinned']],
      ['section', 'My team', ['manual']],
      ['domain', 'Finance', ['deleted']],
      ['domain', 'Material master data', ['other']],
      ['domain', 'Sales', ['sales-new', 'sales-old']],
      ['unassigned', 'Unassigned', ['missing']]
    ]
  )
  assert.equal(new Set(groups.flatMap((group) => group.rows.map((row) => row.bot.id))).size, bots.length)
  assert.deepEqual(
    assistantGroups(assistantRows(bots, sidebar, [], 'sales-new'), sidebar).map((group) => group.name),
    ['Sales']
  )
  const automatic = assistantGroups(assistantRows(bots, { ...sidebar, items: [] }, [], ''), sidebar)
  assert.equal(
    automatic.some((group) => group.kind === 'section' || group.kind === 'pinned'),
    false
  )
  assert.ok(automatic.find((group) => group.name === 'Sales').rows.some((row) => row.bot.id === 'manual'))
})

test('business areas use IDs so renames and equal display names do not merge independent domains', () => {
  const sidebar = { items: [], sections: [] }
  const bots = [
    { id: 'a', name: 'A', description: '', businessArea: { id: 'area-a', name: 'Sales' } },
    { id: 'b', name: 'B', description: '', businessArea: { id: 'area-b', name: 'Sales' } }
  ]
  const groups = () => assistantGroups(assistantRows(bots, sidebar, [], ''), sidebar)
  assert.equal(groups().length, 2)
  bots[0].businessArea.name = 'Procurement'
  assert.equal(groups().find((group) => group.id === 'domain:area-a').name, 'Procurement')
})

test('hover status follows the typed conversation state and never guesses activity from a title', () => {
  assert.equal(assistantStatusLabel(), 'No conversations yet')
  assert.equal(
    assistantStatusLabel({ latestConversationId: 'c', latestConversationTitle: 'Working' }),
    'Status unavailable'
  )
  for (const [state, label] of Object.entries({
    idle: 'Idle',
    busy: 'Working',
    pausing: 'Pausing',
    paused: 'Paused',
    interrupted: 'Waiting for input',
    error: 'Failed'
  })) {
    assert.equal(assistantStatusLabel({ latestConversationStatus: state }), label)
  }
})
