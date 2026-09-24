// Invariants: persist intent before spawn; uncertain executions never replay. cwd is not a sandbox.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { createHash } = require('node:crypto')
const { StringDecoder } = require('node:string_decoder')
const { VERSION, LIMITS, isFinal, isId, parseCommand } = require('@xpert-ai/desktop-protocol')

function digest(command) {
  return createHash('sha256')
    .update(JSON.stringify([command.command, command.cwd, command.timeoutSec]))
    .digest('hex')
}
class ShellEngine {
  constructor({ directory, settings, report, clock = Date.now }) {
    this.directory = directory
    this.settings = settings
    this.report = report
    this.clock = clock
    this.records = new Map()
    this.grants = new Map()
    this.current = null
    this.epoch = null
    this.leaseUntil = 0
    this.stopped = false
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 })
    for (const name of fs.readdirSync(directory)) {
      if (!name.endsWith('.json') || !isId(name.slice(0, -5))) continue
      const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
      if (record.id !== name.slice(0, -5) || !Array.isArray(record.chunks) || typeof record.deadline !== 'number')
        throw new Error('INVALID_JOURNAL')
      if (!isFinal(record.state)) {
        record.state = 'unknown'
        record.errorCode = 'WORKER_RESTARTED'
        record.seq++
      }
      this.records.set(record.id, record)
      this.save(record)
    }
    this.cleanup()
    this.watchdog = setInterval(() => {
      const active = this.current
      if (active && (this.clock() > this.leaseUntil || !this.authorized(active.record.grantId)))
        this.cancel(active.record.id)
    }, 1000)
    this.watchdog.unref()
  }
  save(record) {
    const target = path.join(this.directory, `${record.id}.json`)
    const temp = `${target}.tmp`
    const fd = fs.openSync(temp, 'w', 0o600)
    try {
      fs.writeFileSync(fd, JSON.stringify(record))
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(temp, target)
    const dir = fs.openSync(this.directory, 'r')
    try {
      fs.fsyncSync(dir)
    } finally {
      fs.closeSync(dir)
    }
  }
  cleanup() {
    for (const [id, record] of this.records) {
      // Expired wire commands are rejected before lookup. Keep results for 24 hours.
      if (isFinal(record.state) && record.deadline + 86400000 < this.clock()) {
        fs.unlinkSync(path.join(this.directory, `${id}.json`))
        this.records.delete(id)
      }
    }
  }
  connect(epoch, leaseUntil) {
    if (!isId(epoch) || !Number.isFinite(leaseUntil)) throw new Error('INVALID_MESSAGE')
    this.epoch = epoch
    this.leaseUntil = Math.min(leaseUntil, this.clock() + LIMITS.lease)
    for (const record of this.records.values()) this.replay(record)
  }
  renew(leaseUntil) {
    this.leaseUntil = Math.min(leaseUntil, this.clock() + LIMITS.lease)
  }
  setGrants(grants) {
    this.grants = new Map(
      grants.filter((g) => isId(g.id) && Number.isFinite(g.expiresAt)).map((g) => [g.id, g.expiresAt])
    )
    if (this.current && !this.authorized(this.current.record.grantId)) this.cancel(this.current.record.id)
  }
  authorized(id) {
    return (this.grants.get(id) || 0) > this.clock()
  }
  emit(record, payload) {
    if (this.epoch) this.report({ version: VERSION, operationId: record.id, connectionEpoch: this.epoch, ...payload })
  }
  state(record) {
    this.emit(record, {
      type: 'state',
      state: record.state,
      seq: record.seq,
      exitCode: record.exitCode,
      truncated: record.truncated,
      ...(record.signal ? { signal: record.signal } : {}),
      ...(record.errorCode ? { errorCode: record.errorCode } : {})
    })
  }
  replay(record, force = false) {
    for (const chunk of record.chunks) {
      if (force || chunk.seq > (record.confirmedSeq ?? -1))
        this.emit(record, { type: 'output', state: 'running', ...chunk })
    }
    if (force || !record.confirmedFinal) this.state(record)
  }
  acknowledge(report) {
    const record = this.records.get(report.operationId)
    if (!record) return
    record.confirmedSeq = Math.max(record.confirmedSeq ?? -1, report.seq)
    if (report.type === 'state' && isFinal(report.state)) {
      record.confirmedFinal = true
      this.save(record)
    }
  }
  accept(raw) {
    const command = parseCommand(raw)
    if (command.connectionEpoch !== this.epoch || this.stopped) throw new Error('STALE_CONNECTION')
    if (command.type === 'cancel') return this.cancel(command.operationId, command.reason)
    if (command.deadline <= this.clock() || command.deadline > this.clock() + (LIMITS.maxTimeout + 30) * 1000)
      throw new Error('EXPIRED_COMMAND')
    const existing = this.records.get(command.operationId)
    if (existing) {
      if (existing.argsHash && existing.argsHash !== command.argsHash) throw new Error('OPERATION_CONFLICT')
      return this.replay(existing)
    }
    if (!this.authorized(command.grantId) || this.leaseUntil <= this.clock()) throw new Error('GRANT_REVOKED')
    if (digest(command) !== command.argsHash) throw new Error('OPERATION_CONFLICT')
    this.cleanup()
    const bytes = [...this.records.values()].reduce((sum, record) => sum + record.bytes, 0)
    if (this.records.size >= LIMITS.records || bytes > 64 * 1024 * 1024) throw new Error('JOURNAL_FULL')
    const record = {
      id: command.operationId,
      grantId: command.grantId,
      argsHash: command.argsHash,
      deadline: command.deadline,
      state: 'pending',
      seq: 0,
      chunks: [],
      bytes: 0,
      truncated: false,
      exitCode: null
    }
    if (this.current) {
      record.state = 'rejected'
      record.errorCode = 'DEVICE_BUSY'
    }
    this.save(record)
    this.records.set(record.id, record)
    if (isFinal(record.state)) return this.state(record)
    let child
    try {
      child = spawn(this.settings.shell, ['-c', command.command], {
        cwd: command.cwd,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          HOME: os.homedir(),
          USER: os.userInfo().username,
          LOGNAME: os.userInfo().username,
          PATH: this.settings.path,
          LANG: 'en_US.UTF-8',
          TMPDIR: os.tmpdir(),
          SHELL: this.settings.shell
        }
      })
    } catch {
      record.state = 'failed'
      record.errorCode = 'SPAWN_FAILED'
      record.seq++
      this.save(record)
      return this.state(record)
    }
    const active = { child, record, reason: null, killTimer: null, timeout: null }
    this.current = active
    record.state = 'running'
    record.pid = child.pid
    record.startedAt = this.clock()
    try {
      this.save(record)
    } catch {
      this.stopForJournalFailure(active)
    }
    this.state(record)
    for (const stream of ['stdout', 'stderr']) {
      const decoder = new StringDecoder('utf8')
      child[stream].on('data', (data) => this.output(active, stream, decoder.write(data)))
      child[stream].on('end', () => this.output(active, stream, decoder.end()))
    }
    child.on('error', () => {
      record.errorCode = 'SPAWN_FAILED'
    })
    child.on('close', (code, signal) => {
      clearTimeout(active.timeout)
      clearTimeout(active.killTimer)
      // Also terminate descendants that outlived their parent shell.
      this.signal(active, 'SIGKILL')
      record.exitCode = code
      record.signal = signal || undefined
      record.state = active.reason || (code === 0 ? 'succeeded' : 'failed')
      record.seq++
      try {
        this.save(record)
      } catch {
        record.state = 'unknown'
        record.errorCode = 'JOURNAL_FAILED'
        this.stopped = true
      }
      if (this.current === active) this.current = null
      this.state(record)
    })
    active.timeout = setTimeout(
      () => this.cancel(record.id, 'timed_out'),
      Math.max(1, Math.min(command.timeoutSec * 1000, command.deadline - this.clock()))
    )
  }
  output(active, stream, data) {
    const record = active.record
    if (!data || this.stopped) return
    // The wire format is text, and PostgreSQL JSONB cannot store NUL characters.
    data = data.replaceAll('\0', '\ufffd')
    for (let offset = 0; offset < data.length; ) {
      let end = Math.min(offset + 4096, data.length)
      // Preserve UTF-16 surrogate pairs when framing decoded UTF-8 output.
      if (end < data.length && data.charCodeAt(end - 1) >= 0xd800 && data.charCodeAt(end - 1) <= 0xdbff) end--
      const part = data.slice(offset, end)
      offset = end
      const bytes = Buffer.byteLength(part)
      if (record.bytes + bytes > LIMITS.output) {
        record.truncated = true
        continue
      }
      const chunk = { seq: ++record.seq, stream, data: part }
      record.bytes += bytes
      record.chunks.push(chunk)
      try {
        this.save(record)
      } catch {
        this.stopForJournalFailure(active)
        return
      }
      this.emit(record, { type: 'output', state: 'running', ...chunk })
    }
  }
  signal(active, signal) {
    if (!active.child.pid) return
    try {
      process.kill(-active.child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') active.record.errorCode = 'CANCEL_FAILED'
    }
  }
  stopForJournalFailure(active) {
    this.stopped = true
    active.reason = 'unknown'
    active.record.errorCode = 'JOURNAL_FAILED'
    this.signal(active, 'SIGKILL')
  }
  cancel(id, reason = 'cancelled') {
    const active = this.current
    if (active?.record.id === id) {
      if (active.reason) return this.state(active.record)
      active.reason = reason
      active.record.state = 'cancel_requested'
      try {
        this.save(active.record)
      } catch {
        this.stopForJournalFailure(active)
      }
      this.state(active.record)
      this.signal(active, 'SIGTERM')
      active.killTimer = setTimeout(() => this.signal(active, 'SIGKILL'), 2000)
    } else if (this.records.has(id)) this.replay(this.records.get(id))
    else {
      // A cancel arriving before exec is a durable tombstone.
      const record = {
        id,
        argsHash: null,
        deadline: this.clock() + LIMITS.maxTimeout * 1000,
        state: reason,
        seq: 0,
        chunks: [],
        bytes: 0,
        truncated: false,
        exitCode: null
      }
      this.save(record)
      this.records.set(id, record)
      this.state(record)
    }
  }
  async close() {
    clearInterval(this.watchdog)
    this.stopped = true
    if (!this.current) return
    const active = this.current
    this.cancel(active.record.id)
    await Promise.race([
      new Promise((resolve) => active.child.once('close', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000))
    ])
    this.signal(active, 'SIGKILL')
  }
}
module.exports = { ShellEngine, digest }
