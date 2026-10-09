// Invariants: only a user-activated start acquires devices; retries only deliver cached audio.
// Scope changes cancel in-flight starts. Device ownership never depends on plugin View lifetime.
const fs = require('node:fs')
const os = require('node:os')
const { spawn } = require('node:child_process')
const { randomUUID } = require('node:crypto')
const {
  parseAudioCapturePayload,
  AUDIO_CAPTURE_TRACKS: tracks,
  AUDIO_CAPTURE_LIMITS
} = require('@xpert-ai/desktop-protocol')
const { AudioCaptureCache } = require('./cache.cjs')
const { CaptureDelivery } = require('./delivery.cjs')
const { parseNativeEvent } = require('./native-events.cjs')
const MAX_DURATION = AUDIO_CAPTURE_LIMITS.durationMs
class AudioCaptureController {
  constructor(service, { root, encryption, helper, onRecording = () => {}, spawnHelper = spawn, supported } = {}) {
    this.delivery = new CaptureDelivery(service)
    this.cache = new AudioCaptureCache(root, encryption)
    this.helper = helper
    this.onRecording = onRecording
    this.spawnHelper = spawnHelper
    this.supported =
      supported ?? (process.platform === 'darwin' && Number(os.release().split('.')[0]) >= 24 && fs.existsSync(helper))
    this.active = null
    this.voiceActive = false
    this.scopeChanging = 0
    this.starting = null
    this.draining = null
    this.epoch = 0
  }
  publicState(record, status) {
    return {
      supported: this.supported,
      status,
      ...(record
        ? {
            captureId: record.id,
            elapsedMs:
              record.durationMs ?? (record.startedAt ? Math.min(MAX_DURATION, Date.now() - record.startedAt) : 0),
            microphone: this.active?.record.id === record.id ? this.active.levels.microphone : 0,
            system: this.active?.record.id === record.id ? this.active.levels.system : 0,
            errorCode: record.deliveryError ?? record.errorCode ?? null,
            pendingCount: tracks.reduce((sum, track) => sum + record.counts[track] - record.uploaded[track], 0)
          }
        : { elapsedMs: 0, microphone: 0, system: 0, pendingCount: 0 })
    }
  }
  async command(input) {
    try {
      const payload = parseAudioCapturePayload(input?.commandKey, input?.payload)
      const scope = this.delivery.scope(input)
      if (this.scopeChanging) throw new Error('scope_changed')
      if (input.commandKey === 'desktop.audio.capture.start') {
        if (input.userActivated !== true) throw new Error('user_activation_required')
        if (!this.supported) throw new Error('unsupported')
        if (this.active || this.starting || this.draining) throw new Error('recording_active')
        if (this.voiceActive) throw new Error('voice_active')
        this.starting = this.start(input, scope, payload.delivery)
        try {
          return { success: true, data: await this.starting }
        } finally {
          this.starting = null
        }
      }
      const active = this.active
      const owned = active && JSON.stringify(active.record.scope) === JSON.stringify(scope)
      if (input.commandKey === 'desktop.audio.capture.stop') {
        if (!owned || active.record.id !== payload.captureId) throw new Error('recording_not_found')
        const record = active.record
        await this.stop('user')
        return { success: true, data: this.publicState(record, 'uploading') }
      }
      if (owned && (!payload.captureId || active.record.id === payload.captureId))
        return {
          success: true,
          data: this.publicState(
            active.record,
            active.stopping ? 'uploading' : active.started ? 'recording' : 'starting'
          )
        }
      if (!this.supported) return { success: true, data: this.publicState(null, 'idle') }
      const record = (await this.cache.list(scope)).find((item) => !payload.captureId || item.id === payload.captureId)
      if (!record) return { success: true, data: this.publicState(null, 'idle') }
      if (input.commandKey === 'desktop.audio.capture.retry') {
        if (active || this.starting || this.draining) throw new Error('recording_active')
        await this.delivery.authorize(record, input.commandKey)
        if (!record.stopped) {
          record.stopped = true
          record.reason = 'interrupted'
          record.durationMs = record.lastEndMs
          await this.cache.save(record)
        }
        void this.drain(record).catch(() => {})
      }
      return {
        success: true,
        data: this.publicState(record, this.draining?.id === record.id ? 'uploading' : 'pending')
      }
    } catch (error) {
      const safe = new Set([
        'unsupported',
        'invalid_input',
        'user_activation_required',
        'scope_changed',
        'forbidden',
        'recording_not_found',
        'recording_active',
        'voice_active',
        'secure_storage_unavailable',
        'audio_permission_denied',
        'delivery_pending'
      ])
      return { success: false, code: safe.has(error.message) ? error.message : 'operation_failed' }
    }
  }
  async start(input, scope, delivery) {
    const epoch = this.epoch
    const record = {
      id: randomUUID(),
      scope,
      botId: input.botId,
      delivery,
      createdAt: Date.now(),
      counts: { microphone: 0, system: 0 },
      uploaded: { microphone: 0, system: 0 },
      lastEndMs: 0,
      stopped: false,
      reason: 'user',
      errorCode: null,
      createdDelivered: false,
      startedDelivered: false
    }
    let saved = false
    const assertStart = () => {
      this.delivery.assertCurrent(record)
      if (this.epoch !== epoch || this.scopeChanging) throw new Error('scope_changed')
    }
    try {
      await this.cache.initialize()
      await this.delivery.authorize(record, input.commandKey)
      assertStart()
      await this.cache.save(record)
      saved = true
      await this.deliverCreated(record)
      assertStart()
      // Establish the host indicator before acquiring devices.
      this.onRecording(true)
      const child = this.spawnHelper(this.helper, [], { stdio: ['pipe', 'pipe', 'ignore'] })
      child.stdin.on('error', () => {})
      const active = {
        record,
        child,
        launchedAt: Date.now(),
        started: false,
        nativeStarted: false,
        lastInput: { microphone: 0, system: 0 },
        levels: { microphone: 0, system: 0 },
        write: Promise.resolve(),
        queuedBytes: 0,
        stopping: false,
        buffer: '',
        exit: null,
        timer: null
      }
      this.active = active
      active.exit = new Promise((resolve) => {
        child.once('close', resolve)
        child.once('error', resolve)
      })
      active.timer = setInterval(() => this.tick(active), 5000)
      child.stdout.on('data', (bytes) => this.receive(active, bytes))
      child.once('error', () => {
        record.errorCode = 'audio_permission_denied'
        void this.stop('interrupted')
      })
      child.once('close', () => {
        if (!active.stopping) void this.stop('interrupted')
      })
      return this.publicState(record, 'starting')
    } catch (error) {
      try {
        this.onRecording(false)
      } catch {
        /* Indicator cleanup cannot block recovery. */
      }
      if (saved) {
        record.stopped = true
        record.durationMs = 0
        record.reason = 'interrupted'
        record.deliveryError = 'delivery_pending'
        await this.cache.save(record)
      }
      throw error
    }
  }
  tick(active) {
    if (this.active !== active || active.stopping) return
    const record = active.record
    try {
      this.delivery.assertCurrent(record)
    } catch {
      void this.stop('scope_changed')
      return
    }
    if (Date.now() - active.launchedAt >= MAX_DURATION - 6000) {
      void this.stop('limit')
      return
    }
    if (
      Date.now() - active.launchedAt > 15000 &&
      (!active.nativeStarted ||
        tracks.some((track) => Date.now() - (active.lastInput[track] || active.launchedAt) > 15000))
    ) {
      record.errorCode = 'audio_source_missing'
      void this.stop('device_lost')
      return
    }
    void this.drain(record).catch(() => {})
  }
  receive(active, bytes) {
    if (this.active !== active) return
    active.buffer += bytes.toString('utf8')
    if (active.buffer.length > 900000) {
      active.record.errorCode = 'audio_conversion_failed'
      void this.stop('device_lost')
      return
    }
    let index
    while ((index = active.buffer.indexOf('\n')) >= 0) {
      const line = active.buffer.slice(0, index)
      active.buffer = active.buffer.slice(index + 1)
      let event
      try {
        event = parseNativeEvent(JSON.parse(line))
      } catch {
        active.record.errorCode = 'audio_conversion_failed'
        void this.stop('device_lost')
        return
      }
      if (event.type === 'level') {
        active.levels[event.track] = event.level
        active.lastInput[event.track] = Date.now()
        active.started = active.nativeStarted && tracks.every((track) => active.lastInput[track] > 0)
      }
      if (event.type === 'started' && !active.nativeStarted) {
        active.nativeStarted = true
        active.record.startedAt = Date.now()
        active.started = tracks.every((track) => active.lastInput[track] > 0)
        active.write = active.write
          .then(() => this.cache.save(active.record))
          .catch(() => {
            active.record.errorCode = 'disk_error'
            void this.stop('disk_error')
          })
      }
      if (event.type === 'error') {
        active.record.errorCode = event.code
        void this.stop('device_lost')
      }
      if (event.type === 'chunk') {
        active.queuedBytes += event.wav.length
        if (active.queuedBytes > 8000000) {
          active.record.errorCode = 'disk_error'
          void this.stop('disk_error')
          return
        }
        active.write = active.write
          .then(async () => {
            if (event.sequence !== active.record.counts[event.track]) throw new Error('audio_gap')
            await this.cache.chunk(active.record, event)
            active.record.counts[event.track]++
            active.record.lastEndMs = Math.max(active.record.lastEndMs, event.endMs)
            await this.cache.save(active.record)
          })
          .catch(() => {
            active.record.errorCode = 'disk_error'
            void this.stop('disk_error')
          })
          .finally(() => {
            active.queuedBytes -= event.wav.length
          })
      }
    }
  }
  async stop(reason = 'user') {
    this.epoch++
    if (this.starting) await this.starting.catch(() => {})
    const active = this.active
    if (!active) return
    if (active.stopping) return active.stopPromise
    active.stopping = true
    clearInterval(active.timer)
    active.stopPromise = (async () => {
      active.record.reason = reason
      active.child.stdin.end('\n')
      const kill = setTimeout(() => active.child.kill('SIGKILL'), 7000)
      await active.exit
      clearTimeout(kill)
      await active.write
      active.record.stopped = true
      active.record.durationMs = active.record.lastEndMs
      try {
        await this.cache.save(active.record)
      } catch {
        active.record.errorCode = 'disk_error'
      }
      this.active = null
      try {
        this.onRecording(false)
      } catch {
        /* Audio is already stopped; continue delivery. */
      }
      if (reason !== 'scope_changed')
        void (async () => {
          if (this.draining) await this.draining.promise.catch(() => {})
          await this.drain(active.record)
        })().catch(() => {})
    })()
    return active.stopPromise
  }
  async deliverCreated(record) {
    if (record.createdDelivered) return
    await this.delivery.event(record, 'created', { createdAt: record.createdAt, tracks })
    record.createdDelivered = true
    await this.cache.save(record)
  }
  drain(record) {
    if (record.delivered) return Promise.resolve()
    if (this.draining) return this.draining.promise
    const promise = Promise.resolve().then(async () => {
      try {
        await this.delivery.authorize(record, 'desktop.audio.capture.start')
        await this.deliverCreated(record)
        if (record.startedAt && !record.startedDelivered) {
          await this.delivery.event(record, 'started', { startedAt: record.startedAt })
          record.startedDelivered = true
          await this.cache.save(record)
        }
        do {
          for (const track of tracks) {
            while (record.uploaded[track] < record.counts[track]) {
              const sequence = record.uploaded[track]
              const chunk = await this.cache.readChunk(record, track, sequence)
              await this.delivery.chunk(record, chunk)
              record.uploaded[track]++
              await this.cache.save(record)
              await this.cache.acknowledge(record, track, sequence)
            }
          }
        } while (record.stopped && tracks.some((track) => record.uploaded[track] < record.counts[track]))
        // Stop can append the final microphone chunk while a system upload is in flight.
        if (record.stopped && tracks.every((track) => record.uploaded[track] === record.counts[track])) {
          await this.delivery.event(record, 'stopped', {
            durationMs: record.durationMs,
            reason: record.reason,
            chunks: { ...record.counts },
            errorCode: record.errorCode
          })
          await this.cache.remove(record)
          record.delivered = true
        } else if (record.deliveryError) {
          record.deliveryError = null
          await this.cache.save(record)
        }
      } catch (error) {
        record.deliveryError = 'delivery_pending'
        try {
          await this.cache.save(record)
        } catch {
          record.deliveryError = 'disk_error'
        }
        throw error
      } finally {
        this.draining = null
      }
    })
    this.draining = { id: record.id, promise }
    return promise
  }
  async shutdown(reason = 'quit') {
    await this.stop(reason)
    if (this.draining) {
      let timer
      try {
        await Promise.race([
          this.draining.promise.catch(() => {}),
          new Promise((resolve) => {
            timer = setTimeout(resolve, 1500)
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
module.exports = { AudioCaptureController }
