const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const { fork } = require('node:child_process')
const { parseSettings, isId } = require('@xpert-ai/desktop-protocol')

class DesktopShellController {
  constructor(service, directory) {
    this.service = service
    this.directory = directory
    this.child = null
    this.deviceId = null
    this.connected = false
    this.grants = new Map()
    this.generation = 0
    this.errorCode = null
    this.refreshing = null
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const file = path.join(directory, 'settings.json')
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
      this.settings = parseSettings(saved.settings)
      this.installationId = isId(saved.installationId) ? saved.installationId : randomUUID()
    } catch {
      this.installationId = randomUUID()
      this.settings = {
        name: os.hostname(),
        shell: '/bin/zsh',
        cwd: os.homedir(),
        path: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
      }
    }
  }
  snapshot() {
    return {
      available: process.platform === 'darwin',
      enabled: !!this.deviceId,
      connected: this.connected,
      deviceId: this.deviceId,
      settings: this.settings,
      errorCode: this.errorCode
    }
  }
  persist() {
    fs.writeFileSync(
      path.join(this.directory, 'settings.json'),
      JSON.stringify({ installationId: this.installationId, settings: this.settings }),
      { mode: 0o600 }
    )
  }
  async enable(value) {
    if (process.platform !== 'darwin') throw new Error('UNSUPPORTED_PLATFORM')
    const settings = parseSettings(value)
    if (!fs.statSync(settings.cwd).isDirectory()) throw new Error('INVALID_SETTINGS')
    await this.disable()
    const generation = this.generation
    const registration = await this.service.request('/api/desktop-shell/devices', {
      method: 'POST',
      body: { installationId: this.installationId, platform: process.platform, settings }
    })
    if (generation !== this.generation) throw new Error('SESSION_CHANGED')
    if (!isId(registration.deviceId) || typeof registration.token !== 'string') throw new Error('INVALID_MESSAGE')
    this.settings = settings
    this.persist()
    this.deviceId = registration.deviceId
    this.errorCode = null
    const child = fork(path.join(__dirname, 'worker.cjs'), [], {
      execPath: process.execPath,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: { HOME: os.homedir(), TMPDIR: os.tmpdir(), PATH: settings.path, ELECTRON_RUN_AS_NODE: '1' }
    })
    this.child = child
    child.on('message', (message) => {
      if (this.child !== child) return
      if (message.type === 'status') {
        this.connected = message.connected
        this.errorCode = message.errorCode || null
      } else if (message.type === 'refresh')
        void this.refresh().catch(() => {
          this.errorCode = 'DEVICE_OFFLINE'
        })
    })
    child.on('exit', () => {
      if (this.child !== child) return
      this.connected = false
      this.child = null
      this.errorCode = 'WORKER_FAILED'
      void this.disable().catch(() => undefined)
    })
    child.send({
      type: 'start',
      directory: path.join(this.directory, 'operations'),
      settings,
      url: this.service.config.apiUrl,
      token: registration.token
    })
    this.refreshTimer = setInterval(
      () =>
        void this.refresh().catch(() => {
          this.errorCode = 'DEVICE_OFFLINE'
        }),
      30 * 60000
    )
    this.refreshTimer.unref()
    return this.snapshot()
  }
  async refresh() {
    if (this.refreshing || !this.deviceId) return this.refreshing
    const generation = this.generation
    const id = this.deviceId
    this.refreshing = this.service
      .request(`/api/desktop-shell/devices/${id}/refresh`, { method: 'POST' })
      .then((result) => {
        if (this.generation === generation && this.child?.connected)
          this.child.send({ type: 'token', token: result.token })
      })
      .finally(() => {
        this.refreshing = null
      })
    return this.refreshing
  }
  async bind(input) {
    if (!this.deviceId || !this.connected || !this.child?.connected) throw new Error('DEVICE_OFFLINE')
    if (!input || !isId(input.assistantId) || (input.threadId != null && !isId(input.threadId)))
      throw new Error('INVALID_MESSAGE')
    if (!this.service.bots.some((bot) => bot.id === input.assistantId)) throw new Error('GRANT_REVOKED')
    const generation = this.generation
    const grant = await this.service.request(`/api/desktop-shell/devices/${this.deviceId}/grants`, {
      method: 'POST',
      body: input
    })
    if (generation !== this.generation || !this.child?.connected) throw new Error('SESSION_CHANGED')
    if (!isId(grant.id) || !Number.isFinite(grant.expiresAt)) throw new Error('INVALID_MESSAGE')
    this.grants.set(grant.id, grant)
    this.child.send({ type: 'grants', grants: [...this.grants.values()] })
    return grant
  }
  async unbind(id) {
    if (!isId(id)) throw new Error('INVALID_MESSAGE')
    this.grants.delete(id)
    if (this.child?.connected) this.child.send({ type: 'grants', grants: [...this.grants.values()] })
    await this.service.request(`/api/desktop-shell/grants/${id}/revoke`, { method: 'POST' })
    return { revoked: true }
  }
  async operations() {
    if (!this.deviceId) return []
    return this.service.request(`/api/desktop-shell/operations?deviceId=${this.deviceId}`)
  }
  async cancel(id) {
    if (!isId(id)) throw new Error('INVALID_MESSAGE')
    return this.service.request(`/api/desktop-shell/operations/${id}/cancel`, { method: 'POST' })
  }
  async disable() {
    this.generation++
    clearInterval(this.refreshTimer)
    const id = this.deviceId
    this.deviceId = null
    this.connected = false
    this.grants.clear()
    const child = this.child
    this.child = null
    // Start the authenticated revoke before logout clears the account in DesktopService.
    const revoke = id
      ? this.service.request(`/api/desktop-shell/devices/${id}/disable`, { method: 'POST' }).catch(() => undefined)
      : Promise.resolve()
    if (child?.connected) {
      child.send({ type: 'stop' })
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 6000))
      ])
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM')
    }
    await revoke
    return this.snapshot()
  }
}
module.exports = { DesktopShellController }
