const { test } = require('node:test')
const assert = require('node:assert/strict')
const { inspect } = require('./check-execution-identities.cjs')
test('rejects direct context construction in workers including aliases', () => {
  const code = `import { Processor as Queue, Process } from '@nestjs/bull'; import { captureRequestContext as capture, runWithCapturedRequestContext as run } from '../shared/request-context'; @Queue('q') class Work { @Process() process() { return run(capture({user}), () => 1) } }`
  assert.deepEqual(
    inspect(code, 'worker.ts').map((x) => x.name),
    ['runWithCapturedRequestContext', 'captureRequestContext']
  )
})
test('covers scheduled work and WorkerHost classes independent of filenames', () => {
  for (const code of [
    `import { Cron } from '@nestjs/schedule'; class S { @Cron('*') tick() { return runWithRequestContext() } }`,
    `import { WorkerHost } from '@nestjs/bullmq'; class S extends WorkerHost { process() { return captureRequestContext() } }`
  ])
    assert.equal(inspect(code, 'arbitrary.ts').length, 1)
})
test('allows data queries and the typed execution runner', () => {
  assert.deepEqual(
    inspect(`@Processor('q') class W { process() { return runWithExecutionIdentity(identity, task) } }`, 'w.ts'),
    []
  )
  assert.deepEqual(inspect(`const user = users.findOne(id, { relations: ['role'] });`, 'query.ts'), [])
})
test('recognizes namespace context imports', () => {
  assert.equal(
    inspect(
      `import * as ctx from '../shared/request-context'; @Processor('q') class W { process() { return ctx.captureRequestContext({}) } }`,
      'worker.ts'
    ).length,
    1
  )
})
