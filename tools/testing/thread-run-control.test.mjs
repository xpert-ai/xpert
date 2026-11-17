import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createThreadRunControlClient, pauseRunAndConfirm } from './thread-run-control.mjs'

async function fixture(t, handler) {
  const paths = []
  const server = createServer((req, res) => {
    paths.push(req.url)
    handler(req, res)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const dir = await mkdtemp(join(tmpdir(), 'xpert-control-'))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(dir, { recursive: true })
  })
  const client = createThreadRunControlClient({
    apiUrl: `http://127.0.0.1:${server.address().port}/api`,
    requestTimeoutMs: 100
  })
  const input = {
    client,
    threadId: 'thread',
    runId: 'run',
    journalPath: join(dir, 'control.jsonl'),
    timeoutMs: 500,
    pollIntervalMs: 10
  }
  return {
    input,
    paths,
    records: async () => (await readFile(input.journalPath, 'utf8')).trim().split('\n').map(JSON.parse)
  }
}
const json = (res, value, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(value))
}

test('uses the full route and waits for the same execution to become paused', async (t) => {
  let reads = 0
  const f = await fixture(t, (req, res) =>
    req.method === 'POST'
      ? json(res, { executionId: 'run', state: 'pausing' }, 202)
      : json(res, { threadId: 'thread', runId: 'run', state: ++reads > 1 ? 'paused' : 'pausing' })
  )
  assert.equal((await pauseRunAndConfirm(f.input)).state, 'paused')
  assert.deepEqual(f.paths, [
    '/api/ai/threads/thread/runs/run/pause',
    '/api/ai/threads/thread/control-view',
    '/api/ai/threads/thread/control-view'
  ])
  assert.equal((await f.records()).at(-1).event, 'pause_confirmed')
})
for (const status of [401, 404, 503])
  test(`persists HTTP ${status} failure and the exact corrective action`, async (t) => {
    const f = await fixture(t, (_req, res) => json(res, {}, status))
    await assert.rejects(pauseRunAndConfirm(f.input), { code: `CONTROL_HTTP_${status}` })
    assert.deepEqual((await f.records()).at(-1).action, {
      method: 'POST',
      path: '/api/ai/threads/thread/runs/run/pause'
    })
    assert.equal((await f.records()).at(-1).event, 'control_failed')
    assert.equal(f.paths.length, 1)
  })
test('persists request timeouts without reporting pause success', async (t) => {
  const f = await fixture(t, () => {})
  await assert.rejects(pauseRunAndConfirm(f.input), { code: 'CONTROL_REQUEST_TIMEOUT' })
  assert.equal((await f.records()).at(-1).event, 'control_failed')
})
test('does not confuse pausing with completed control', async (t) => {
  const f = await fixture(t, (req, res) =>
    json(
      res,
      req.method === 'POST'
        ? { executionId: 'run', state: 'pausing' }
        : { threadId: 'thread', runId: 'run', state: 'pausing' }
    )
  )
  await assert.rejects(pauseRunAndConfirm({ ...f.input, timeoutMs: 80 }), { code: 'CONTROL_PAUSE_UNCONFIRMED' })
  assert.equal((await f.records()).at(-1).lastState, 'pausing')
})
test('refuses to confirm a different execution or send pause to its replacement', async (t) => {
  const f = await fixture(t, (req, res) =>
    json(
      res,
      req.method === 'POST'
        ? { executionId: 'run', state: 'pausing' }
        : { threadId: 'thread', runId: 'new-run', state: 'paused' }
    )
  )
  await assert.rejects(pauseRunAndConfirm(f.input), { code: 'CONTROL_TARGET_CHANGED' })
  assert.equal(f.paths.length, 2)
})
