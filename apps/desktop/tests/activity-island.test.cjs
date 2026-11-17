const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { installActivityIsland, panelLayout } = require('../electron/activity-island/panel.cjs')

function fixture(t) {
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
    control: {
      displayCutouts: async () => [],
      active: () => grant,
      stopGrant: (id) => {
        if (!grant || grant.id !== id) return false
        grant = undefined
        return true
      }
    },
    trusted: (e) => e.sender === main.webContents,
    showWindow: () => {
      mainShows++
      return main
    }
  })
  t.after(() => island.dispose())
  return {
    activity,
    ipcMain,
    main,
    island,
    get panel() {
      return panel
    },
    get state() {
      return state
    },
    get target() {
      return target
    },
    get mainShows() {
      return mainShows
    },
    set grant(value) {
      grant = value
    }
  }
}

test('only visible, scoped requests can open a chat; passive panel events never focus it', async (t) => {
  const view = fixture(t)
  const { activity, ipcMain, main, island } = view
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
  const event = { sender: view.panel.webContents, senderFrame: view.panel.webContents.mainFrame }
  await ipcMain.action(event, 'ready')
  assert.equal(view.mainShows, 0)
  assert.equal(view.panel.ignoresMouse, true)
  const initialBounds = view.panel.bounds
  assert.ok(initialBounds.width >= Math.max(view.state.hoverWidth, view.state.expandedWidth) + 60)
  assert.ok(initialBounds.height >= view.state.expandedHeight + view.state.top + 30)
  await ipcMain.action(event, 'interactive', true)
  assert.equal(view.panel.ignoresMouse, false)
  await ipcMain.action(event, 'interactive', false)
  assert.equal(view.panel.ignoresMouse, true)
  assert.equal(view.panel.bounds, initialBounds)
  const preview = view.state.tasks
  assert.deepEqual(
    preview.map((task) => view.state.assistants[task.assistant].name),
    ['Writer', 'Reviewer', 'Bosi']
  )
  assert.equal(view.state.pendingTotal, 106)
  assert.deepEqual(Object.keys(view.state.tasks[0]).sort(), ['assistant', 'id', 'kind', 'label'])
  assert.equal(view.state.singleOwner, false)
  assert.deepEqual(view.state.assistants[preview[0].assistant], { name: 'Writer', glyph: '✍️', image: null })
  const id = preview[0].id
  assert.equal(await ipcMain.action({ sender: main.webContents }, 'review', id), false)
  await ipcMain.action(event, 'expand', true)
  assert.equal(view.state.expanded, true)
  assert.equal(view.panel.bounds, initialBounds)
  view.grant = { id: 'current', name: 'Bosi', app: 'TextEdit', title: 'test.txt' }
  island.sync()
  assert.ok(view.state.active)
  assert.equal(view.state.tasks.length, 3)
  await ipcMain.action(event, 'review', id)
  assert.equal(view.mainShows, 1)
  assert.equal(view.target, undefined)
  ipcMain.emit('island:main-ready', { sender: main.webContents })
  assert.deepEqual(view.target, { botId: 'writer', threadId: 'second' })
  assert.deepEqual(view.state.tasks, preview)
  assert.equal(view.state.pendingTotal, 106)
  activity.items.splice(1, 1)
  activity.emit('change')
  assert.deepEqual(
    view.state.tasks.slice(0, 2).map((task) => task.id),
    preview.slice(1).map((task) => task.id)
  )
  assert.deepEqual(
    view.state.tasks.map((task) => task.kind),
    ['approval', 'approval', 'question']
  )
  assert.equal(view.state.pendingTotal, 105)
  const firstOwner = activity.items[0]
  const otherOwner = activity.items[1]
  firstOwner.pendingThreads.push({ threadId: 'another', kind: 'question', rank: 5 })
  otherOwner.pendingThreads[0].rank = 8
  activity.emit('change')
  assert.equal(view.state.singleOwner, false)
  assert.deepEqual(
    view.state.assistants.map((owner) => owner.name),
    ['Bosi']
  )
  assert.ok(view.state.tasks.every((task) => task.assistant === 0))
  activity.items = [firstOwner]
  activity.emit('change')
  assert.equal(view.state.singleOwner, true)
  assert.equal(view.state.pendingTotal, 104)
  activity.items = [otherOwner]
  activity.emit('change')
  const staleId = view.state.tasks[0].id
  activity.read = async () => {
    activity.items = []
    activity.emit('change')
  }
  assert.equal(await ipcMain.action(event, 'review', staleId), false)
  assert.equal(view.mainShows, 1)
  view.grant = undefined
  activity.scopeKey = null
  activity.emit('change')
  assert.equal(view.panel.isVisible(), false)
})

test('running status opens the exact private thread or offers every choice without taking over pending and Stop', async (t) => {
  const view = fixture(t)
  const { activity, ipcMain, main } = view
  const run = (threadId) => ({ threadId, title: 'Delivery dates' })
  const item = {
    xpertId: 'bot',
    hasActiveRuns: true,
    runningThreads: [run('quote-A')],
    latestConversationThreadId: 'idle'
  }
  activity.items = [item, { xpertId: 'unavailable', runningThreads: [run('foreign')] }]
  await Promise.resolve()
  const event = { sender: view.panel.webContents, senderFrame: view.panel.webContents.mainFrame }
  const act = (...args) => ipcMain.action(event, ...args)
  await act('ready')
  ipcMain.emit('island:main-ready', { sender: main.webContents })
  const first = view.state.runs[0].id
  assert.equal(view.state.runs.length, 1)
  assert.equal(await act('running', first), true)
  assert.deepEqual(view.target, { botId: 'bot', threadId: 'quote-A' })

  // A branch starts while the direct-open click is refreshing. The original singleton no longer decides the route.
  activity.read = async () => {
    item.runningThreads = ['quote-A', 'quote-B', 'quote-C', 'quote-D'].map(run)
    activity.emit('change')
  }
  assert.equal(await act('running', first), true)
  assert.equal(view.mainShows, 1)
  assert.equal(view.state.expanded, true)
  assert.equal(view.state.runs.length, 4)
  assert.equal(new Set(view.state.runs.map((row) => row.title)).size, 4)
  const fourth = view.state.runs[3].id
  item.pendingThreads = [{ threadId: 'approval', kind: 'approval' }]
  view.grant = { id: 'window', name: 'Bosi', app: 'TextEdit' }
  activity.emit('change')
  assert.equal(await act('review', fourth), true)
  assert.deepEqual(view.target, { botId: 'bot', threadId: 'quote-D' })
  assert.equal(await act('stop', 'stale-grant'), false)
  assert.equal(await act('stop', 'window'), true)
  assert.equal(await act('review', view.state.tasks[0].id), true)
  assert.deepEqual(view.target, { botId: 'bot', threadId: 'approval' })

  activity.read = async () => {
    throw new Error('offline')
  }
  assert.equal(await act('review', fourth), false)
  activity.read = async () => {
    item.runningThreads = [run('quote-E')]
    activity.emit('change')
  }
  assert.equal(await act('review', fourth), false)
  const previous = view.state.runs[0].id
  activity.read = async () => {
    item.runningThreads = [run('quote-F')]
    activity.emit('change')
  }
  assert.equal(await act('running', previous), true)
  assert.equal(view.state.expanded, true)
  assert.equal(view.mainShows, 3)
  const replacement = view.state.runs[0].id
  activity.read = async () => {
    activity.scopeKey = 'other-account'
    activity.emit('change')
  }
  assert.equal(await act('running', replacement), false)
  assert.equal(view.mainShows, 3)
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
