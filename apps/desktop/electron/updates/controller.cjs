// Invariants: checks never download; installation requires a downloaded update and
// an explicit user action. State outlives window recreation and account changes.
const { EventEmitter } = require('node:events')
const { checkReleaseSources } = require('./release.cjs')

// Bosi release feeds describe a single, byte-identical installer on both hosts.
function sameInstaller(original, alternate) {
  const file = original.files?.[0]
  const copy = alternate?.files?.[0]
  return (
    original.version === alternate?.version &&
    original.files?.length === 1 &&
    alternate.files?.length === 1 &&
    typeof file?.url === 'string' &&
    Number.isSafeInteger(file.size) &&
    file.size > 0 &&
    Boolean(file.sha512) &&
    file.sha512 === copy?.sha512 &&
    file.url === copy.url &&
    file.size === copy.size
  )
}

class DesktopUpdater extends EventEmitter {
  constructor({ updater, enabled, currentVersion, getSources, beforeInstall = async () => {} }) {
    super()
    this.updater = updater
    this.getSources = getSources
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
    on('download-progress', (progress) => {
      if (this.state.status === 'downloading' && Number.isFinite(progress.percent))
        this.set({ percent: Math.max(0, Math.min(100, progress.percent)) })
    })
    on('update-downloaded', (info) =>
      this.set({ status: 'downloaded', version: info.version, percent: 100, operation: null })
    )
    on('error', () => {
      // The awaited operation handles rejection after trying its other source.
      if (this.state.status === 'checking' || this.state.status === 'downloading') return
      const operation = {
        idle: 'check',
        available: 'download',
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
  async check({ manual = false } = {}) {
    if (this.checkPromise) {
      if (manual) this.manualCheck = true
      return this.checkPromise
    }
    if (
      !['idle', 'error'].includes(this.state.status) ||
      (this.state.status === 'error' && this.state.operation !== 'check')
    )
      return this.snapshot()
    this.manualCheck = manual
    this.set({ status: 'checking', version: null, operation: null })
    this.checkPromise = this.checkSources()
    try {
      return await this.checkPromise
    } finally {
      this.checkPromise = null
    }
  }
  checkFeed(feed) {
    this.updater.setFeedURL(feed)
    this.updater.allowDowngrade = false
    return this.updater.checkForUpdates()
  }
  async checkSources() {
    try {
      this.release = await checkReleaseSources(await this.getSources(), {
        checkFeed: (feed) => this.checkFeed(feed),
        isManual: () => this.manualCheck,
        currentVersion: this.state.currentVersion
      })
      this.activeFeed = this.release?.feed
      if (this.release) this.set({ status: 'available', version: this.release.info.version })
      else this.set({ status: 'idle' })
    } catch {
      this.fail('check')
    }
    return this.snapshot()
  }
  async download() {
    if (this.state.status !== 'available' && !(this.state.status === 'error' && this.state.operation === 'download'))
      return this.snapshot()
    this.set({ status: 'downloading', percent: 0, operation: null })
    const { info, feed, alternate } = this.release
    for (const candidate of [feed, alternate].filter(Boolean)) {
      try {
        if (candidate !== this.activeFeed) {
          this.activeFeed = null
          const result = await this.checkFeed(candidate)
          if (!result?.isUpdateAvailable || !sameInstaller(info, result.updateInfo))
            throw new Error('Download source does not match the selected installer')
          this.activeFeed = candidate
        }
        await this.updater.downloadUpdate()
        return this.snapshot()
      } catch {
        if (candidate === feed && alternate) this.set({ percent: 0 })
      }
    }
    this.fail('download')
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
    if (action === 'check') return controller.check({ manual: true })
    if (action === 'download') return controller.download()
    if (action === 'install') return controller.install()
    throw new Error('Unsupported operation.')
  })
}
module.exports = { DesktopUpdater, registerUpdateIpc }
