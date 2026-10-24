import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { NeutralRuntime, NeutralRuntimeOperation } from './dist/index.js'

test('a persisted Runtime handle survives a new adapter instance without another start', async () => {
  const invocationId = randomUUID(),
    saved = []
  const context = { invocationId, checkpoint: async (observation) => saved.push(observation) }
  const readyAt = new Date(Date.now() - 1_000).toISOString()
  const adapter = new NeutralRuntimeOperation(),
    work = { subjects: [{ version: readyAt }], executor: { invocationId } }
  const input = await adapter.prepare(work)
  const started = await new NeutralRuntime().start({ operationId: invocationId, input }, context)
  assert.deepEqual(saved, [started])
  const terminal = await new NeutralRuntime().inspect(started.handle, context)
  assert.equal(terminal.status, 'succeeded')
  assert.deepEqual(await adapter.collect(work, terminal.result), {})
  await assert.rejects(() => adapter.collect({ ...work, executor: { invocationId: randomUUID() } }, terminal.result))
  await assert.rejects(() => new NeutralRuntime().inspect(started.handle, { ...context, invocationId: randomUUID() }))
})
test('a pending Runtime confirms cancellation on the original handle', async () => {
  const invocationId = randomUUID(),
    context = { invocationId, checkpoint: async () => {} }
  const runtime = new NeutralRuntime(),
    input = { prompt: '', parameters: { readyAt: new Date(Date.now() + 60_000).toISOString() } }
  const started = await runtime.start({ operationId: invocationId, input }, context)
  assert.equal((await runtime.inspect(started.handle, context)).status, 'running')
  assert.equal((await runtime.cancel(started.handle, context)).status, 'cancelled')
  await assert.rejects(() => runtime.start({ operationId: randomUUID(), input }, context))
})
