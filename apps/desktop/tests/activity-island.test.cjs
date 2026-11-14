const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { installActivityIsland, panelLayout } = require('../electron/activity-island/panel.cjs')

test('only visible, scoped requests can open a chat; passive panel events never focus it', async (t) => {
  const activity = Object.assign(new EventEmitter(), {
    scopeKey: 'account',
    scope() {
      return this.scopeKey
    },
    items: [],
    async read() {
      this.emit('change')
    }
  })
  const service = {
    assistantActivity: activity,
    config: { locale: 'en' },
    bots: [
      { id: 'bot', name: 'Bosi' },
      { id: 'writer', name: 'Writer', avatarEmoji: { unified: '270d-fe0f' } },
      { id: 'reviewer', name: 'Reviewer' }
    ]
  }
  const display = { bounds: { x: -1000, y: 0, width: 1000 }, workArea: { y: 36 } }
  const cursor = { x: 0, y: 200 }
  const screen = Object.assign(new EventEmitter(), {
    getPrimaryDisplay: () => display,
    getAllDisplays: () => [display],
    getCursorScreenPoint: () => cursor
  })
  const ipcMain = Object.assign(new EventEmitter(), {
    handle(_, handler) {
      this.action = handler
    }
  })
  let panel,
    state,
    mainShows = 0,
    target,
    grant
  const main = {
    webContents: {
      isDestroyed: () => false,
      send: (_, value) => {
        target = value
      }
    }
  }
  const NativeWindow = class extends EventEmitter {
    constructor(options) {
      super()
      assert.equal(options.type, 'panel')
      assert.equal(options.focusable, false)
      assert.equal(options.acceptFirstMouse, true)
      this.bounds = options
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: {},
        send: (channel, value) => {
          if (channel === 'island:state') state = { ...value, assistants: value.assistants ?? state?.assistants }
        },
        setWindowOpenHandler() {}
      })
      panel = this
    }
    setAlwaysOnTop() {}
    setIgnoreMouseEvents(value, options) {
      assert.deepEqual(options, { forward: true })
      this.ignoresMouse = value
    }
    setVisibleOnAllWorkspaces() {}
    setHiddenInMissionControl() {}
    getBounds() {
      return this.bounds
    }
    setBounds(value) {
      this.bounds = value
    }
    loadURL(url) {
      this.webContents.mainFrame.url = url
      return Promise.resolve()
    }
    showInactive() {
      this.visible = true
    }
    hide() {
      this.visible = false
    }
    isVisible() {
      return this.visible
    }
    isDestroyed() {
      return false
    }
    destroy() {
      this.emit('closed')
    }
  }
  const island = installActivityIsland({
    BrowserWindow: NativeWindow,
    ipcMain,
    service,
    screen,
    control: { displayCutouts: async () => [], active: () => grant, stopGrant: () => false },
    trusted: (e) => e.sender === main.webContents,
    showWindow: () => {
      mainShows++
      return main
    }
  })
  t.after(() => island.dispose())
  activity.items = [
    {
      xpertId: 'bot',
      pendingThreadCount: 104,
      pendingThreads: [
        { threadId: 'first', kind: 'approval', rank: 3 },
        { threadId: 'older', kind: 'question', rank: 4 }
      ]
    },
    { xpertId: 'writer', pendingThreadCount: 1, pendingThreads: [{ threadId: 'second', kind: 'question', rank: 1 }] },
    { xpertId: 'reviewer', pendingThreadCount: 1, pendingThreads: [{ threadId: 'third', kind: 'approval', rank: 2 }] }
  ]
  activity.emit('change')
  await Promise.resolve()
  const event = { sender: panel.webContents, senderFrame: panel.webContents.mainFrame }
  await ipcMain.action(event, 'ready')
  assert.equal(mainShows, 0)
  assert.equal(panel.ignoresMouse, true)
  const initialBounds = panel.bounds
  assert.ok(initialBounds.width >= Math.max(state.hoverWidth, state.expandedWidth) + 60)
  assert.ok(initialBounds.height >= state.expandedHeight + state.top + 30)
  await ipcMain.action(event, 'interactive', true)
  assert.equal(panel.ignoresMouse, false)
  await ipcMain.action(event, 'interactive', false)
  assert.equal(panel.ignoresMouse, true)
  assert.equal(panel.bounds, initialBounds)
  const preview = state.tasks
  assert.deepEqual(
    preview.map((task) => state.assistants[task.assistant].name),
    ['Writer', 'Reviewer', 'Bosi']
  )
  assert.equal(state.pendingTotal, 106)
  assert.deepEqual(Object.keys(state.tasks[0]).sort(), ['assistant', 'id', 'kind', 'label'])
  assert.equal(state.singleOwner, false)
  assert.deepEqual(state.assistants[preview[0].assistant], { name: 'Writer', glyph: '✍️', image: null })
  const id = preview[0].id
  assert.equal(await ipcMain.action({ sender: main.webContents }, 'review', id), false)
  await ipcMain.action(event, 'expand', true)
  assert.equal(state.expanded, true)
  assert.equal(panel.bounds, initialBounds)
  grant = { id: 'current', name: 'Bosi', app: 'TextEdit', title: 'test.txt' }
  island.sync()
  assert.ok(state.active)
  assert.equal(state.tasks.length, 3)
  await ipcMain.action(event, 'review', id)
  assert.equal(mainShows, 1)
  assert.equal(target, undefined)
  ipcMain.emit('island:main-ready', { sender: main.webContents })
  assert.deepEqual(target, { botId: 'writer', threadId: 'second' })
  assert.deepEqual(state.tasks, preview)
  assert.equal(state.pendingTotal, 106)
  activity.items.splice(1, 1)
  activity.emit('change')
  assert.deepEqual(
    state.tasks.slice(0, 2).map((task) => task.id),
    preview.slice(1).map((task) => task.id)
  )
  assert.deepEqual(
    state.tasks.map((task) => task.kind),
    ['approval', 'approval', 'question']
  )
  assert.equal(state.pendingTotal, 105)
  const firstOwner = activity.items[0]
  const otherOwner = activity.items[1]
  firstOwner.pendingThreads.push({ threadId: 'another', kind: 'question', rank: 5 })
  otherOwner.pendingThreads[0].rank = 8
  activity.emit('change')
  assert.equal(state.singleOwner, false)
  assert.deepEqual(
    state.assistants.map((owner) => owner.name),
    ['Bosi']
  )
  assert.ok(state.tasks.every((task) => task.assistant === 0))
  activity.items = [firstOwner]
  activity.emit('change')
  assert.equal(state.singleOwner, true)
  assert.equal(state.pendingTotal, 104)
  activity.items = [otherOwner]
  activity.emit('change')
  const staleId = state.tasks[0].id
  activity.read = async () => {
    activity.items = []
    activity.emit('change')
  }
  assert.equal(await ipcMain.action(event, 'review', staleId), false)
  assert.equal(mainShows, 1)
  grant = undefined
  activity.scopeKey = null
  activity.emit('change')
  assert.equal(panel.isVisible(), false)
})

test('the wings meet the camera edges even with an external primary; flat screens use a detached capsule', () => {
  const external = { id: 4, bounds: { x: 0, y: 0, width: 1920 }, workArea: { y: 24 } }
  const laptop = { id: 1, bounds: { x: -1728, y: -70, width: 1728 }, workArea: { y: -37 } }
  const camera = { id: 1, left: 771, width: 185, height: 32 }
  const compact = panelLayout(external, [laptop, external], [camera], 0)
  assert.equal(compact.bounds.y, -70)
  assert.equal(compact.bounds.x + (compact.bounds.width - compact.gap) / 2, -1728 + 771)
  assert.equal(compact.gap, 185)
  assert.equal(panelLayout(external, [laptop], [camera], 2).bounds.y, compact.bounds.y)
  const detached = panelLayout(external, [external], [], 0)
  assert.equal(detached.top, 6)
  assert.equal(detached.compactWidth, 212)
  assert.equal(detached.hoverWidth, 244)
  assert.equal(detached.barHeight, 32)
  assert.equal(detached.bounds.x + detached.bounds.width / 2, 960)
})

test('custom dimensions preserve the physical camera clearance and scale the external capsule', () => {
  const screen = { id: 1, bounds: { x: 0, y: 0, width: 1500 } }
  const prefs = { width: 60, height: 75 }
  const cutout = { id: 1, left: 676, width: 148, height: 38 }
  const notched = panelLayout(screen, [screen], [cutout], 0, false, prefs)
  assert.equal(notched.gap, 148)
  assert.equal(notched.barHeight, 38)
  assert.equal(notched.compactWidth, 249)
  const withStopAndCount = panelLayout(screen, [screen], [cutout], 1, true, prefs)
  assert.ok((withStopAndCount.compactWidth - cutout.width) / 2 >= 100)
  assert.equal(panelLayout(screen, [screen], [], 0, false, prefs).barHeight, 24)
})
