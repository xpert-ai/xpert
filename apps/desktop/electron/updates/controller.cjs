// Invariants: checks never download; installation requires a downloaded update and
// an explicit renderer action. State outlives window recreation and account changes.
const { EventEmitter } = require('node:events')

class DesktopUpdater extends EventEmitter {
  constructor({ updater, enabled, currentVersion, resolveFeed, beforeInstall = async () => {} }) {
    super()
    this.updater = updater
    this.resolveFeed = resolveFeed
    this.beforeInstall = beforeInstall
    this.state = {
      status: enabled ? 'idle' : 'disabled',
      currentVersion,
      version: null,
      percent: 0,
      operation: null,
      revision: 0
    }
    this.listeners = []
    if (!enabled) return
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.autoRunAppAfterInstall = true
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    // Release receipts ship full installers; no unverified/missing blockmap fallback.
    updater.disableDifferentialDownload = true
    const on = (name, listener) => {
      updater.on(name, listener)
      this.listeners.push([name, listener])
    }
    on('update-available', (info) =>
      this.set({ status: 'available', version: info.version, percent: 0, operation: null })
    )
    on('update-not-available', () => this.set({ status: 'idle', version: null, percent: 0, operation: null }))
    on('download-progress', (progress) => {
      if (this.state.status === 'downloading' && Number.isFinite(progress.percent))
        this.set({ percent: Math.max(0, Math.min(100, progress.percent)) })
    })
    on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version, percent: 100, operation: null })
    )
    on('error', () => {
      const operation = {
        idle: 'check',
        checking: 'check',
        available: 'download',
        downloading: 'download',
        downloaded: 'install',
        installing: 'install'
      }[this.state.status]
      this.fail(operation || this.state.operation || 'check')
    })
  }
  snapshot() {
    return { ...this.state }
  }
  set(patch) {
    this.state = { ...this.state, ...patch, revision: this.state.revision + 1 }
    this.emit('state', this.snapshot())
  }
  fail(operation) {
    this.set({ status: 'error', operation })
  }
  async check() {
    if (
      !['idle', 'error'].includes(this.state.status) ||
      (this.state.status === 'error' && this.state.operation !== 'check')
    )
      return this.snapshot()
    this.set({ status: 'checking', version: null, operation: null })
    try {
      const feed = await this.resolveFeed()
      if (!feed) this.set({ status: 'idle' })
      else {
        this.updater.setFeedURL(feed)
        // Setting a channel may opt into downgrades in updater versions; keep it off.
        this.updater.allowDowngrade = false
        await this.updater.checkForUpdates()
      }
    } catch {
      this.fail('check')
    }
    return this.snapshot()
  }
  async download() {
    if (this.state.status !== 'available' && !(this.state.status === 'error' && this.state.operation === 'download'))
      return this.snapshot()
    this.set({ status: 'downloading', percent: 0, operation: null })
    try {
      await this.updater.downloadUpdate()
    } catch {
      this.fail('download')
    }
    return this.snapshot()
  }
  async install() {
    if (this.state.status !== 'downloaded' && !(this.state.status === 'error' && this.state.operation === 'install'))
      return this.snapshot()
    this.set({ status: 'installing', operation: null })
    try {
      await this.beforeInstall()
      this.updater.quitAndInstall(false, true)
    } catch {
      this.fail('install')
    }
    return this.snapshot()
  }
  start() {
    if (this.state.status === 'disabled' || this.interval) return
    this.initial = setTimeout(() => void this.check(), 15_000)
    this.interval = setInterval(() => void this.check(), 6 * 60 * 60 * 1000)
    this.initial.unref?.()
    this.interval.unref?.()
  }
  dispose() {
    clearTimeout(this.initial)
    clearInterval(this.interval)
    for (const [name, listener] of this.listeners) this.updater.removeListener(name, listener)
    this.removeAllListeners()
  }
}
function registerUpdateIpc(ipcMain, controller, isTrusted) {
  ipcMain.handle('xpert:update', (event, action) => {
    if (!isTrusted(event)) throw new Error('Request origin is not allowed.')
    if (action === 'state') return controller.snapshot()
    if (action === 'check') return controller.check()
    if (action === 'download') return controller.download()
    if (action === 'install') return controller.install()
    throw new Error('Unsupported operation.')
  })
}
module.exports = { DesktopUpdater, registerUpdateIpc }
