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
test('covers undecorated helpers, variable aliases, destructuring and direct context constructors', () => {
  for (const code of [
    `import { runWithRequestContext as bind } from '@xpert-ai/plugin-sdk'; const later = bind; function recover() { return later() }`,
    `import * as ctx from '@xpert-ai/plugin-sdk'; const { runWithRequestContext: later } = ctx; setInterval(() => later(), 1000)`,
    `import * as ctx from '@xpert-ai/plugin-sdk'; ctx['runWithRequestContext']()`,
    `import { RequestContext as Ctx } from '@xpert-ai/plugin-sdk'; new Ctx(req, res)`
  ])
    assert.equal(inspect(code, 'helper.ts').length, 1)
})
test('restricts identity minting to its host owner while allowing ordinary role queries', () => {
  const code = `import { createExecutionIdentity as mint } from '../execution-identity'; mint(user, scope)`
  assert.equal(inspect(code, 'consumer.ts')[0].name, 'forbidden identity factory')
  assert.deepEqual(
    inspect(code, 'packages/server/src/user/execution-identity/resolve-execution-identity.handler.ts'),
    []
  )
  assert.equal(inspect(`export { createExecutionIdentity as mint } from './execution-identity'`, 'index.ts').length, 1)
})
test('checks index content independently of unstaged edits', () => {
  const fs = require('node:fs'),
    os = require('node:os'),
    path = require('node:path')
  const { execFileSync, spawnSync } = require('node:child_process')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'execution-identity-index-'))
  const file = 'packages/server/src/example.ts'
  const checker = path.resolve(__dirname, 'check-execution-identities.cjs')
  const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  const run = () => spawnSync(process.execPath, [checker, '--staged'], { cwd: root, encoding: 'utf8' })
  try {
    git('init', '-q')
    fs.mkdirSync(path.join(root, 'packages/server/src'), { recursive: true })
    fs.mkdirSync(path.join(root, 'tools/scripts'), { recursive: true })
    fs.writeFileSync(path.join(root, 'tools/scripts/execution-identity-adapters.json'), '{}')
    fs.writeFileSync(path.join(root, file), 'runWithExecutionIdentity(identity, task)')
    git('add', '.')
    fs.writeFileSync(path.join(root, file), 'runWithRequestContext(request, task)')
    const initial = run()
    assert.equal(initial.status, 0, initial.stderr)
    git('add', file)
    fs.writeFileSync(path.join(root, file), 'runWithExecutionIdentity(identity, task)')
    const result = run()
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /example.ts/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
