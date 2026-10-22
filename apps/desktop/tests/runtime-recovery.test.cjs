const { test } = require('node:test')
const assert = require('node:assert/strict')
const { DesktopService } = require('../electron/service.cjs')
const { dispatch } = require('../electron/dispatch.cjs')
const { runtimeFailure } = require('../electron/runtime-recovery.cjs')
const rejectRuntime = (code = 'RUNTIME_DRAINING', after = '5') =>
  new Response(JSON.stringify({ errorCode: code }), {
    status: 503,
    headers: { 'Retry-After': after }
  })
function fixture(responses, wait) {
  const calls = []
  const waits = []
  const service = new DesktopService({
    recoveryWait: async (ms) => {
      waits.push(ms)
      await wait?.(service)
    },
    fetcher: async (url, options) => {
      calls.push({ url, ...options })
      const next = responses.shift()
      if (next instanceof Error) throw next
      return next
    }
  })
  service.credentials = { token: 'test-token', tenantId: 'tenant' }
  service.profile = { organizationId: 'org' }
  service.bots = [{ id: 'bot', assistantId: 'assistant' }]
  return { service, calls, waits }
}
test('a session retries only explicit runtime refusals, preserving scope and body', async () => {
  const { service, calls, waits } = fixture([
    rejectRuntime(),
    rejectRuntime('RUNTIME_NOT_READY', '1'),
    new Response('{"client_secret":"secret"}')
  ])
  assert.equal((await service.chatSession('bot')).secret, 'secret')
  assert.deepEqual(waits, [5000, 1000])
  assert.equal(calls.length, 3)
  for (const call of calls) {
    assert.equal(call.method, 'POST')
    assert.equal(call.headers['organization-id'], 'org')
    assert.equal(call.headers['tenant-id'], 'tenant')
    assert.equal(call.body, calls[0].body)
  }
})
test('bounded exhaustion preserves runtime reason and Retry-After through IPC without logout', async () => {
  const { service, calls } = fixture([rejectRuntime(), rejectRuntime(), rejectRuntime()])
  const result = await dispatch(service, 'chatSession', 'bot')
  assert.equal(result.ok, false)
  assert.equal(result.status, 503)
  assert.equal(result.errorCode, 'RUNTIME_DRAINING')
  assert.equal(result.retryAfterMs, 5000)
  assert.equal(calls.length, 3)
  assert.ok(service.credentials)
})
test('safe reads recover; chat/tool writes, unknown 503s and network errors are never replayed', async () => {
  const read = fixture([rejectRuntime(), new Response('{"items":[]}')])
  assert.deepEqual(await read.service.request('/api/unread'), { items: [] })
  assert.equal(read.calls.length, 2)
  for (const [path, method, response] of [
    ['/api/chat', 'POST', rejectRuntime()],
    ['/api/tools', 'POST', rejectRuntime()],
    ['/api/ai/v1/chatkit/sessions', 'POST', new Response('{}', { status: 503 })],
    ['/api/ai/v1/chatkit/sessions', 'POST', new Error('timeout')]
  ]) {
    const { service, calls, waits } = fixture([response])
    await assert.rejects(service.request(path, { method }), { status: 503 })
    assert.equal(calls.length, 1)
    assert.equal(waits.length, 0)
  }
})
test('scope changes during backoff cancel recovery before another request', async () => {
  const { service, calls } = fixture([rejectRuntime()], (service) => {
    service.generation++
  })
  await assert.rejects(service.chatSession('bot'), { status: 409 })
  assert.equal(calls.length, 1)
})
test('long Retry-After is returned without retrying earlier than requested', async () => {
  const { service, calls, waits } = fixture([rejectRuntime('RUNTIME_NOT_READY', '120')])
  await assert.rejects(service.chatSession('bot'), { errorCode: 'RUNTIME_NOT_READY', retryAfterMs: 120000 })
  assert.equal(calls.length, 1)
  assert.deepEqual(waits, [])
})
test('Retry-After supports dates and uses a safe delay for invalid values', async () => {
  const future = new Date(Date.now() + 10000).toUTCString()
  const failure = await runtimeFailure(rejectRuntime('RUNTIME_NOT_READY', future))
  assert.ok(failure.retryAfterMs > 8000 && failure.retryAfterMs <= 10000)
  assert.equal((await runtimeFailure(rejectRuntime('RUNTIME_NOT_READY', 'bad'))).retryAfterMs, 5000)
})

test('authentication refresh shares the original runtime retry budget', async () => {
  const { service, calls, waits } = fixture([
    rejectRuntime(),
    new Response('{}', { status: 401 }),
    rejectRuntime(),
    rejectRuntime()
  ])
  service.refresh = async () => {}
  await assert.rejects(service.chatSession('bot'), { errorCode: 'RUNTIME_DRAINING' })
  assert.equal(calls.length, 4)
  assert.equal(waits.length, 2)
})
test('a suspended desktop does not issue another retry after its recovery deadline', async () => {
  const originalNow = Date.now
  let now = originalNow()
  Date.now = () => now
  try {
    const { service, calls } = fixture([rejectRuntime()], () => {
      now += 20000
    })
    await assert.rejects(service.chatSession('bot'), { errorCode: 'RUNTIME_DRAINING' })
    assert.equal(calls.length, 1)
  } finally {
    Date.now = originalNow
  }
})
