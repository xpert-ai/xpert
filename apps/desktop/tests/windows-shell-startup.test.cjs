const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { runInNewContext } = require('node:vm')
const { EventEmitter } = require('node:events')
const { PassThrough } = require('node:stream')
const { randomUUID } = require('node:crypto')

// Exercise the real engine's Windows branch on every CI host; native tests cover the executable/Job boundary.
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-startup-'))
  const executions = []
  const filename = path.join(__dirname, '../electron/shell/engine.cjs')
  const realRequire = createRequire(filename)
  const module = { exports: {} }
  const spawnWindowsExecution = () => {
    const child = new EventEmitter()
    Object.assign(child, { pid: 123, stdout: new PassThrough(), stderr: new PassThrough() })
    const execution = {
      child,
      receipt: new PassThrough(),
      starts: 0,
      stops: [],
      start() {
        this.starts++
      },
      stop(force) {
        this.stops.push(force)
      },
      async finish() {}
    }
    executions.push(execution)
    return execution
  }
  runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    Buffer,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    process: { platform: 'win32', pid: process.pid },
    require: (name) => (name === './windows-execution.cjs' ? { spawnWindowsExecution } : realRequire(name))
  })
  const { ShellEngine, digest } = module.exports
  const engine = new ShellEngine({ directory, settings: {}, report() {} })
  const epoch = randomUUID()
  engine.connect(epoch, Date.now() + 90000)
  const grants = []
  const command = () => {
    const value = {
      type: 'exec',
      version: 1,
      operationId: randomUUID(),
      connectionEpoch: epoch,
      grantId: randomUUID(),
      command: 'Get-Location',
      cwd: 'C:\\work',
      timeoutSec: 20,
      deadline: Date.now() + 20000
    }
    value.argsHash = digest(value)
    grants.push({ id: value.grantId, argsHash: value.argsHash, expiresAt: Date.now() + 90000 })
    engine.setGrants(grants)
    return value
  }
  const complete = async (state, code = 0) => {
    const active = engine.current
    if (state)
      active.execution.receipt.write(JSON.stringify({ version: 1, state, coverage: 'descendants', exitCode: code }))
    active.child.emit('exit', state ? 0 : 1)
    active.child.emit('close', state ? 0 : 1)
    await active.finished
  }
  t.after(async () => {
    if (engine.current) await complete(null)
    await engine.close()
    fs.rmSync(directory, { recursive: true, force: true })
  })
  return { engine, executions, command, complete }
}

test('Windows launch waits for a complete ready receipt and starts only once', async (t) => {
  const f = fixture(t)
  const command = f.command()
  f.engine.accept(command)
  const execution = f.executions[0]
  assert.equal(execution.starts, 0)
  execution.receipt.write('{"ready":')
  assert.equal(execution.starts, 0)
  execution.receipt.write('true}\n')
  assert.equal(execution.starts, 1)
  execution.receipt.write('{"ready":true}\n')
  assert.equal(execution.starts, 1)
  await f.complete('exited')
  assert.equal(f.engine.records.get(command.operationId).state, 'succeeded')
})

for (const reason of ['cancelled', 'timed_out']) {
  test(`Windows ${reason} during startup queues stop immediately and never authorizes launch`, async (t) => {
    const f = fixture(t)
    const command = f.command()
    f.engine.accept(command)
    const execution = f.executions[0]
    f.engine.cancel(command.operationId, reason)
    assert.deepEqual(execution.stops, [false], 'cancellation must not wait for the ready receipt')
    execution.receipt.write('{"ready":true}\n')
    assert.equal(execution.starts, 0)
    assert.equal(f.engine.records.get(command.operationId).state, 'cancel_requested')
    await f.complete('not_started', 1)
    assert.equal(f.engine.records.get(command.operationId).state, reason)
    const next = f.command()
    f.engine.accept(next)
    assert.equal(f.executions.length, 2, 'confirmed cancellation releases the next operation')
    f.executions[1].receipt.write('{"ready":true}\n')
    await f.complete('exited')
    assert.equal(f.engine.records.get(next.operationId).state, 'succeeded')
  })
}

test('Windows supervisor loss during startup still blocks subsequent commands without a completion receipt', async (t) => {
  const f = fixture(t)
  const command = f.command()
  f.engine.accept(command)
  f.engine.cancel(command.operationId)
  await f.complete(null)
  assert.equal(f.engine.records.get(command.operationId).state, 'unknown')
  const next = f.command()
  f.engine.accept(next)
  assert.equal(f.engine.records.get(next.operationId).errorCode, 'DEVICE_BUSY')
  assert.equal(f.executions.length, 1)
})
