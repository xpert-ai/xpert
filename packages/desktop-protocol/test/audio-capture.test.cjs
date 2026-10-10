const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseAudioCapturePayload: parse, isAudioCaptureCommand, AUDIO_CAPTURE_COMMANDS } = require('..')
const start = 'desktop.audio.capture.start'
const delivery = { eventAction: 'on-audio-event', chunkAction: 'on-audio-chunk', context: { externalReference: 'a' } }
test('generic audio capture commands accept opaque plugin context without application-specific types', () => {
  const parsed = parse(start, { delivery })
  assert.deepEqual(parsed, { delivery })
  assert.notEqual(parsed.delivery.context, delivery.context)
  assert.equal(isAudioCaptureCommand('desktop.audio.capture.unknown'), false)
  assert.ok(AUDIO_CAPTURE_COMMANDS.every(isAudioCaptureCommand))
})
test('start rejects payload activation claims, arbitrary endpoints, invalid callbacks and oversized context', () => {
  for (const payload of [
    { delivery, userActivated: true },
    { delivery, captureId: 'user-selected' },
    { delivery: { ...delivery, url: 'https://elsewhere.example' } },
    { delivery: { ...delivery, chunkAction: '../upload' } },
    { delivery: { ...delivery, chunkAction: delivery.eventAction } },
    { delivery: { ...delivery, context: 'x'.repeat(8193) } },
    { delivery: { ...delivery, context: { nested: NaN } } },
    null,
    {}
  ])
    assert.throws(() => parse(start, payload), /invalid_input/)
})
test('state can discover a local capture while stop and retry require its exact id', () => {
  const captureId = '00000000-0000-4000-8000-000000000001'
  assert.deepEqual(parse('desktop.audio.capture.state', {}), {})
  for (const command of AUDIO_CAPTURE_COMMANDS.slice(1)) {
    assert.deepEqual(parse(command, { captureId }), { captureId })
    assert.throws(() => parse(command, { captureId: '../escape' }), /invalid_input/)
    assert.throws(() => parse(command, { captureId, extra: true }), /invalid_input/)
  }
  for (const suffix of ['stop', 'retry'])
    assert.throws(() => parse(`desktop.audio.capture.${suffix}`, {}), /invalid_input/)
})
