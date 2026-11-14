const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { translate } = require('../i18n/index.mjs')
const { account, DockSeats, dockBounds, dockOffset, hitsDockHandle, preferences } = require('./model.cjs')
const { displayPanels } = require('../overlay-displays.cjs')
const url = pathToFileURL(path.join(__dirname, 'dock.html')).href

function installAgentDock({ BrowserWindow, ipcMain, screen, service, trusted, getWindow, showWindow }) {
  const activity = service.assistantActivity
  let model = new DockSeats(),
    scope,
    generation,
    groups = [],
    groupRevision = 0
  let main,
    mainBinding,
    pending,
    sleeping = false,
    disposed = false
  const config = () => preferences(service.config.agentDock)
  const on = () =>
    !disposed &&
    !sleeping &&
    scope &&
    config().enabled &&
    !service.needsLanguageSelection &&
    !service.needsComputerSetup
  function targets() {
    if (!on()) return []
    const c = config()
    const parent = getWindow()
    if (c.placement === 'window' && (!parent?.isVisible() || parent.isMinimized())) return []
    const all = screen.getAllDisplays()
    if (c.placement === 'screen' && c.display === 'all') return all
    const follow =
      parent && !parent.isDestroyed() ? screen.getDisplayMatching(parent.getBounds()) : screen.getPrimaryDisplay()
    if (c.placement === 'window' || c.display === 'window') return [follow]
    return [
      c.display === 'primary' ? screen.getPrimaryDisplay() : (all.find((d) => String(d.id) === c.display) ?? follow)
    ]
  }
  const panels = displayPanels({ ipcMain, page: url, channel: 'dock:action', targets, create: createPanel })
  let previousActivities = new Map(),
    completion,
    completionTimer
  function sync() {
    if (disposed) return
    syncScope()
    if (!on() || !config().results) clearCompletion()
    if (scope) model.refresh(service, groups)
    panels.sync()
  }
  function clearCompletion() {
    clearTimeout(completionTimer)
    completion = undefined
  }
  async function loadResult(item, notice) {
    if (!item.latestConversationId || !item.latestConversationThreadId) return
    try {
      const page = await service.request(
        '/api/ai/conversations/' + encodeURIComponent(item.latestConversationId) + '/messages/search',
        {
          method: 'POST',
          scope: 'organization',
          body: {
            where: { threadId: item.latestConversationThreadId, role: 'ai' },
            order: { createdAt: 'DESC' },
            limit: 1
          }
        }
      )
      if (
        disposed ||
        completion !== notice ||
        scope !== account(service) ||
        generation !== service.generation ||
        !config().results
      )
        return
      const message = page?.items?.[0]
      if (message?.role !== 'ai') return
      const content = message.content
      const text =
        typeof content === 'string'
          ? content
          : Array.isArray(content)
            ? content
                .filter((block) => block?.type === 'text' && typeof block.text === 'string')
                .map((block) => block.text)
                .join(' ')
            : ''
      if (text.trim()) {
        notice.title = text.trim().slice(0, 240)
        panels.sync()
      }
    } catch {
      /* The conversation title stays available if its message cannot be read. */
    }
  }
  function shortcutsChanged() {
    const contents = getWindow()?.webContents
    if (contents && !contents.isDestroyed()) contents.send('dock:choices-changed')
  }
  function activityChanged() {
    syncScope()
    const seatedIds = new Set(
      model.entries(false).flatMap((entry) => {
        const seat = model.choices.get(entry.token)
        return seat?.kind === 'assistant' ? [service.bots.find((b) => b.id === seat.id)?.assistantId || seat.id] : []
      })
    )
    const items = scope && activity.scope() === activity.scopeKey ? activity.items : []
    for (const item of items) {
      const last = previousActivities.get(item.xpertId)
      const thread = item.latestConversationThreadId
      const justFinished = last?.latestConversationStatus === 'busy' && last.latestConversationThreadId === thread
      const freshAnswer =
        last &&
        item.latestUnreadThreadId === thread &&
        item.latestUnreadAt &&
        item.latestUnreadAt !== last.latestUnreadAt
      if (
        on() &&
        config().results &&
        seatedIds.has(item.xpertId) &&
        thread &&
        item.latestConversationStatus === 'idle' &&
        (justFinished || freshAnswer)
      ) {
        clearCompletion()
        completion = { id: item.xpertId, thread, title: item.latestConversationTitle }
        void loadResult(item, completion)
        completionTimer = setTimeout(() => {
          clearCompletion()
          sync()
        }, 5500)
        completionTimer.unref?.()
      }
    }
    previousActivities = new Map(items.map((item) => [item.xpertId, item]))
    sync()
  }
  function syncScope() {
    const next = account(service)
    if (next === scope && generation === service.generation) return
    scope = next
    generation = service.generation
    groups = []
    groupRevision++
    panels.each((p) => p.reset())
    previousActivities.clear()
    clearCompletion()
    model = new DockSeats()
    pending = null
  }
  function createPanel(display) {
    let panel,
      loaded = false,
      managing = false,
      revealed = false,
      leaveAt = 0,
      folding = false,
      foldTimer,
      pointerTimer
    let area,
      lastSnapshot,
      drag,
      seatCount = 0,
      presentation
    const inside = (p, b) => p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
    function reset() {
      cancelDrag()
      stopTimers()
      managing = revealed = false
      lastSnapshot = null
    }
    function cancelDrag() {
      if (!drag) return
      drag = null
      if (loaded && panel && !panel.isDestroyed()) panel.webContents.send('dock:cancel-drag')
    }
    function create() {
      const win = new BrowserWindow({
        ...dockBounds(area, config().edge, 0, false, false),
        title: 'Bosi Agent Dock',
        type: 'panel',
        show: false,
        focusable: false,
        acceptFirstMouse: true,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        roundedCorners: false,
        enableLargerThanScreen: true,
        webPreferences: {
          preload: path.join(__dirname, 'preload.cjs'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          partition: 'bosi-agent-dock'
        }
      })
      panel = win
      loaded = false

      win.setHiddenInMissionControl(true)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (e) => e.preventDefault())
      win.once('closed', () => {
        if (panel === win) {
          panel = null
          loaded = false
          lastSnapshot = null
          stopTimers()
        }
      })
      win.loadURL(url).catch(() => {
        if (!win.isDestroyed()) win.destroy()
      })
    }
    function stopTimers() {
      drag = null
      clearInterval(pointerTimer)
      clearTimeout(foldTimer)
      pointerTimer = null
      folding = false
      leaveAt = 0
    }
    function resetPointer() {
      clearTimeout(foldTimer)
      folding = false
      revealed = true
      leaveAt = 0
    }
    function position() {
      const c = config()
      const { edge, autoHide } = c
      const scale = zoom()
      const result = completedSeat()
      const open = c.placement === 'window' || !autoHide || revealed || managing || Boolean(drag) || Boolean(result)
      const offset = drag?.offset ?? service.dockOffsets[display] ?? 0.5
      const target = dockBounds(
        area,
        edge,
        seatCount,
        open || folding,
        managing,
        offset,
        scale,
        Boolean(result) && !managing
      )
      if (panel.webContents.getZoomFactor() !== scale) panel.webContents.setZoomFactor(scale)
      const current = panel.getBounds()
      if (Object.keys(target).some((k) => target[k] !== current[k])) panel.setBounds(target)
      panel.webContents.send('dock:position', {
        edge,
        open,
        managing,
        offset,
        strip: c.strip,
        question: model.entries(false).some((e) => e.question),
        completed: result && !managing ? result : null
      })
    }
    function zoom() {
      return config().placement === 'window' ? (getWindow()?.webContents.getZoomFactor() ?? 1) : config().size / 100
    }
    function completedSeat() {
      if (!completion || !config().results) return null
      const seat = model.entries(false).find((entry) => {
        const choice = model.choices.get(entry.token)
        return (
          choice?.kind === 'assistant' &&
          (service.bots.find((b) => b.id === choice.id)?.assistantId || choice.id) === completion.id
        )
      })
      return seat
        ? {
            token: seat.token,
            name: seat.name,
            title: completion.title || translate(service.config.locale, 'Work completed')
          }
        : null
    }
    function saveOffset(offset) {
      const previous = service.dockOffsets
      if (offset === (previous[display] ?? 0.5)) return
      service.dockOffsets = { ...previous, [display]: offset }
      try {
        service.persist()
      } catch (error) {
        service.dockOffsets = previous
        throw error
      }
    }
    function moveHandle(phase, pointerY) {
      if (!Number.isFinite(pointerY)) return false
      const box = panel.getBounds()
      if (phase === 'start' && !drag) {
        resetPointer()
        drag = { edge: config().edge, pointerY, windowY: box.y, offset: service.dockOffsets[display] ?? 0.5 }
        panel.setIgnoreMouseEvents(false)
        lastIgnored = false
        return true
      }
      if (!drag) return false
      if (phase === 'cancel') {
        drag = null
      } else if (phase === 'move' || phase === 'end') {
        if (pointerY !== drag.pointerY || box.y !== drag.windowY)
          drag.offset = dockOffset(area, box.height, drag.windowY + pointerY - drag.pointerY)
        if (phase === 'end') {
          const { offset } = drag
          drag = null
          saveOffset(offset)
        }
      } else return false
      position()
      return true
    }
    function checkPointer() {
      if (drag || !on() || !loaded || !panel?.isVisible()) return
      const point = screen.getCursorScreenPoint()
      const box = panel.getBounds()
      // The transparent shoulders and the thin, hidden strip must leave other apps usable.
      const inBox = inside(point, box)
      const scale = zoom()
      const edgeDistance = (config().edge === 'left' ? point.x - area.x : area.x + area.width - 1 - point.x) / scale
      const near = edgeDistance >= 0 && edgeDistance <= 14 && point.y >= box.y + 12 && point.y < box.y + box.height - 12
      const railBottom = box.y + box.height - 46 * scale
      const onRail = point.y >= box.y + 46 * scale && point.y < railBottom && edgeDistance < 66
      const outsideRail =
        !managing && !completedSeat() && !onRail && !hitsDockHandle(edgeDistance, (point.y - railBottom) / scale)
      const ignore =
        (inBox && outsideRail) ||
        (!revealed && config().autoHide && config().placement === 'screen' && !completedSeat() && !managing)
      if (lastIgnored !== ignore) {
        panel.setIgnoreMouseEvents(ignore, { forward: true })
        lastIgnored = ignore
      }
      if (managing || config().placement === 'window' || !config().autoHide) return
      if (near || (revealed && inBox)) {
        leaveAt = 0
        if (!revealed) {
          resetPointer()
          position()
        }
      } else if (revealed) {
        if (!leaveAt) leaveAt = Date.now()
        if (Date.now() - leaveAt >= 360) {
          revealed = false
          folding = true
          position()
          foldTimer = setTimeout(() => {
            folding = false
            if (on() && loaded) position()
          }, 320)
        }
      }
    }
    let lastIgnored
    function render(d) {
      const c = config(),
        inWindow = c.placement === 'window'
      area = inWindow ? getWindow().getContentBounds() : d.workArea
      if (drag && drag.edge !== c.edge) cancelDrag()
      if (!panel || panel.isDestroyed()) {
        lastIgnored = undefined
        create()
        presentation = null
        return
      }
      if (!loaded) return
      if (presentation !== c.placement) {
        panel.setParentWindow(inWindow ? getWindow() : null)
        panel.setAlwaysOnTop(!inWindow, 'floating')
        panel.setVisibleOnAllWorkspaces(!inWindow, { visibleOnFullScreen: !inWindow, skipTransformProcessType: true })
        presentation = c.placement
      }
      const t = (key) => translate(service.config.locale, key)
      const entries = model.entries(managing)
      if (!managing) seatCount = entries.length
      // Avatar data can be large. Publish only after the public roster or presentation changes.
      const snapshot = {
        entries,
        managing,
        locale: service.config.locale,
        theme: service.config.theme,
        labels: {
          manage: t('Choose Dock shortcuts'),
          move: t('Move Agent Dock'),
          done: t('Done'),
          assistant: t('Assistants'),
          group: t('Group chats')
        }
      }
      // A stored avatar may be several megabytes. Compare references without serializing image bytes on each poll.
      const unchanged =
        lastSnapshot &&
        lastSnapshot.locale === snapshot.locale &&
        lastSnapshot.theme === snapshot.theme &&
        lastSnapshot.managing === managing &&
        lastSnapshot.entries.length === entries.length &&
        entries.every((entry, index) =>
          Object.keys(entry).every((key) => entry[key] === lastSnapshot.entries[index][key])
        )
      if (!unchanged) {
        lastSnapshot = snapshot
        panel.webContents.send('dock:state', snapshot)
      }
      position()
      if (!panel.isVisible()) panel.showInactive()
      if (!pointerTimer) {
        pointerTimer = setInterval(checkPointer, 80)
        pointerTimer.unref?.()
      }
      checkPointer()
    }
    async function action(e, action, token, pointerY) {
      if (action === 'ready') {
        loaded = true
        lastSnapshot = null
        sync()
        return true
      }
      if (!on() || scope !== account(service) || generation !== service.generation || !panel.isVisible()) return false
      if (action === 'drag' || action === 'nudge') {
        if (managing || (config().placement === 'screen' && config().autoHide && !revealed && !completedSeat()))
          return false
        if (action === 'drag') return moveHandle(token, pointerY)
        if (drag || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(token)) return false
        const { y, height } = panel.getBounds()
        const targetY = { ArrowUp: y - 16, ArrowDown: y + 16, Home: area.y, End: area.y + area.height }[token]
        saveOffset(dockOffset(area, height, targetY))
        position()
        return true
      }
      if (action === 'manage') {
        managing = !managing
        resetPointer()
        sync()
        if (managing) void refreshGroups()
        return true
      }
      if (action === 'toggle' && managing && model.toggle(service, scope, token)) {
        shortcutsChanged()
        sync()
        return true
      }
      if (!['open', 'open-result'].includes(action) || managing || !model.entries(false).some((x) => x.token === token))
        return false
      const item = model.choices.get(token)
      const resultThread = action === 'open-result' && completedSeat()?.token === token ? completion?.thread : null
      if (action === 'open-result' && !resultThread) return false
      const binding = scope,
        version = generation
      if (item.kind === 'group' && !(await refreshGroups())) return false
      if (!on() || account(service) !== binding || service.generation !== version || !model.choices.has(token))
        return false
      const activityItem = activity.items.find(
        (x) => x.xpertId === (service.bots.find((b) => b.id === item.id)?.assistantId || item.id)
      )
      const target =
        item.kind === 'group'
          ? { kind: 'group', id: item.id }
          : {
              kind: 'assistant',
              id: item.id,
              threadId: resultThread || activityItem?.latestConversationThreadId || null
            }
      pending = { scope: binding, generation: version, token, target }
      showWindow()
      deliver()
      return true
    }
    return {
      sync: render,
      action,
      reset,
      owns: (sender) => panel?.webContents === sender,
      dispose() {
        reset()
        panel?.destroy()
      }
    }
  }
  function deliver() {
    if (!main || main.isDestroyed() || main !== getWindow()?.webContents || mainBinding !== scope || !pending) return
    if (
      pending.scope === account(service) &&
      pending.generation === service.generation &&
      model.choices.has(pending.token)
    ) {
      main.send('dock:navigate', pending.target)
    }
    pending = null
  }
  function mainReady(event, binding) {
    if (trusted(event) && binding === account(service)) {
      main = event.sender
      mainBinding = binding
      deliver()
    }
  }
  ipcMain.on('dock:main-ready', mainReady)
  function refreshGroups() {
    const binding = scope,
      current = ++groupRevision
    return service
      .listGroups()
      .then((items) => {
        if (disposed || account(service) !== binding || current !== groupRevision || !Array.isArray(items)) return false
        groups = items
        sync()
        return true
      })
      .catch(() => false)
  }
  const screenEvents = ['display-added', 'display-removed', 'display-metrics-changed']
  for (const event of screenEvents) screen.on(event, sync)
  activity.on('change', activityChanged)
  return {
    sync,
    groupsRead(items, binding, version) {
      if (binding !== account(service) || version !== service.generation || !Array.isArray(items)) return
      syncScope()
      groupRevision++
      groups = items
      sync()
    },
    reposition: panels.sync,
    invalidate() {
      groupRevision++
      model = new DockSeats()
      groups = []
      pending = undefined
      panels.each((p) => p.reset())
    },
    choices() {
      sync()
      return { scope, entries: scope ? model.entries(true).filter((e) => e.kind === 'assistant') : [] }
    },
    setChoice(binding, token, selected) {
      sync()
      const seat = model.entries(true).find((e) => e.token === token && e.kind === 'assistant')
      if (!seat || !scope || scope !== binding || typeof selected !== 'boolean') throw new Error('Shortcut unavailable')
      if (seat.selected !== selected && !model.toggle(service, scope, token)) throw new Error('Shortcut unavailable')
      sync()
      return this.choices()
    },
    mainGone() {
      main = null
      panels.sync()
    },
    sleep(value) {
      sleeping = value
      sync()
    },
    dispose() {
      disposed = true
      clearCompletion()
      panels.dispose()
      ipcMain.off('dock:main-ready', mainReady)
      activity.off('change', activityChanged)
      for (const event of screenEvents) screen.off(event, sync)
    }
  }
}
module.exports = { installAgentDock }
