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

test('worker shutdown waits for completion on the separate Windows receipt channel', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-shutdown-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const child = new EventEmitter()
  child.pid = 123
  child.stdout = new PassThrough()
  child.stderr = new PassThrough()
  const receipt = new PassThrough()
  let receiptFinished
  const receiptDone = new Promise((resolve) => {
    receiptFinished = resolve
  })
  let closed
  const childClosed = new Promise((resolve) => {
    closed = resolve
  })
  const execution = {
    child,
    receipt,
    start() {},
    stop() {
      setImmediate(() => {
        child.emit('exit', 0)
        child.emit('close', 0)
        closed()
      })
    },
    async finish() {
      await receiptDone
    }
  }
  const filename = path.join(__dirname, '../electron/shell/engine.cjs')
  const module = { exports: {} }
  const realRequire = createRequire(filename)
  runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module,
    Buffer,
    setInterval,
    clearInterval,
    setTimeout,
    clearTimeout,
    process: { platform: 'win32', pid: process.pid },
    require: (name) =>
      name === './windows-execution.cjs' ? { spawnWindowsExecution: () => execution } : realRequire(name)
  })
  const { ShellEngine, digest } = module.exports
  const reports = []
  const engine = new ShellEngine({ directory, settings: {}, report: (report) => reports.push(report) })
  const command = {
    type: 'exec',
    version: 1,
    operationId: randomUUID(),
    connectionEpoch: randomUUID(),
    grantId: randomUUID(),
    command: 'Start-Sleep 60',
    cwd: 'C:\\work',
    timeoutSec: 60,
    deadline: Date.now() + 60000
  }
  command.argsHash = digest(command)
  engine.connect(command.connectionEpoch, Date.now() + 90000)
  engine.setGrants([{ id: command.grantId, argsHash: command.argsHash, expiresAt: Date.now() + 90000 }])
  engine.accept(command)
  receipt.write('{"ready":true}\n')
  let returned = false
  const stopping = engine.close().then(() => {
    returned = true
  })
  await childClosed
  await new Promise((resolve) => setTimeout(resolve, 20))
  assert.equal(returned, false, 'process close is not the completion receipt')
  receipt.write('{"version":1,"state":"exited","coverage":"descendants","exitCode":1}')
  receiptFinished()
  await stopping
  const saved = JSON.parse(fs.readFileSync(path.join(directory, `${command.operationId}.json`), 'utf8'))
  assert.equal(saved.state, 'cancelled')
  assert.equal(saved.completion.state, 'exited')
  assert.equal(reports.at(-1).state, 'cancelled')
})
