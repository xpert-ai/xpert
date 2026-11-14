const assert = require('node:assert/strict')
const test = require('node:test')
const {
  account,
  preferences,
  DockSeats,
  dockBounds,
  dockOffset,
  hitsDockHandle,
  readDockOffsets
} = require('../electron/agent-dock/model.cjs')

test('dock selection follows the account and distinguishes assistants from shared conversations', () => {
  const service = {
    config: { apiUrl: 'https://example.org' },
    credentials: {},
    profile: { user: { id: 'u', tenantId: 't' }, organizationId: 'o' },
    bots: ['1', '2', '3', '4'].map((id) => ({ id, name: id })),
    assistantActivity: { items: [{ xpertId: '2', unreadMessages: 2 }] },
    sidebars: {},
    sidebarState() {
      return this.sidebars[account(this)] ?? { items: [{ botId: '4', pinnedAt: 10 }] }
    },
    persist() {}
  }
  const group = { id: '2', purpose: 'group', title: 'Review', unread: true }
  const seats = new DockSeats(),
    binding = account(service)
  seats.refresh(service, [group])
  assert.deepEqual(
    seats.entries(false).map((x) => x.name),
    ['4', '1', '2']
  )
  const g = seats.entries(true).find((x) => x.kind === 'group')
  assert.equal(seats.toggle(service, binding, g.token), true)
  seats.refresh(service, [group])
  assert.deepEqual(
    seats.entries(false).map((x) => x.name),
    ['4', '1', '2', 'Review']
  )
  assert.equal(seats.entries(false).at(-1).token, g.token)
  const fresh = new DockSeats()
  fresh.refresh(service, [group])
  assert.equal(fresh.entries(false).at(-1).name, 'Review')
  assert.equal(fresh.toggle(service, binding, g.token), false)
  seats.refresh(service, [{ ...group, archived: true }])
  assert.ok(!seats.entries(false).some((x) => x.kind === 'group'))
  service.profile.organizationId = 'another'
  assert.equal(seats.toggle(service, binding, g.token), false)
  const switched = new DockSeats()
  switched.refresh(service, [])
  assert.ok(!switched.entries(false).some((x) => x.kind === 'group'))
})

test('dock stays centred on the selected screen and retracts against either edge', () => {
  const area = { x: -1440, y: -50, width: 1440, height: 800 }
  const right = dockBounds(area, 'right', 3, true, false),
    left = dockBounds(area, 'left', 3, false, false)
  assert.equal(right.x + right.width, 0)
  assert.equal(left.x, -1440)
  assert.equal(left.width, 6)
  assert.equal(right.y * 2 + right.height, area.y * 2 + area.height)
  assert.ok(dockBounds(area, 'right', 100, true, false).height <= area.height)
  assert.deepEqual(preferences({ edge: 'other' }), require('../electron/overlay-defaults.json').dock)
})

test('drag offsets stay inside each work area across edge, panel size and screen changes', () => {
  const area = { x: 125, y: -970, width: 1440, height: 900 }
  for (const edge of ['left', 'right']) {
    const bounds = (offset, managing = false) => dockBounds(area, edge, 1, true, managing, offset)
    const { y, height } = bounds(0.5)
    const offset = dockOffset(area, height, y + 100)
    assert.equal(bounds(offset).y, y + 100)
    assert.equal(bounds(offset).x, bounds(0.5).x)
    assert.equal(bounds(dockOffset(area, height, -2000)).y, area.y)
    assert.equal(bounds(dockOffset(area, height, 2000), true).y + bounds(1, true).height, area.y + area.height)
    assert.equal(dockOffset(area, area.height, y + 50), 0.5)
  }
  assert.deepEqual(readDockOffsets({ 77: 0.25, 78: 1, 79: '1', 80: -1, 81: 2, other: 0.5 }), { 77: 0.25, 78: 1 })
  assert.deepEqual(readDockOffsets(null), {})
})

test('only the arc and its rounded hit stroke accept a drag below the rail', () => {
  for (const [x, y] of [
    [37, 10],
    [20, 17],
    [13, 34],
    [13, 41]
  ])
    assert.ok(hitsDockHandle(x, y))
  for (const [x, y] of [
    [0, 34],
    [37, 34],
    [65, 10],
    [20, 48]
  ])
    assert.ok(!hitsDockHandle(x, y))
})

test('older profiles keep the edge strip and invalid persisted sizes stay in range', () => {
  const { islandPreferences } = require('../electron/overlay-preferences.cjs')
  const old = preferences({ autoHide: true, edge: 'left' })
  assert.equal(old.strip, true)
  assert.equal(old.size, 100)
  assert.equal(old.placement, 'screen')
  const dock = preferences({ display: 'unavailable', size: 200 })
  assert.equal(dock.display, 'window')
  assert.equal(dock.size, 140)
  const island = islandPreferences({ width: -5, height: '25' })
  assert.equal(island.width, 60)
  assert.equal(island.height, 100)
})
