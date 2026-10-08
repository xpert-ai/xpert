const { test } = require('node:test')
const assert = require('node:assert/strict')
const { createVoiceMethods } = require('../electron/voice.cjs')
const { allowVoicePermission } = require('../electron/voice-permission.cjs')
const id = '11111111-1111-4111-8111-111111111111'
const thread = '22222222-2222-4222-8222-222222222222'
class ClientError extends Error {}

test('PCM capture preserves 20 ms frames across 44.1/48 kHz render quanta', async () => {
  const { CapturePcm } = await import('../public/voice/codec.js')
  for (const rate of [44100, 48000, 16000]) {
    const capture = new CapturePcm(rate)
    const frames = []
    const signal = new Float32Array(rate).fill(0.5)
    for (let i = 0; i < rate; i += 128) capture.push(signal.subarray(i, i + 128), (frame) => frames.push(frame))
    assert.equal(frames.length, 50)
    assert.ok(frames.every((frame) => frame.byteLength === 640 && new DataView(frame).getInt16(0, true) === 16384))
  }
})
test('playback clears immediately on interruption and bounds stale audio', async () => {
  const { PlaybackPcm } = await import('../public/voice/codec.js')
  const player = new PlaybackPcm(48000)
  const bytes = new ArrayBuffer(48000)
  const data = new DataView(bytes)
  for (let i = 0; i < 24000; i++) data.setInt16(i * 2, 8192, true)
  assert.equal(player.append(bytes), true)
  const output = new Float32Array(128)
  player.render(output)
  assert.equal(output[0], 0.25)
  player.clear()
  assert.equal(player.render(output), 0)
  assert.equal(player.append(new ArrayBuffer(3)), false)
})
test('playback accepts a response generated ahead of realtime and accounts for consumed samples', async () => {
  const { PlaybackPcm } = await import('../public/voice/codec.js')
  for (const rate of [24000, 44100, 48000]) {
    const player = new PlaybackPcm(rate)
    // A supplier can send several seconds of speech before one second has played.
    const seconds = 3
    const chunk = new ArrayBuffer(24000)
    const view = new DataView(chunk)
    for (let i = 0; i < chunk.byteLength / 2; i++) view.setInt16(i * 2, 8192, true)
    for (let i = 0; i < seconds * 2; i++) assert.equal(player.append(chunk), true)
    const output = new Float32Array(rate / 10)
    player.render(output)
    assert.ok(Math.abs(player.pending - 69600) <= 1, 'partially played chunks release queue capacity')
    for (let i = 1; i < seconds * 10; i++) {
      assert.ok(player.render(output) > 0.24)
      assert.ok(
        output.every((sample) => sample === 0.25),
        'speech stays in order without silence or drops'
      )
    }
    player.render(new Float32Array(128))
    assert.equal(player.pending, 0)
  }
})
test('playback still enforces a bounded queue and interruption releases it', async () => {
  const { PlaybackPcm } = await import('../public/voice/codec.js')
  const player = new PlaybackPcm(48000)
  assert.equal(player.append(new ArrayBuffer(24000 * 2 * 30)), true)
  assert.equal(player.append(new ArrayBuffer(2)), false)
  assert.equal(player.pending, 24000 * 30)
  player.clear()
  assert.equal(player.pending, 0)
  assert.equal(player.append(new ArrayBuffer(48000)), true)
})
test('microphone is restricted to the trusted main frame and excludes camera', () => {
  const rendererUrl = 'file:///app/index.html'
  const contents = { getURL: () => rendererUrl }
  const request = {
    contents,
    mainContents: contents,
    permission: 'media',
    source: rendererUrl,
    rendererUrl,
    details: { isMainFrame: true, mediaTypes: ['audio'] }
  }
  assert.equal(allowVoicePermission(request), true)
  assert.equal(allowVoicePermission({ ...request, details: { isMainFrame: false, mediaTypes: ['audio'] } }), false)
  assert.equal(
    allowVoicePermission({ ...request, details: { isMainFrame: true, mediaTypes: ['audio', 'video'] } }),
    false
  )
  assert.equal(allowVoicePermission({ ...request, source: 'https://frame.example' }), false)
  assert.equal(allowVoicePermission({ ...request, contents: { getURL: () => rendererUrl } }), false)
})
test('host resolves new conversation, scopes admission, and returns only ticket data', async () => {
  const calls = []
  const service = {
    ...createVoiceMethods(ClientError),
    generation: 1,
    profile: { organizationId: id },
    bots: [{ id, assistantId: id }],
    config: { apiUrl: 'https://xpert.example/api' },
    request: async (path, options) => {
      calls.push({ path, options })
      return path === '/api/ai/threads'
        ? { thread_id: thread }
        : {
            sessionId: id,
            conversationId: id,
            ticket: 'a'.repeat(64),
            path: '/api/ai/voice/stream',
            inputSampleRate: 16000,
            outputSampleRate: 24000,
            credentials: 'never return'
          }
    }
  }
  const result = await service.voiceStart({ botId: id, assistantId: id, originMode: 'desktop' })
  assert.equal(result.url, 'wss://xpert.example/api/ai/voice/stream')
  assert.equal(result.threadId, thread)
  assert.equal('credentials' in result, false)
  assert.ok(calls.every((call) => call.options.scope === 'organization' && call.options.retry === false))
  assert.equal(calls[1].options.body.assistantId, id)
  await assert.rejects(() => service.voiceStart({ botId: id, threadId: '../other', originMode: 'desktop' }))
})
