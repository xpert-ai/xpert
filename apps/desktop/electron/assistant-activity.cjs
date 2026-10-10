// One account/org-scoped snapshot serves both the sidebar and the Dock, even without a renderer.
const { EventEmitter } = require('node:events')
const REFRESH_INTERVAL = 15000

class AssistantActivity extends EventEmitter {
  constructor(service) {
    super()
    this.service = service
    this.items = []
    this.revision = 0
    this.loadedAt = null
    this.pending = null
    this.timer = null
    this.disposed = false
  }

  scope() {
    const { credentials, profile, config, bots, generation } = this.service
    if (!credentials || !profile?.organizationId || !profile.user?.id) return null
    return JSON.stringify([
      config.apiUrl,
      profile.user.tenantId,
      profile.user.id,
      profile.organizationId,
      generation,
      [...new Set(bots.map((bot) => bot.assistantId || bot.id))].sort()
    ])
  }

  syncScope() {
    const key = this.scope()
    if (key === this.scopeKey) return false
    this.scopeKey = key
    this.revision++
    this.pending = null
    this.loadedAt = null
    this.items = []
    this.emit('change')
    return true
  }

  sync() {
    if (this.disposed) return
    if (this.syncScope() && this.timer) this.refreshInBackground()
  }

  read(force = false) {
    if (this.disposed) return Promise.resolve([])
    this.syncScope()
    if (!this.scopeKey) return Promise.resolve([])
    if (this.pending) return this.pending
    if (!force && this.loadedAt !== null && Date.now() - this.loadedAt < REFRESH_INTERVAL)
      return Promise.resolve(this.items)
    const revision = this.revision
    const request = this.service
      .fetchBotActivity()
      .then((items) => {
        if (revision !== this.revision || this.scope() !== this.scopeKey) return this.read()
        this.items = items
        this.loadedAt = Date.now()
        this.emit('change')
        return items
      })
      .catch((error) => {
        if (revision !== this.revision || this.scope() !== this.scopeKey) return this.read()
        // Keep the last successful snapshot during temporary outages.
        throw error
      })
      .finally(() => {
        if (this.pending === request) this.pending = null
      })
    this.pending = request
    return request
  }

  invalidate() {
    if (this.disposed) return
    // A poll started before a successful read-state write must not restore old counts.
    this.revision++
    this.pending = null
    this.loadedAt = null
    if (this.timer) this.refreshInBackground()
  }

  refreshInBackground(force = false) {
    void this.read(force).catch(() => undefined)
  }

  start() {
    if (this.timer || this.disposed) return
    this.timer = setInterval(() => this.refreshInBackground(true), REFRESH_INTERVAL)
    this.timer.unref?.()
    this.refreshInBackground()
  }

  stop() {
    clearInterval(this.timer)
    this.timer = null
    this.disposed = true
    this.revision++
    this.pending = null
    this.items = []
    this.emit('change')
  }

  get unreadCount() {
    const counts = new Map()
    for (const item of this.items)
      counts.set(item.xpertId, Math.max(counts.get(item.xpertId) || 0, item.unreadMessages))
    return Math.min(
      Number.MAX_SAFE_INTEGER,
      [...counts.values()].reduce((sum, count) => sum + count, 0)
    )
  }
}

function installAssistantActivity({ app, activity, getWindow, platform = process.platform }) {
  let previousCount
  const changed = () => {
    const count = Math.min(2147483647, activity.unreadCount)
    if (platform === 'darwin' && count !== previousCount && app.setBadgeCount(count)) previousCount = count
    const window = getWindow()
    if (window && !window.isDestroyed() && !window.webContents.isDestroyed())
      window.webContents.send('xpert:assistant-activity-changed')
  }
  const dispose = () => {
    activity.stop()
    activity.removeListener('change', changed)
    app.removeListener('will-quit', dispose)
  }
  activity.on('change', changed)
  app.once('will-quit', dispose)
  activity.start()
  return dispose
}

module.exports = { AssistantActivity, installAssistantActivity }
