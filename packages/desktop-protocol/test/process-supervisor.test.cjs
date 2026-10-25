const { test } = require('node:test')
const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')
const { mkdtemp, readFile, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { AGENT_PROCESS_SUPERVISOR } = require('../process-supervisor')

test('SDK supervisor loads without package imports and matches the device supervisor', async () => {
  const source = await readFile(join(__dirname, '../../plugin-sdk/src/lib/agent/runtime/process-supervisor.ts'), 'utf8')
  // A data URL has no package resolution context: the SDK payload must be self-contained.
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  assert.equal(sdk.AGENT_PROCESS_SUPERVISOR, AGENT_PROCESS_SUPERVISOR)
})

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(fn) {
  for (let i = 0; i < 400; i++) {
    if (await fn()) return
    await delay(20)
  }
  throw Error('supervisor timeout')
}
function supervised(source, cwd, owner = process.pid) {
  const child = spawn(
    'python3',
    ['-u', '-c', AGENT_PROCESS_SUPERVISOR, String(owner), process.execPath, '-e', source],
    {
      cwd,
      detached: true,
      stdio: ['pipe', 'pipe', 'pipe', 'pipe']
    }
  )
  let receipt = '',
    output = '',
    exited = false
  child.stdio[3].on('data', (value) => (receipt += value))
  child.stdout.on('data', (value) => (output += value))
  child.stderr.resume()
  child.once('exit', () => (exited = true))
  const finished = new Promise((resolve) =>
    child.once('close', (code, signal) =>
      resolve({
        code,
        signal,
        receipt: receipt.split('\n').at(-1) ? JSON.parse(receipt.split('\n').at(-1)) : undefined
      })
    )
  )
  return {
    child,
    finished,
    output: () => output,
    stop: () => {
      if (!exited) child.kill('SIGTERM')
    }
  }
}
async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), 'owned-supervisor-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}
const heartbeat =
  "require('fs').appendFileSync('heartbeat','x');setInterval(()=>require('fs').appendFileSync('heartbeat','x'),20)"
async function size(root) {
  try {
    return (await readFile(join(root, 'heartbeat'))).length
  } catch {
    return 0
  }
}

test('parent exit drains its still-running child and only supported platforms certify descendants', async (t) => {
  const root = await directory(t)
  const run = supervised(
    `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(heartbeat + ";console.log('ready')")}],{stdio:['ignore','pipe','ignore']});c.stdout.once('data',()=>setTimeout(()=>process.exit(0),150))`,
    root
  )
  t.after(run.stop)
  await until(async () => (await size(root)) > 2)
  const exit = await run.finished
  assert.equal(exit.receipt?.coverage, process.platform === 'linux' ? 'descendants' : undefined)
  const before = await size(root)
  await delay(150)
  assert.equal(await size(root), before)
  console.log(
    'AFTER_PARENT_EXIT',
    JSON.stringify({
      parentCloseReported: true,
      childStillWriting: false,
      childWritesAfterClose: 0,
      completion: exit.receipt ? 'confirmed' : 'unknown'
    })
  )
})

test(
  'subreaper drains a detached grandchild and a child that ignores SIGTERM',
  { skip: process.platform !== 'linux' },
  async (t) => {
    const root = await directory(t)
    const escaped = "process.on('SIGTERM',()=>{});" + heartbeat
    const launcher = `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(escaped)}],{detached:true,stdio:'ignore'});c.unref()`
    const run = supervised(
      `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(launcher)}],{stdio:'ignore'});setInterval(()=>{},1000)`,
      root
    )
    t.after(run.stop)
    await until(async () => (await size(root)) > 2)
    run.stop()
    run.stop()
    const exit = await run.finished
    assert.equal(exit.receipt?.state, 'exited')
    const before = await size(root)
    await delay(150)
    assert.equal(await size(root), before)
  }
)

test('stopping one supervised family does not signal a separately owned family', async (t) => {
  const root = await directory(t)
  const a = supervised('setInterval(()=>{},1000)', root)
  const b = supervised(heartbeat, root)
  t.after(a.stop)
  t.after(b.stop)
  await until(async () => (await size(root)) > 2)
  a.stop()
  await a.finished
  const before = await size(root)
  await delay(150)
  assert.ok((await size(root)) > before)
  b.stop()
  await b.finished
})

test(
  'unsupported platforms cannot manufacture descendant completion',
  { skip: process.platform === 'linux' },
  async (t) => {
    const run = supervised('process.exit(0)', await directory(t))
    t.after(run.stop)
    assert.equal((await run.finished).receipt, undefined)
  }
)

test('supervisor closes its copy of stdin so child transport failure is observable', async (t) => {
  const run = supervised("require('fs').closeSync(0);console.log('ready');setInterval(()=>{},1000)", await directory(t))
  t.after(run.stop)
  await until(() => run.output().includes('ready'))
  const error = new Promise((resolve) => run.child.stdin.once('error', resolve))
  run.child.stdin.write('input')
  assert.equal((await error).code, 'EPIPE')
  run.stop()
  await run.finished
})

test(
  'original host death causes the surviving supervisor to drain its child',
  { skip: process.platform !== 'linux' },
  async (t) => {
    const root = await directory(t)
    const ownerSource = `require('child_process').spawn('python3',['-u','-c',${JSON.stringify(AGENT_PROCESS_SUPERVISOR)},String(process.pid),process.execPath,'-e',${JSON.stringify(heartbeat)}],{cwd:${JSON.stringify(root)},detached:true,stdio:['ignore','ignore','ignore','pipe']}).stdio[3].resume();setInterval(()=>{},1000)`
    const owner = spawn(process.execPath, ['-e', ownerSource], { stdio: 'ignore' })
    let dead = false
    owner.once('exit', () => (dead = true))
    t.after(() => {
      if (!dead) owner.kill('SIGKILL')
    })
    await until(async () => (await size(root)) > 2)
    const exited = new Promise((resolve) => owner.once('exit', resolve))
    owner.kill('SIGKILL')
    await exited
    await delay(2500)
    const before = await size(root)
    await delay(200)
    assert.equal(await size(root), before)
  }
)

test('an exited original host cannot be replaced by the supervisor current parent during startup', async (t) => {
  const root = await directory(t)
  const run = supervised(heartbeat, root, 0)
  const result = await run.finished
  assert.equal(result.receipt?.state, 'not_started')
  assert.equal(await size(root), 0)
})
