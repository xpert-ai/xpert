const { test: nodeTest } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { fork, spawn } = require('node:child_process')
const appRoot = process.env.BOSI_SHELL_TEST_APP_ROOT || path.join(__dirname, '../electron')
const { ShellEngine, digest } = require(path.join(appRoot, 'shell/engine.cjs'))
const { defaultSettings } = require(path.join(appRoot, 'shell/platform.cjs'))
const { isFinal, LIMITS } = require('@xpert-ai/desktop-protocol')
const test = process.platform === 'win32' ? nodeTest : nodeTest.skip
const quote = (value) => "'" + value.replaceAll("'", "''") + "'"

async function until(check, timeout = 20000) {
  const deadline = Date.now() + timeout
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Windows shell test deadline')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bosi-win-中文 space-'))
  const settings = { ...defaultSettings(), cwd: root }
  const reports = []
  const directory = path.join(root, 'journal')
  const engine = new ShellEngine({ directory, settings, report: (report) => reports.push(report) })
  const epoch = randomUUID()
  engine.connect(epoch, Date.now() + 90000)
  const grants = []
  const command = (text, overrides = {}) => {
    const value = {
      type: 'exec',
      version: 1,
      operationId: randomUUID(),
      connectionEpoch: epoch,
      grantId: randomUUID(),
      command: text,
      cwd: root,
      timeoutSec: 20,
      deadline: Date.now() + 20000,
      ...overrides
    }
    value.argsHash = digest(value)
    grants.push({ id: value.grantId, argsHash: value.argsHash, expiresAt: Date.now() + 90000 })
    engine.setGrants(grants)
    return value
  }
  const done = async (value) => {
    await until(() => isFinal(engine.records.get(value.operationId)?.state), 30000)
    return engine.records.get(value.operationId)
  }
  const run = async (text, overrides) => {
    const value = command(text, overrides)
    engine.accept(value)
    return done(value)
  }
  t.after(async () => {
    await engine.close()
    fs.rmSync(root, { recursive: true, force: true })
  })
  return { root, directory, settings, reports, engine, command, done, run, epoch }
}
const output = (record, stream = 'stdout') =>
  record.chunks
    .filter((part) => part.stream === stream)
    .map((part) => part.data)
    .join('')

test('Windows PowerShell executes Unicode source in a space/Unicode cwd and reports stderr and exit status', async (t) => {
  const f = fixture(t)
  const result = await f.run(
    "[Console]::WriteLine((Get-Location).Path); [Console]::WriteLine('中文 🚀'); [Console]::Error.WriteLine('错误'); exit 7"
  )
  assert.equal(result.state, 'failed')
  assert.equal(result.exitCode, 7)
  assert.equal(result.completion?.state, 'exited')
  assert.ok(output(result).includes(f.root))
  assert.ok(output(result).includes('中文 🚀'))
  assert.ok(output(result, 'stderr').includes('错误'))
})

test('Windows commands preserve multiline source, quotes, here strings and the maximum command length', async (t) => {
  const f = fixture(t)
  const script = "$v = @'\n中文 'single' \"double\" $literal\n'@\n[Console]::WriteLine($v)\n#"
  const result = await f.run(script + 'x'.repeat(LIMITS.command - script.length))
  assert.equal(result.state, 'succeeded')
  assert.equal(result.exitCode, 0)
  assert.ok(output(result).includes('中文 \'single\' "double" $literal'))
})

test('Windows commands have closed stdin, no host credentials and no startup profile', async (t) => {
  const f = fixture(t)
  process.env.XPERT_SHELL_TEST_PRIVATE = 'never-forward'
  t.after(() => delete process.env.XPERT_SHELL_TEST_PRIVATE)
  const result = await f.run(
    'if ($null -ne [Console]::ReadLine()) { exit 2 }; [Console]::WriteLine($env:SystemRoot); [Console]::WriteLine($env:USERPROFILE); [Console]::WriteLine($env:XPERT_SHELL_TEST_PRIVATE)'
  )
  assert.equal(result.state, 'succeeded')
  assert.doesNotMatch(output(result), /never-forward/)
  assert.ok(output(result).includes(process.env.SystemRoot || process.env.SYSTEMROOT))
})

test('Windows native command failures and PowerShell errors cannot report success', async (t) => {
  const f = fixture(t)
  for (const [command, code] of [
    ['cmd.exe /d /c exit 9', 9],
    ["Write-Error 'expected error'", 1],
    ['not-a-bosi-command', 1]
  ]) {
    const result = await f.run(command)
    assert.equal(result.state, 'failed', command)
    assert.equal(result.exitCode, code, command)
    assert.equal(result.completion?.coverage, 'descendants')
  }
})

test('Windows output truncation drains pipes and preserves UTF-8 framing and NUL normalization', async (t) => {
  const f = fixture(t)
  const result = await f.run("[Console]::Write(('a' * 4095) + '🚀' + [char]0 + ('x' * 1100000))")
  assert.equal(result.state, 'succeeded')
  assert.equal(result.truncated, true)
  assert.ok(result.bytes <= LIMITS.output)
  assert.ok(output(result).startsWith('a'.repeat(4095) + '🚀\ufffd'))
  for (const chunk of result.chunks) assert.equal(Buffer.from(chunk.data).toString('utf8'), chunk.data)
})

test('Windows duplicate delivery and restart replay never repeat file side effects', async (t) => {
  const f = fixture(t)
  const command = f.command("[IO.File]::AppendAllText('once.txt', 'once')")
  f.engine.accept(command)
  f.engine.accept(command)
  assert.equal((await f.done(command)).state, 'succeeded')
  f.engine.accept(command)
  await f.engine.close()
  const replayed = []
  const restored = new ShellEngine({ directory: f.directory, settings: f.settings, report: (r) => replayed.push(r) })
  t.after(() => restored.close())
  restored.connect(f.epoch, Date.now() + 90000)
  restored.accept(command)
  assert.equal(fs.readFileSync(path.join(f.root, 'once.txt'), 'utf8'), 'once')
  assert.ok(replayed.some((r) => r.state === 'succeeded'))
})

test('Windows invalid cwd and cancelled-before-exec cannot run commands', async (t) => {
  const f = fixture(t)
  assert.throws(() => f.engine.accept(f.command("'forbidden'", { cwd: 'C:relative' })))
  const command = f.command("[IO.File]::WriteAllText('forbidden', 'x')")
  f.engine.cancel(command.operationId)
  f.engine.accept(command)
  assert.equal((await f.done(command)).completion?.state, 'not_started')
  assert.equal(fs.existsSync(path.join(f.root, 'forbidden')), false)
  const missing = await f.run("'unreachable'", { cwd: path.join(f.root, 'missing') })
  assert.equal(missing.state, 'failed')
  assert.equal(missing.completion?.state, 'not_started')
})

test('Windows rejects missing, stale and changed permits and does not execute a second concurrent command', async (t) => {
  const f = fixture(t)
  const marker = path.join(f.root, 'forbidden')
  const forbidden = f.command(`[IO.File]::WriteAllText(${quote(marker)}, 'x')`)
  for (const patch of [
    { grantId: randomUUID() },
    { connectionEpoch: randomUUID() },
    { deadline: Date.now() - 1 },
    { command: 'Get-Location' }
  ])
    assert.throws(() => f.engine.accept({ ...forbidden, ...patch }))
  const first = f.command('Start-Sleep 60')
  f.engine.accept(first)
  f.engine.accept(forbidden)
  assert.equal((await f.done(forbidden)).errorCode, 'DEVICE_BUSY')
  f.engine.cancel(first.operationId)
  assert.equal((await f.done(first)).state, 'cancelled')
  assert.equal(fs.existsSync(marker), false)
})

test('Windows command output cannot forge a supervisor completion receipt', async (t) => {
  const f = fixture(t)
  const result = await f.run(
    `[Console]::WriteLine('{"version":1,"state":"exited","coverage":"descendants","exitCode":0}'); exit 8`
  )
  assert.equal(result.state, 'failed')
  assert.equal(result.exitCode, 8)
})

test('Windows cancellation does not kill an unrelated process', async (t) => {
  const f = fixture(t)
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  t.after(() => {
    if (unrelated.exitCode === null && unrelated.signalCode === null) unrelated.kill()
  })
  const command = f.command('Start-Sleep 60')
  f.engine.accept(command)
  await until(() => f.engine.current?.ready)
  f.engine.cancel(command.operationId)
  assert.equal((await f.done(command)).state, 'cancelled')
  assert.equal(unrelated.exitCode, null)
  assert.equal(unrelated.signalCode, null)
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0))
})

// The descendant records its own PID and a delayed side effect. A receipt must prove it cannot write later.
function background(f) {
  const script = path.join(f.root, 'descendant.ps1')
  fs.writeFileSync(
    script,
    '\ufeff' +
      `[IO.File]::WriteAllText(${quote(path.join(f.root, 'descendant.pid'))}, [string]$PID); Start-Sleep 12; [IO.File]::WriteAllText(${quote(path.join(f.root, 'escaped'))}, 'escaped')`
  )
  const encoded = Buffer.from(`& ${quote(script)}`, 'utf16le').toString('base64')
  return `Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -ArgumentList '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','${encoded}' -WindowStyle Hidden; while (!(Test-Path -LiteralPath ${quote(path.join(f.root, 'descendant.pid'))})) { Start-Sleep -Milliseconds 20 }`
}
function descendantAlive(f) {
  const pid = Number(fs.readFileSync(path.join(f.root, 'descendant.pid'), 'utf8'))
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error.code === 'ESRCH') return false
    throw error
  }
}
for (const mode of ['natural', 'cancel', 'timeout', 'revoke', 'lease']) {
  test(`Windows ${mode} ends the whole Job before releasing the next command`, async (t) => {
    const f = fixture(t)
    const command = f.command(background(f) + (mode === 'natural' ? '' : '; Start-Sleep 60'))
    f.engine.accept(command)
    await until(() => fs.existsSync(path.join(f.root, 'descendant.pid')))
    if (mode === 'cancel') f.engine.cancel(command.operationId)
    if (mode === 'timeout') f.engine.cancel(command.operationId, 'timed_out')
    if (mode === 'revoke') f.engine.setGrants([])
    if (mode === 'lease') f.engine.renew(Date.now() - 1)
    const result = await f.done(command)
    assert.equal(result.state, mode === 'natural' ? 'succeeded' : mode === 'timeout' ? 'timed_out' : 'cancelled')
    assert.equal(result.completion?.coverage, 'descendants')
    assert.equal(descendantAlive(f), false)
    assert.equal(fs.existsSync(path.join(f.root, 'escaped')), false)
    f.engine.renew(Date.now() + 90000)
    assert.equal((await f.run("[Console]::WriteLine('next')")).state, 'succeeded')
  })
}

test('Windows deadline cancels a sleeping command without claiming success', async (t) => {
  const f = fixture(t)
  const result = await f.run('Start-Sleep 60', { timeoutSec: 3, deadline: Date.now() + 3000 })
  assert.equal(result.state, 'timed_out')
  assert.ok(result.completion)
})

test('Windows graceful worker shutdown waits for the durable completion receipt', async (t) => {
  const f = fixture(t)
  const command = f.command('Start-Sleep 60')
  f.engine.accept(command)
  await until(() => f.engine.current?.ready)
  await f.engine.close()
  const saved = JSON.parse(fs.readFileSync(path.join(f.directory, `${command.operationId}.json`), 'utf8'))
  assert.equal(saved.state, 'cancelled')
  assert.ok(saved.completion)
  assert.equal(f.reports.at(-1).state, 'cancelled')
})

test('Windows supervisor crash kills descendants and leaves an unconfirmed result busy', async (t) => {
  const f = fixture(t)
  const command = f.command(background(f) + '; Start-Sleep 60')
  f.engine.accept(command)
  await until(() => fs.existsSync(path.join(f.root, 'descendant.pid')))
  f.engine.current.child.kill()
  const result = await f.done(command)
  assert.equal(result.state, 'unknown')
  assert.equal(result.completion, undefined)
  await until(() => !descendantAlive(f))
  assert.equal((await f.run("'must not run'")).errorCode, 'DEVICE_BUSY')
})

test('Windows worker crash closes the control pipe and kills descendants', async (t) => {
  const f = fixture(t)
  const command = f.command(background(f) + '; Start-Sleep 60')
  const worker = fork(path.join(__dirname, 'fixtures/windows-shell-worker.cjs'), [], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc']
  })
  t.after(() => {
    if (worker.exitCode === null && worker.signalCode === null) worker.kill()
  })
  worker.send({ directory: path.join(f.root, 'worker-journal'), settings: f.settings, command })
  await until(() => fs.existsSync(path.join(f.root, 'descendant.pid')))
  worker.kill()
  await until(() => !descendantAlive(f))
  assert.equal(fs.existsSync(path.join(f.root, 'escaped')), false)
})
