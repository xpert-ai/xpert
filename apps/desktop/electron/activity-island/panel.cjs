const { randomUUID } = require('node:crypto')
const path = require('node:path')
const { isDeepStrictEqual } = require('node:util')
const { avatarGlyph } = require('../avatar-url.cjs')
const { pathToFileURL } = require('node:url')
const { translate } = require('../i18n/index.mjs')

const page = pathToFileURL(path.join(__dirname, 'island.html')).href
const { islandPreferences } = require('../overlay-preferences.cjs')
const { displayPanels } = require('../overlay-displays.cjs')
const taskRowHeight = 32
const detailBottomPadding = 8
const visibleTaskLimit = 3
// Three blur radii leave room for the CSS drop shadow inside the transparent window.
const shadowMargin = 30
function panelLayout(primary, displays, cutouts, count, active = false, prefs = islandPreferences(), pending = count) {
  const display = [primary, ...displays].find((d) => cutouts.some((c) => c.id === d.id)) ?? primary
  const cutout = cutouts.find((c) => c.id === display.id)
  const gap = Math.ceil(cutout?.width ?? 0)
  const barHeight = Math.max(Math.round((32 * prefs.height) / 100), Math.ceil(cutout?.height ?? 0))
  const wings = cutout ? (active && pending ? 220 : pending ? 184 : 168) : active && pending ? 280 : 212
  // Keep room for both Stop and the pending count in the same wing at minimum width.
  const minimumWings = active && pending ? 200 : pending ? 160 : active ? 140 : 0
  const compactWidth = Math.min(
    display.bounds.width,
    gap + Math.max(minimumWings, Math.round((wings * prefs.width) / 100))
  )
  const hoverWidth = Math.min(display.bounds.width, compactWidth + 32)
  const expandedWidth = Math.min(display.bounds.width, Math.max(420, compactWidth))
  const expandedHeight =
    barHeight + (active ? 54 : 0) + Math.min(count, visibleTaskLimit) * taskRowHeight + detailBottomPadding
  const center = display.bounds.x + (cutout ? cutout.left + gap / 2 : display.bounds.width / 2)
  const top = cutout ? 0 : 6
  // Keep enough transparent space for every visual state, including an interrupted collapse.
  const halfWidth = Math.max(expandedWidth, hoverWidth) / 2 + shadowMargin
  const left = Math.floor(center - halfWidth)
  const width = Math.ceil(center + halfWidth) - left
  const height = top + barHeight + 54 + visibleTaskLimit * taskRowHeight + detailBottomPadding + shadowMargin
  return {
    bounds: { x: left, y: display.bounds.y, width, height },
    gap,
    top,
    barHeight,
    compactWidth,
    hoverWidth,
    expandedWidth,
    expandedHeight
  }
}

function installActivityIsland({ BrowserWindow, ipcMain, screen, service, control, showWindow, trusted }) {
  const activity = service.assistantActivity
  const preferences = () => islandPreferences(service.config.activityIsland)
  let cutouts = [],
    revision = 0,
    detected = false,
    sleeping = false,
    disposed = false,
    readyMain
  function targets() {
    if (!detected) return []
    const all = screen.getAllDisplays()
    if (preferences().external) return all
    return [
      all.find((d) => cutouts.some((c) => c.id === d.id)) ?? all.find((d) => d.internal) ?? screen.getPrimaryDisplay()
    ]
  }
  const panels = displayPanels({ ipcMain, channel: 'island:action', page, targets, create: createPanel })
  async function readDisplays() {
    const current = ++revision
    let result = []
    try {
      result = await control.displayCutouts()
    } catch {
      /* Use a detached capsule when geometry is unavailable. */
    }
    if (disposed || current !== revision) return
    cutouts = result
    detected = true
    panels.sync()
  }
  function mainReady(event) {
    if (!trusted(event)) return
    readyMain = event.sender
    panels.each((p) => p.deliver())
  }
  ipcMain.on('island:main-ready', mainReady)
  const displayEvents = ['display-metrics-changed', 'display-added', 'display-removed']
  for (const event of displayEvents) screen.on(event, readDisplays)
  activity.on('change', panels.sync)
  void readDisplays()
  return {
    sync: panels.sync,
    mainGone() {
      readyMain = undefined
    },
    sleep(value) {
      sleeping = value
      panels.sync()
    },
    dispose() {
      disposed = true
      activity.off('change', panels.sync)
      ipcMain.off('island:main-ready', mainReady)
      for (const event of displayEvents) screen.off(event, readDisplays)
      panels.dispose()
    }
  }
  function createPanel() {
    let display
    let panel,
      loaded = false,
      expanded = false,
      retired = false
    let scope, pendingOpen, layout, targetBounds
    let pointerWatch,
      lastPointer,
      interactive = false
    function setInteractive(inside) {
      if (inside === interactive) return
      interactive = inside
      panel.setIgnoreMouseEvents(!inside, { forward: true })
    }
    // macOS can omit mouse events for inactive panels. Recover missing moves without driving animation frames.
    function checkPointer() {
      if (!panel?.isVisible()) return
      const point = screen.getCursorScreenPoint()
      const b = targetBounds
      const x = point.x - b.x
      const y = point.y - b.y
      const within = x >= 0 && x < b.width && y >= 0 && y < b.height
      if (!within) setInteractive(false)
      if (lastPointer && lastPointer.within === within && (!within || (lastPointer.x === x && lastPointer.y === y)))
        return
      lastPointer = { x, y, within }
      panel.webContents.send('island:pointer', { x, y })
    }
    function stopWatchingPointer() {
      clearInterval(pointerWatch)
      pointerWatch = undefined
      lastPointer = undefined
    }
    let tasks = new Map()
    const pendingOwners = new Map()
    let pendingTotal = 0,
      working
    const t = (key, params) => translate(service.config.locale, key, params)
    function refreshTasks() {
      const current = activity.scope()
      if (current !== scope) {
        scope = current
        tasks.clear()
        pendingOpen = undefined
        expanded = false
      }
      const next = new Map()
      pendingOwners.clear()
      pendingTotal = 0
      working = undefined
      if (current && current === activity.scopeKey) {
        const bots = new Map(
          service.bots.filter((bot) => !bot.assistantId || bot.assistantId === bot.id).map((bot) => [bot.id, bot])
        )
        for (const item of activity.items) {
          const bot = bots.get(item.xpertId)
          if (!bot) continue
          if (item.hasActiveRuns && !working) working = bot.name
          const count = Math.max(item.pendingThreadCount ?? 0, item.pendingThreads?.length ?? 0)
          if (count) pendingOwners.set(bot.id, bot)
          pendingTotal += count
          for (const entry of item.pendingThreads ?? []) {
            const key = JSON.stringify([item.xpertId, entry.threadId, entry.kind])
            next.set(key, {
              id: tasks.get(key)?.id ?? randomUUID(),
              botId: bot.id,
              threadId: entry.threadId,
              rank: entry.rank ?? Number.MAX_SAFE_INTEGER,
              kind: entry.kind,
              bot
            })
          }
        }
      }
      tasks = new Map([...next].sort(([, a], [, b]) => a.rank - b.rank).slice(0, visibleTaskLimit))
    }
    function snapshot() {
      const active = control.active()
      const visible = [...tasks.values()]
      const singleOwner = pendingOwners.size === 1
      const owners = singleOwner ? [...pendingOwners.values()] : [...new Set(visible.map((task) => task.bot))]
      return {
        singleOwner,
        assistants: owners.map((bot) => ({
          name: bot.name,
          glyph: avatarGlyph(bot),
          image: bot.avatarUrl || null
        })),
        active: active
          ? {
              id: active.id,
              name: active.name,
              label: t('{{name}} is controlling {{app}}', active),
              title: active.title
            }
          : null,
        tasks: visible.map((task) => ({
          id: task.id,
          assistant: owners.indexOf(task.bot),
          kind: task.kind,
          label: t(task.kind === 'question' ? 'Answer a question' : 'Review approval')
        })),
        pendingTotal,
        working,
        idle: !active && !pendingTotal && !working,
        greeting: t('Hello!'),
        expanded,
        top: layout.top,
        compactWidth: layout.compactWidth,
        hoverWidth: layout.hoverWidth,
        expandedWidth: layout.expandedWidth,
        expandedHeight: layout.expandedHeight,
        gap: layout.gap,
        barHeight: layout.barHeight,
        taskRowHeight,
        detailBottomPadding,
        locale: service.config.locale,
        labels: {
          stop: t('Stop'),
          stopWindow: t('Stop window control'),
          pending: t('To do'),
          tasks: t('Pending tasks'),
          review: t('Review pending tasks')
        }
      }
    }
    let lastState
    function sync(next = display) {
      display = next
      if (disposed || retired) return
      refreshTasks()
      const prefs = preferences()
      const idle = !control.active() && !pendingTotal && !working
      if (sleeping || !prefs.enabled || (idle && (!prefs.idle || !scope))) {
        expanded = false
        stopWatchingPointer()
        targetBounds = undefined
        lastState = undefined
        if (panel?.isVisible()) {
          setInteractive(false)
          panel.webContents.send('island:hidden')
          panel.hide()
        }
        return
      }
      if (!control.active() && !tasks.size) expanded = false
      layout = panelLayout(display, [display], cutouts, tasks.size, Boolean(control.active()), prefs, pendingTotal)
      const { bounds } = layout
      if (!panel || panel.isDestroyed()) {
        loaded = false
        const win = new BrowserWindow({
          ...bounds,
          title: 'Bosi Activity Island',
          type: 'panel',
          show: false,
          frame: false,
          transparent: true,
          focusable: false,
          acceptFirstMouse: true,
          hasShadow: false,
          resizable: false,
          movable: false,
          minimizable: false,
          maximizable: false,
          fullscreenable: false,
          enableLargerThanScreen: true,
          skipTaskbar: true,
          roundedCorners: false,
          webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false
          }
        })
        panel = win
        targetBounds = bounds
        interactive = false
        win.setIgnoreMouseEvents(true, { forward: true })
        win.setAlwaysOnTop(true, 'pop-up-menu')
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
        win.setHiddenInMissionControl(true)
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.webContents.on('will-navigate', (event) => event.preventDefault())
        win.once('closed', () => {
          if (panel === win) {
            stopWatchingPointer()
            panel = undefined
            loaded = false
          }
        })
        win.loadURL(page).catch(() => {
          if (!win.isDestroyed()) win.destroy()
        })
      } else if (loaded) {
        if (!targetBounds || Object.keys(bounds).some((k) => bounds[k] !== targetBounds[k])) {
          panel.setBounds(bounds)
          targetBounds = bounds
        }
        const value = snapshot()
        if (!isDeepStrictEqual(value, lastState)) {
          // Hovering and pinning update the layout without resending potentially large inline avatars.
          const sameAssistants = isDeepStrictEqual(value.assistants, lastState?.assistants)
          panel.webContents.send('island:state', sameAssistants ? { ...value, assistants: undefined } : value)
          lastState = value
        }
        if (!panel.isVisible()) panel.showInactive()
        if (!pointerWatch) {
          // Inactive panels can miss mouse events when crossing displays or Spaces.
          pointerWatch = setInterval(checkPointer, 80)
          pointerWatch.unref?.()
          checkPointer()
        }
      }
    }
    const findTask = (id) => [...tasks.values()].find((task) => task.id === id)
    function deliver() {
      const task = findTask(pendingOpen)
      if (!task || !readyMain || readyMain.isDestroyed()) return
      pendingOpen = undefined
      readyMain.send('island:open-thread', { botId: task.botId, threadId: task.threadId })
    }
    async function action(event, action, id) {
      if (retired || disposed) return false
      if (action === 'ready') {
        loaded = true
        lastState = undefined
        sync()
        return true
      }
      if (sleeping || !panel.isVisible()) return false
      if (action === 'interactive' && typeof id === 'boolean') {
        setInteractive(id)
        return true
      }
      const feedback = () => {
        if (preferences().haptics) void control.haptic?.().catch(() => {})
      }
      if (action === 'stop') {
        const stopped = control.stopGrant(id)
        if (stopped) feedback()
        return stopped
      }
      if (action === 'expand' && typeof id === 'boolean') {
        if (id && !tasks.size && !control.active()) return false
        if (expanded !== id && id) feedback()
        expanded = id
        sync()
        return true
      }
      if (action !== 'review' || !findTask(id)) return false
      const originalScope = scope
      try {
        await activity.read(true)
      } catch {
        return false
      }
      if (retired || disposed || sleeping || !panel?.isVisible() || scope !== originalScope || !findTask(id))
        return false
      feedback()
      expanded = false
      sync()
      pendingOpen = id
      const main = showWindow()
      if (main.webContents === readyMain) deliver()
      return true
    }
    return {
      sync,
      deliver,
      owns: (sender) => panel?.webContents === sender,
      action,
      dispose() {
        retired = true
        stopWatchingPointer()
        panel?.destroy()
      }
    }
  }
}
module.exports = { installActivityIsland, panelLayout }
