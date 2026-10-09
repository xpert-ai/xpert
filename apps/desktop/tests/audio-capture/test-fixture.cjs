const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const { randomUUID } = require('node:crypto')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { AUDIO_CAPTURE_COMMANDS } = require('@xpert-ai/desktop-protocol')
const { AudioCaptureController } = require('../../electron/audio-capture/controller.cjs')
const encryption = {
  isEncryptionAvailable: () => true,
  encryptString: (text) => Buffer.from(text),
  decryptString: (bytes) => bytes.toString()
}
const assistantId = '00000000-0000-4000-8000-000000000001'
const scope = {
  apiUrl: 'http://localhost:3000',
  tenantId: 'tenant',
  organizationId: 'org',
  userId: 'alice',
  assistantId,
  viewKey: 'recorder'
}
const delivery = { eventAction: 'audio.event', chunkAction: 'audio.chunk', context: { reference: 'case-a' } }
function record() {
  return {
    id: randomUUID(),
    scope: { ...scope },
    botId: 'bot',
    delivery,
    plugin: '@example/recorder',
    createdAt: Date.now(),
    startedAt: Date.now(),
    counts: { microphone: 1, system: 1 },
    uploaded: { microphone: 0, system: 0 },
    lastEndMs: 100,
    durationMs: 100,
    stopped: true,
    reason: 'user',
    errorCode: null,
    createdDelivered: true,
    startedDelivered: true
  }
}
function chunk(track = 'microphone', sequence = 0) {
  const bytes = Buffer.alloc(4844)
  bytes.write('RIFF')
  bytes.writeUInt32LE(bytes.length - 8, 4)
  bytes.write('WAVEfmt ', 8)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20)
  bytes.writeUInt16LE(1, 22)
  bytes.writeUInt32LE(24000, 24)
  bytes.writeUInt32LE(48000, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(4800, 40)
  return {
    type: 'chunk',
    track,
    sequence,
    startMs: sequence * 100,
    endMs: (sequence + 1) * 100,
    wav: bytes.toString('base64')
  }
}
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-capture-'))
  const requests = [],
    children = [],
    indicators = []
  const manifest = {
    source: { plugin: '@example/recorder' },
    clientCommands: AUDIO_CAPTURE_COMMANDS.map((key) => ({ key })),
    actions: [
      { key: delivery.eventAction, actionType: 'invoke' },
      { key: delivery.chunkAction, actionType: 'invoke', transport: 'file' }
    ]
  }
  const service = {
    config: { apiUrl: scope.apiUrl },
    credentials: { tenantId: scope.tenantId },
    profile: { organizationId: scope.organizationId, user: { id: scope.userId } },
    bots: [{ id: 'bot', assistantId }],
    async request(url, options) {
      requests.push({ url, options })
      return url.endsWith('/manifest') ? manifest : { success: true, data: {} }
    }
  }
  const controller = new AudioCaptureController(service, {
    root,
    helper: '/test/audio-capture',
    encryption,
    supported: true,
    onRecording: (value) => indicators.push(value),
    spawnHelper() {
      const child = new EventEmitter()
      child.stdout = new PassThrough()
      child.stdin = new PassThrough()
      child.stdin.once('finish', () => {
        child.stdout.end()
        child.emit('close', 0)
      })
      child.kill = () => child.emit('close', 0)
      children.push(child)
      return child
    }
  })
  service.audioCapture = controller
  const command = (key, payload = {}, extra = {}) =>
    controller.command({
      botId: 'bot',
      hostId: assistantId,
      viewKey: scope.viewKey,
      commandKey: `desktop.audio.capture.${key}`,
      payload,
      ...extra
    })
  t.after(async () => {
    await controller.stop('scope_changed')
    await controller.draining?.promise.catch(() => {})
    await fs.rm(root, { recursive: true, force: true })
  })
  return {
    root,
    service,
    manifest,
    requests,
    children,
    indicators,
    controller,
    command,
    start: () => command('start', { delivery }, { userActivated: true }),
    emit: (event) => children.at(-1).stdout.write(JSON.stringify(event) + '\n')
  }
}
module.exports = { setup, encryption, scope, delivery, record, chunk }
