const { test } = require('node:test')
const assert = require('node:assert/strict')
const { registerAudioCaptureIpc, dispatchWithAudioCapture } = require('../../electron/audio-capture/lifecycle.cjs')
const { setup } = require('./test-fixture.cjs')
const translate = (_locale, key) => key
test('audio IPC accepts only the trusted Desktop renderer', async () => {
  let handler,
    calls = 0
  registerAudioCaptureIpc(
    {
      handle(key, callback) {
        assert.equal(key, 'xpert:audio-capture')
        handler = callback
      }
    },
    {
      command: async () => {
        calls++
        return { success: true }
      }
    },
    (event) => event.trusted
  )
  assert.deepEqual(await handler({ trusted: false }, {}), { success: false, code: 'forbidden' })
  assert.equal(calls, 0)
  assert.deepEqual(await handler({ trusted: true }, {}), { success: true })
})
test('voice startup reserves devices before its asynchronous service call', async (t) => {
  const f = await setup(t)
  let release
  const voice = dispatchWithAudioCapture(
    f.service,
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
    'voiceStart',
    {},
    translate
  )
  assert.equal((await f.start()).code, 'voice_active')
  release({ ok: false })
  await voice
  assert.equal((await f.start()).success, true)
  let calls = 0
  const blocked = await dispatchWithAudioCapture(
    f.service,
    () => {
      calls++
    },
    'voiceStart',
    {},
    translate
  )
  assert.equal(blocked.status, 409)
  assert.equal(calls, 0)
})
test('account switching stops capture and blocks new starts until dispatch finishes', async (t) => {
  const f = await setup(t)
  await f.start()
  let release
  const switching = dispatchWithAudioCapture(
    f.service,
    () =>
      new Promise((resolve) => {
        release = resolve
      }),
    'selectOrganization',
    {},
    translate
  )
  while (!release) await new Promise((resolve) => setImmediate(resolve))
  assert.equal(f.controller.active, null)
  assert.equal((await f.start()).code, 'scope_changed')
  release({ ok: true })
  await switching
  assert.equal(f.controller.scopeChanging, 0)
  assert.equal(
    f.requests.some((item) => item.options.body?.input?.event === 'stopped'),
    false,
    'old audio stays local until explicit retry in its original scope'
  )
})
