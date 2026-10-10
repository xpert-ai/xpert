const { test } = require('node:test')
const assert = require('node:assert/strict')
const { conversationGroups } = require('../src/conversation-list-model.ts')
const sidebar = { items: [], sections: [] }
const assistant = (id, date) => ({ bot: { id, name: id, createdAt: date }, activity: { latestConversationAt: date } })
const group = (id, date, extra = {}) => ({
  purpose: 'group',
  id,
  title: id,
  updatedAt: date,
  lastMessage: 'Latest discussion',
  pinned: false,
  archived: false,
  ...extra
})

test('group conversations interleave with assistants by recent activity in the existing default list', () => {
  const sections = conversationGroups(
    [assistant('new', '2026-10-09'), assistant('old', '2026-10-01')],
    [group('team', '2026-10-05')],
    sidebar,
    ''
  )
  assert.equal(sections.length, 1)
  assert.equal(sections[0].kind, 'unassigned')
  assert.deepEqual(
    sections[0].rows.map((row) => (row.purpose === 'group' ? row.group.id : row.assistant.bot.id)),
    ['new', 'team', 'old']
  )
})
test('group pins share the existing pinned section and archived groups stay out of the ordinary list', () => {
  const bot = { ...assistant('bot', '2026-10-01'), preference: { pinnedAt: 1 } }
  const sections = conversationGroups(
    [bot],
    [group('team', '2026-10-05', { pinned: true }), group('hidden', '2026-10-09', { archived: true })],
    sidebar,
    ''
  )
  assert.equal(sections.length, 1)
  assert.equal(sections[0].kind, 'pinned')
  assert.equal(sections[0].rows.length, 2)
  assert.equal(sections[0].rows[0].group.id, 'team')
})
test('group titles and latest messages use the shared search, and archive view can restore groups', () => {
  const groups = [group('Design', '2026-10-09'), group('Old', '2026-10-08', { archived: true })]
  assert.equal(conversationGroups([], groups, sidebar, 'discussion')[0].rows.length, 1)
  assert.equal(conversationGroups([], groups, sidebar, 'missing').length, 0)
  assert.equal(conversationGroups([assistant('bot')], groups, sidebar, '', true)[0].rows[0].group.id, 'Old')
})
test('business and custom sections remain and groups do not create a fixed group-chat section', () => {
  const bot = {
    ...assistant('sales', '2026-10-09'),
    bot: { id: 'sales', name: 'Sales', businessArea: { id: 'sales', name: 'Sales' } }
  }
  const sections = conversationGroups([bot], [group('team', '2026-10-09')], sidebar, '')
  assert.deepEqual(
    sections.map((section) => section.kind),
    ['domain', 'unassigned']
  )
})
