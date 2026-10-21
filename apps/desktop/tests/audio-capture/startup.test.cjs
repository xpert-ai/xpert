const { test } = require('node:test')
const assert = require('node:assert/strict')
const { setup } = require('./test-fixture.cjs')

function deferred() {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

for (const phase of ['permission', 'created']) {
  test(`state hides the capture ID while ${phase} is pending and exposes it after creation`, async (t) => {
    const f = await setup(t)
    const entered = deferred(),
      release = deferred()
    const wait = async () => {
      entered.resolve()
      await release.promise
    }
    if (phase === 'permission') {
      f.controller.permissions = { microphone: wait }
    } else {
      const request = f.service.request.bind(f.service)
      f.service.request = async (url, options) => {
        if (options.body?.input?.event === 'created') await wait()
        return request(url, options)
      }
    }
    const start = f.start()
    try {
      await entered.promise
      const state = await f.command('state')
      assert.equal(state.success, true)
      assert.equal(state.data.status, 'starting')
      assert.equal(state.data.captureId, undefined)
      assert.equal(f.children.length, 0)
      assert.equal((await f.start()).code, 'recording_active')
      const foreign = await f.command('state', {}, { viewKey: 'another-view' })
      assert.equal(foreign.data.status, 'idle')
      assert.equal(foreign.data.captureId, undefined)
    } finally {
      release.resolve()
      await start
    }
    const result = await start
    assert.equal(result.success, true)
    const state = await f.command('state')
    assert.equal(state.data.captureId, result.data.captureId)
    assert.equal(state.data.status, 'starting')
    assert.equal(f.children.length, 1)
  })
}

test('a state read already in flight cannot expose a newly cached, unacknowledged capture', async (t) => {
  const f = await setup(t)
  const reading = deferred(),
    releaseRead = deferred(),
    creating = deferred(),
    releaseCreate = deferred()
  const list = f.controller.cache.list.bind(f.controller.cache)
  f.controller.cache.list = async (...args) => {
    reading.resolve()
    await releaseRead.promise
    return list(...args)
  }
  const request = f.service.request.bind(f.service)
  f.service.request = async (url, options) => {
    if (options.body?.input?.event === 'created') {
      creating.resolve()
      await releaseCreate.promise
    }
    return request(url, options)
  }
  const state = f.command('state')
  await reading.promise
  const start = f.start()
  try {
    await creating.promise
    releaseRead.resolve()
    const result = await state
    assert.equal(result.data.status, 'starting')
    assert.equal(result.data.captureId, undefined)
  } finally {
    releaseRead.resolve()
    releaseCreate.resolve()
    await start
  }
})

test('a failed creation remains discoverable and retryable after leaving the starting state', async (t) => {
  const f = await setup(t)
  const request = f.service.request.bind(f.service)
  f.service.request = async (url, options) => {
    if (options.body?.input?.event === 'created') throw new Error('network unavailable')
    return request(url, options)
  }
  assert.equal((await f.start()).success, false)
  const pending = await f.command('state')
  assert.equal(pending.data.status, 'pending')
  assert.equal(typeof pending.data.captureId, 'string')
  assert.equal(pending.data.errorCode, 'delivery_pending')
  assert.equal(f.children.length, 0)
  f.service.request = request
  assert.equal((await f.command('retry', { captureId: pending.data.captureId })).success, true)
  await f.controller.draining?.promise
  assert.equal((await f.command('state')).data.status, 'idle')
  assert.equal(f.children.length, 0, 'retry only delivers cached events; it never acquires devices')
})
