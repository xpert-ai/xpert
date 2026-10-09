const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { AudioCaptureCache } = require('../../electron/audio-capture/cache.cjs')
const { parseNativeEvent } = require('../../electron/audio-capture/native-events.cjs')
const { setup, encryption, scope, delivery, record, chunk } = require('./test-fixture.cjs')

test('microphone preflight failure does not create a meeting, launch devices, or cache a recording', async (t) => {
  const f = await setup(t)
  f.controller.permissions = { microphone: async () => ({ success: false, code: 'audio_signing_missing' }) }
  assert.equal((await f.start()).code, 'audio_signing_missing')
  assert.equal(f.children.length, 0)
  assert.equal(f.requests.filter((r) => r.options.method === 'POST').length, 0)
  assert.deepEqual(await f.controller.cache.list(scope), [])
})

test('system audio consent remains distinct from microphone consent', () => {
  assert.equal(
    parseNativeEvent({ type: 'error', code: 'system_audio_permission_denied' }).code,
    'system_audio_permission_denied'
  )
})

test('cache encrypts audio, restores it after restart and isolates user and View scopes', async (t) => {
  const f = await setup(t),
    r = record(),
    cache = f.controller.cache
  await Promise.all([cache.initialize(), cache.initialize()])
  await cache.save(r)
  await cache.chunk(r, chunk())
  const bytes = await fs.readFile(path.join(cache.directory(scope, r.id), 'microphone-0.bin'))
  assert.equal(bytes.includes(Buffer.from(chunk().wav)), false)
  const restarted = new AudioCaptureCache(f.root, encryption)
  await restarted.initialize()
  assert.deepEqual(await restarted.readChunk(r, 'microphone', 0), chunk())
  assert.deepEqual(await restarted.list({ ...scope, userId: 'bob' }), [])
  assert.deepEqual(await restarted.list({ ...scope, viewKey: 'another-view' }), [])
  bytes[30] ^= 1
  assert.throws(() => restarted.open(bytes))
})
test('start requires shell activation and reserves devices against concurrent capture and voice calls', async (t) => {
  const f = await setup(t)
  assert.equal((await f.command('start', { delivery })).code, 'user_activation_required')
  f.controller.voiceActive = true
  assert.equal((await f.start()).code, 'voice_active')
  f.controller.voiceActive = false
  const results = await Promise.all([f.start(), f.start()])
  assert.equal(results.filter((result) => result.success).length, 1)
  assert.equal(f.children.length, 1)
  assert.deepEqual(f.indicators, [true])
  assert.equal(f.requests[0].url.endsWith('/manifest'), true)
  const created = f.requests.find((item) => item.options.body?.input?.event === 'created').options.body.input
  assert.equal(created.captureId, results.find((result) => result.success).data.captureId)
  assert.deepEqual(created.context, delivery.context)
  assert.deepEqual(created.tracks, ['microphone', 'system'])
})
test('manifest declares the actual command and callbacks without a built-in plugin name allowlist', async (t) => {
  const f = await setup(t)
  f.manifest.source.plugin = '@example/any-other-recorder'
  f.manifest.actions[1].transport = 'json'
  assert.equal((await f.start()).code, 'forbidden')
  f.manifest.actions[1].transport = 'file'
  const start = f.manifest.clientCommands.shift()
  assert.equal((await f.start()).code, 'forbidden')
  f.manifest.clientCommands.unshift(start)
  assert.equal((await f.start()).success, true)
})
test('another View cannot inspect or stop an active capture owned by the same Assistant', async (t) => {
  const f = await setup(t)
  const result = await f.start()
  const state = await f.command('state', {}, { viewKey: 'other' })
  assert.equal(state.data.captureId, undefined)
  assert.equal(
    (await f.command('stop', { captureId: result.data.captureId }, { viewKey: 'other' })).code,
    'recording_not_found'
  )
  assert.ok(f.controller.active)
})
test('network failure preserves audio; retry sends only unacknowledged chunks then a final event', async (t) => {
  const f = await setup(t),
    r = record(),
    cache = f.controller.cache
  await cache.save(r)
  for (const track of ['microphone', 'system']) await cache.chunk(r, chunk(track))
  const original = f.service.request
  let failed = false
  f.service.request = async (url, options) => {
    if (url.endsWith('/file') && JSON.parse(options.body.get('input')).track === 'system' && !failed) {
      failed = true
      throw new Error('offline')
    }
    return original(url, options)
  }
  await assert.rejects(f.controller.drain(r))
  assert.equal((await cache.list(scope)).length, 1)
  assert.equal(r.uploaded.microphone, 1)
  const retry = await f.command('retry', { captureId: r.id })
  assert.equal(retry.success, true)
  await f.controller.draining?.promise
  assert.equal(f.children.length, 0, 'retry never acquires devices')
  assert.equal((await cache.list(scope)).length, 0)
  const uploads = f.requests.filter((item) => item.url.endsWith('/file'))
  assert.equal(uploads.length, 2)
  const metadata = JSON.parse(uploads[0].options.body.get('input'))
  assert.equal(metadata.version, 1)
  assert.deepEqual(metadata.context, delivery.context)
  assert.equal(uploads[0].options.body.get('file').type, 'audio/wav')
  assert.deepEqual(
    Buffer.from(await uploads[0].options.body.get('file').arrayBuffer()),
    Buffer.from(chunk().wav, 'base64')
  )
  assert.equal(f.requests.filter((item) => item.options.body?.input?.event === 'stopped').length, 1)
})
test('account changes or replacement plugins cannot receive buffered audio', async (t) => {
  const f = await setup(t),
    r = record()
  await f.controller.cache.save(r)
  f.service.profile.user.id = 'bob'
  await assert.rejects(f.controller.drain(r), /scope_changed/)
  assert.equal(f.requests.length, 0)
  f.service.profile.user.id = scope.userId
  f.manifest.source.plugin = '@example/replacement'
  await assert.rejects(f.controller.drain(r), /forbidden/)
  assert.equal(f.requests.filter((item) => item.options.method === 'POST').length, 0)
  assert.equal((await f.controller.cache.list(scope)).length, 1)
})
test('scope changes during start cancel before spawning the helper', async (t) => {
  const f = await setup(t),
    original = f.service.request
  let release
  f.service.request = async (url, options) => {
    if (url.endsWith('/manifest'))
      await new Promise((resolve) => {
        release = resolve
      })
    return original(url, options)
  }
  const starting = f.start()
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  const stopping = f.controller.stop('scope_changed')
  release()
  assert.equal((await starting).code, 'scope_changed')
  await stopping
  assert.equal(f.children.length, 0)
})
test('a stopped callback waits for microphone tail chunks arriving during a system upload', async (t) => {
  const f = await setup(t)
  await f.start()
  f.emit({ type: 'started' })
  f.emit(chunk('microphone'))
  f.emit(chunk('system'))
  const active = f.controller.active
  await active.write
  const original = f.service.request
  let release
  f.service.request = async (url, options) => {
    if (url.endsWith('/file') && JSON.parse(options.body.get('input')).track === 'system')
      await new Promise((resolve) => {
        release = resolve
      })
    return original(url, options)
  }
  const draining = f.controller.drain(active.record)
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  f.emit(chunk('microphone', 1))
  await active.write
  await f.controller.stop('user')
  release()
  await draining
  await f.controller.draining?.promise
  const delivered = f.requests
    .filter((item) => item.options.method === 'POST')
    .map((item) =>
      item.url.endsWith('/file') ? JSON.parse(item.options.body.get('input')).track : item.options.body.input.event
    )
  assert.deepEqual(delivered, ['created', 'started', 'microphone', 'system', 'microphone', 'stopped'])
  assert.equal((await f.command('state')).data.status, 'idle')
  assert.deepEqual(f.indicators, [true, false])
})
test('empty live delivery releases the queue and zero-audio stop still completes', async (t) => {
  const f = await setup(t)
  await f.start()
  await f.controller.drain(f.controller.active.record)
  assert.equal(f.controller.draining, null)
  await f.controller.stop('device_lost')
  await f.controller.draining?.promise
  const stopped = f.requests.find((item) => item.options.body?.input?.event === 'stopped').options.body.input
  assert.deepEqual(stopped.chunks, { microphone: 0, system: 0 })
  assert.equal(stopped.durationMs, 0)
  assert.equal((await f.command('state')).data.status, 'idle')
})
test('malformed native output stops capture and preserves a final error event', async (t) => {
  const f = await setup(t)
  await f.start()
  f.emit(null)
  await f.controller.stop('device_lost')
  await f.controller.draining?.promise
  const stopped = f.requests.find((item) => item.options.body?.input?.event === 'stopped').options.body.input
  assert.equal(stopped.errorCode, 'audio_conversion_failed')
  assert.equal(f.controller.active, null)
})
test('native parser validates WAV bytes and timing before buffering', () => {
  assert.deepEqual(parseNativeEvent(chunk()), chunk())
  for (const event of [
    null,
    {},
    { ...chunk(), wav: 'aGVsbG8=' },
    { ...chunk(), endMs: 5000 },
    { ...chunk(), track: '../outside' },
    { ...chunk(), sequence: -1 }
  ])
    assert.throws(() => parseNativeEvent(event), /audio_conversion_failed/)
})

test('a failed host recording indicator prevents device acquisition', async (t) => {
  const f = await setup(t)
  f.controller.onRecording = () => {
    throw new Error('indicator unavailable')
  }
  assert.equal((await f.start()).code, 'operation_failed')
  assert.equal(f.children.length, 0)
  assert.equal(f.controller.active, null)
  assert.equal((await f.command('state')).data.status, 'pending')
})

test('device startup timeout counts from helper launch, excluding slow authorization and callbacks', async (t) => {
  const f = await setup(t)
  await f.start()
  const active = f.controller.active
  active.record.createdAt -= 30000
  f.controller.tick(active)
  assert.equal(active.stopping, false)
  active.launchedAt -= 30000
  f.controller.tick(active)
  await f.controller.stop('device_lost')
  await f.controller.draining?.promise
  assert.equal(active.record.errorCode, 'audio_source_missing')
  assert.equal(f.controller.active, null)
})
