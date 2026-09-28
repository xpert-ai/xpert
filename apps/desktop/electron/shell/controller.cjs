const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { randomUUID, createHash } = require('node:crypto')
const { fork } = require('node:child_process')
const { parseSettings, isId, parsePreparation, parsePolicy } = require('@xpert-ai/desktop-protocol')

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
    this.preparations = new Map()
    this.prepareQueue = Promise.resolve()
    this.policies = {}
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    const file = path.join(directory, 'settings.json')
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'))
      this.settings = parseSettings(saved.settings)
      for (const [key, policy] of Object.entries(saved.policies || {})) {
        if (/^[a-f0-9]{64}$/.test(key) && ['ask', 'allow', 'deny'].includes(policy)) this.policies[key] = policy
      }
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
      policy: this.policy(),
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
      JSON.stringify({ installationId: this.installationId, settings: this.settings, policies: this.policies }),
      { mode: 0o600 }
    )
  }
  scopeKey() {
    const profile = this.service.profile
    if (!profile?.user?.id || !profile.user.tenantId || !profile.organizationId) throw new Error('SESSION_CHANGED')
    return createHash('sha256')
      .update(
        JSON.stringify([
          this.service.config.apiUrl,
          profile.user.tenantId,
          profile.user.id,
          profile.organizationId,
          this.installationId
        ])
      )
      .digest('hex')
  }
  policy() {
    try {
      return this.policies[this.scopeKey()] || 'ask'
    } catch {
      return 'ask'
    }
  }
  async setPolicy(value) {
    const policy = parsePolicy(value)
    this.policies[this.scopeKey()] = policy
    this.persist()
    if (policy === 'deny') await this.disable()
    return this.snapshot()
  }
  async configureSettings(value) {
    const settings = parseSettings(value)
    if (!fs.statSync(settings.cwd).isDirectory()) throw new Error('INVALID_SETTINGS')
    await this.disable()
    this.settings = settings
    this.persist()
    return this.snapshot()
  }
  prepare(raw) {
    const input = parsePreparation(raw)
    const scope = this.scopeKey()
    const task = this.prepareQueue.then(() => {
      if (scope !== this.scopeKey()) throw new Error('SESSION_CHANGED')
      return this.prepareOperation(input)
    })
    this.prepareQueue = task.catch(() => undefined)
    return task
  }
  async prepareOperation(input) {
    if (this.policy() === 'deny') throw new Error('SHELL_DENIED')
    const scope = this.scopeKey()
    if (!this.deviceId) await this.enable(this.settings)
    const generation = this.generation
    const deadline = Date.now() + 10000
    while (!this.connected && this.child && Date.now() < deadline && generation === this.generation)
      await new Promise((resolve) => setTimeout(resolve, 100))
    if (generation !== this.generation || scope !== this.scopeKey()) throw new Error('SESSION_CHANGED')
    if (!this.connected) throw new Error('DEVICE_OFFLINE')
    const key = JSON.stringify([scope, input.runId, input.toolCallId])
    const cwd = input.cwd || this.settings.cwd
    const argsHash = createHash('sha256')
      .update(JSON.stringify([input.command, cwd, input.timeoutSec]))
      .digest('hex')
    const existing = this.preparations.get(key)
    if (existing) {
      if (existing.argsHash !== argsHash || existing.result.expiresAt <= Date.now())
        throw new Error('OPERATION_CONFLICT')
      if (existing.decision === 'reject') throw new Error('SHELL_DENIED')
      return existing.result
    }
    const result = await this.service.request(`/api/desktop-shell/devices/${this.deviceId}/prepare`, {
      method: 'POST',
      body: { ...input, cwd }
    })
    if (generation !== this.generation || scope !== this.scopeKey()) throw new Error('SESSION_CHANGED')
    if (
      result.kind !== 'desktop-shell' ||
      !isId(result.grantId) ||
      !Number.isFinite(result.expiresAt) ||
      result.cwd !== cwd ||
      result.decision !== 'pending'
    )
      throw new Error('INVALID_MESSAGE')
    const entry = { result, argsHash, scope, input }
    this.preparations.set(key, entry)
    if (this.policy() === 'allow') await this.decide({ id: result.grantId, decision: 'approve' })
    return result
  }
  async decide(input) {
    if (!input || !isId(input.id) || !['approve', 'reject'].includes(input.decision)) throw new Error('INVALID_MESSAGE')
    const entry = [...this.preparations.values()].find((item) => item.result.grantId === input.id)
    // Rejecting a stale request is always safe; never recreate a local execution permit.
    if (input.decision === 'reject') {
      this.grants.delete(input.id)
      if (this.child?.connected) await this.syncGrants()
      if (entry) entry.decision = 'reject'
      await this.service
        .request(`/api/desktop-shell/grants/${input.id}/revoke`, { method: 'POST' })
        .catch(() => undefined)
      return { accepted: true }
    }
    const generation = this.generation
    if (!entry || entry.scope !== this.scopeKey() || entry.result.expiresAt <= Date.now() || this.policy() === 'deny')
      throw new Error('GRANT_REVOKED')
    if (entry.decision && entry.decision !== input.decision) throw new Error('OPERATION_CONFLICT')
    await this.service.request(`/api/desktop-shell/grants/${input.id}/decision`, {
      method: 'POST',
      body: { decision: input.decision }
    })
    if (generation !== this.generation || entry.scope !== this.scopeKey() || !this.child?.connected)
      throw new Error('SESSION_CHANGED')
    entry.decision = input.decision
    if (input.decision === 'approve') {
      this.grants.set(input.id, { id: input.id, expiresAt: entry.result.expiresAt, argsHash: entry.argsHash })
    } else this.grants.delete(input.id)
    await this.syncGrants()
    if (generation !== this.generation || entry.scope !== this.scopeKey()) throw new Error('SESSION_CHANGED')
    if (input.decision === 'approve') entry.result.decision = 'approved'
    return { accepted: true }
  }
  async syncGrants() {
    const child = this.child
    if (!child?.connected) throw new Error('DEVICE_OFFLINE')
    const requestId = randomUUID()
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        child.off('message', onMessage)
        child.off('exit', onExit)
      }
      const onMessage = (message) => {
        if (message.type !== 'grants-applied' || message.requestId !== requestId) return
        cleanup()
        if (this.child !== child) reject(new Error('SESSION_CHANGED'))
        else resolve()
      }
      const onExit = () => {
        cleanup()
        reject(new Error('DEVICE_OFFLINE'))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(new Error('DEVICE_OFFLINE'))
      }, 5000)
      child.on('message', onMessage)
      child.once('exit', onExit)
      child.send({ type: 'grants', requestId, grants: [...this.grants.values()] }, (error) => {
        if (error) {
          cleanup()
          reject(error)
        }
      })
    })
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
    this.preparations.clear()
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
