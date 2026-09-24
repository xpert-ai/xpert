const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { ShellEngine, digest } = require('../electron/shell/engine.cjs')
const { isFinal, LIMITS } = require('@xpert-ai/desktop-protocol')
async function until(check, timeout = 10000) {
  const end = Date.now() + timeout
  while (!check()) {
    if (Date.now() > end) throw new Error('test deadline')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-shell-'))
  const directory = path.join(root, 'journal')
  const reports = []
  const settings = { name: 'Fixture', shell: '/bin/bash', cwd: root, path: '/usr/bin:/bin' }
  const engine = new ShellEngine({ directory, settings, report: (r) => reports.push(r) })
  const epoch = randomUUID(),
    grantId = randomUUID()
  engine.connect(epoch, Date.now() + 90000)
  engine.setGrants([{ id: grantId, expiresAt: Date.now() + 90000 }])
  const command = (value, extra = {}) => {
    const c = {
      type: 'exec',
      version: 1,
      operationId: randomUUID(),
      connectionEpoch: epoch,
      grantId,
      command: value,
      cwd: root,
      timeoutSec: 5,
      deadline: Date.now() + 5000,
      ...extra
    }
    c.argsHash = digest(c)
    return c
  }
  const done = async (c) => {
    await until(() => isFinal(engine.records.get(c.operationId)?.state))
    return engine.records.get(c.operationId)
  }
  t.after(async () => {
    await engine.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, directory, engine, reports, settings, command, done, epoch, grantId }
}
test('captures stdout/stderr and nonzero exit in a unicode/space cwd; stdin is closed', async (t) => {
  const f = setup(t)
  const cwd = path.join(f.root, 'project \u4e2d\u6587')
  fs.mkdirSync(cwd)
  const c = f.command('pwd; echo stderr >&2; read value; exit 7', { cwd })
  f.engine.accept(c)
  const record = await f.done(c)
  assert.equal(record.exitCode, 7)
  assert.equal(record.state, 'failed')
  assert.ok(record.chunks.some((c) => c.data.includes(cwd)))
  assert.ok(record.chunks.some((c) => c.stream === 'stderr' && c.data.includes('stderr')))
})
test('duplicate command and reconnect only replay results, never append twice', async (t) => {
  const f = setup(t)
  const c = f.command('echo once >> count')
  f.engine.accept(c)
  f.engine.accept(c)
  await f.done(c)
  f.engine.accept(c)
  f.engine.connect(randomUUID(), Date.now() + 90000)
  assert.equal(fs.readFileSync(path.join(f.root, 'count'), 'utf8'), 'once\n')
  assert.ok(f.reports.filter((r) => r.type === 'state' && r.state === 'succeeded').length >= 2)
  assert.throws(
    () =>
      f.engine.accept({
        ...c,
        connectionEpoch: f.engine.epoch,
        command: 'pwd',
        argsHash: digest({ ...c, command: 'pwd' })
      }),
    /OPERATION_CONFLICT/
  )
})
test('output framing preserves emoji boundaries and normalizes binary NUL', async (t) => {
  const f = setup(t)
  const text = 'a'.repeat(4095) + '\ud83d\ude80' + '\0end'
  fs.writeFileSync(path.join(f.root, 'unicode.txt'), text)
  const c = f.command('cat unicode.txt')
  f.engine.accept(c)
  const record = await f.done(c)
  assert.equal(record.chunks.map((chunk) => chunk.data).join(''), text.replaceAll('\0', '\ufffd'))
  for (const chunk of record.chunks) assert.equal(Buffer.from(chunk.data).toString('utf8'), chunk.data)
})
test('rejects unauthorized, stale, expired and malformed commands before spawn', (t) => {
  const f = setup(t)
  for (const patch of [{ grantId: randomUUID() }, { connectionEpoch: randomUUID() }, { deadline: Date.now() - 1 }])
    assert.throws(() => f.engine.accept(f.command('touch should-not-exist', patch)))
  assert.equal(fs.existsSync(path.join(f.root, 'should-not-exist')), false)
})
test('single concurrency rejects a second operation', async (t) => {
  const f = setup(t)
  const first = f.command('sleep 10'),
    second = f.command('touch second')
  f.engine.accept(first)
  f.engine.accept(second)
  assert.equal((await f.done(second)).errorCode, 'DEVICE_BUSY')
  f.engine.cancel(first.operationId)
  await f.done(first)
  assert.equal(fs.existsSync(path.join(f.root, 'second')), false)
})
test('cancel-before-exec is persisted and blocks delayed execution', async (t) => {
  const f = setup(t)
  const c = f.command('touch delayed')
  f.engine.accept({ type: 'cancel', version: 1, operationId: c.operationId, connectionEpoch: f.epoch })
  f.engine.accept(c)
  assert.equal((await f.done(c)).state, 'cancelled')
  assert.equal(fs.existsSync(path.join(f.root, 'delayed')), false)
})
test('timeout terminates the process group and returns timed_out', async (t) => {
  const f = setup(t)
  const c = f.command('sleep 20 & wait', { timeoutSec: 1 })
  f.engine.accept(c)
  const record = await f.done(c)
  assert.equal(record.state, 'timed_out')
  assert.notEqual(record.signal, undefined)
})
test('revoking a grant stops an in-flight command', async (t) => {
  const f = setup(t)
  const c = f.command('sleep 20')
  f.engine.accept(c)
  f.engine.setGrants([])
  assert.equal((await f.done(c)).state, 'cancelled')
})
test('expired connection lease stops running commands', async (t) => {
  const f = setup(t)
  const c = f.command('sleep 20')
  f.engine.accept(c)
  f.engine.renew(Date.now() - 1)
  assert.equal((await f.done(c)).state, 'cancelled')
})
test('output is capped while the pipe continues draining', async (t) => {
  const f = setup(t)
  const c = f.command('/usr/bin/yes x | /usr/bin/head -c 1500000', { timeoutSec: 10, deadline: Date.now() + 10000 })
  f.engine.accept(c)
  const record = await f.done(c)
  assert.equal(record.state, 'succeeded')
  assert.equal(record.truncated, true)
  assert.ok(record.bytes <= LIMITS.output)
})
test('internal parent environment is not inherited by shell', async (t) => {
  const f = setup(t)
  process.env.XPERT_SHELL_TEST_PRIVATE = 'never-forward'
  t.after(() => delete process.env.XPERT_SHELL_TEST_PRIVATE)
  const c = f.command('/usr/bin/env')
  f.engine.accept(c)
  const record = await f.done(c)
  assert.doesNotMatch(record.chunks.map((c) => c.data).join(''), /never-forward/)
})
test('worker restart turns uncertain intent into unknown without rerunning', async (t) => {
  const f = setup(t)
  const c = f.command('touch forbidden-retry')
  const record = {
    id: c.operationId,
    grantId: f.grantId,
    argsHash: c.argsHash,
    deadline: c.deadline,
    state: 'pending',
    seq: 0,
    chunks: [],
    bytes: 0,
    exitCode: null,
    truncated: false
  }
  f.engine.save(record)
  await f.engine.close()
  const restarted = new ShellEngine({ directory: f.directory, settings: f.settings, report() {} })
  t.after(() => restarted.close())
  restarted.connect(f.epoch, Date.now() + 90000)
  restarted.setGrants([{ id: f.grantId, expiresAt: Date.now() + 90000 }])
  restarted.accept(c)
  assert.equal(restarted.records.get(c.operationId).state, 'unknown')
  assert.equal(fs.existsSync(path.join(f.root, 'forbidden-retry')), false)
})
test('failed intent persistence does not spawn the command', (t) => {
  const f = setup(t)
  const c = f.command('touch forbidden-write')
  f.engine.save = () => {
    throw new Error('disk full')
  }
  assert.throws(() => f.engine.accept(c), /disk full/)
  assert.equal(fs.existsSync(path.join(f.root, 'forbidden-write')), false)
})

test('acknowledged completion persists; reconnect replays only unconfirmed output', async (t) => {
  const f = setup(t),
    c = f.command('printf persisted')
  f.engine.accept(c)
  await f.done(c)
  const output = f.reports.find((report) => report.type === 'output')
  f.engine.acknowledge(output)
  const start = f.reports.length
  f.engine.connect(randomUUID(), Date.now() + 90000)
  assert.ok(f.reports.slice(start).every((report) => report.type !== 'output'))
  const final = f.reports.at(-1)
  f.engine.acknowledge(final)
  await f.engine.close()
  const replayed = []
  const restarted = new ShellEngine({ directory: f.directory, settings: f.settings, report: (r) => replayed.push(r) })
  t.after(() => restarted.close())
  restarted.connect(randomUUID(), Date.now() + 90000)
  assert.equal(replayed.length, 0)
  assert.equal(restarted.records.get(c.operationId).state, 'succeeded')
})

test('unavailable executable produces a failed result without a success code', async (t) => {
  const f = setup(t),
    c = f.command('echo unreachable')
  f.engine.settings.shell = path.join(f.root, 'missing-shell')
  f.engine.accept(c)
  const result = await f.done(c)
  assert.equal(result.state, 'failed')
  assert.equal(result.errorCode, 'SPAWN_FAILED')
  assert.notEqual(result.exitCode, 0)
})
