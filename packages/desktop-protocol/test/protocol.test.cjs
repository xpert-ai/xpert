const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { parseInput, parseCommand, parseReport, parseSettings, parseComputerInfo, isShellCwd, LIMITS } = require('..')
const ids = () => ({ version: 1, operationId: randomUUID(), connectionEpoch: randomUUID() })
test('computer discovery reports a typed platform without carrying commands or credentials', () => {
  assert.deepEqual(parseInput({ action: 'info', command: 'must not run' }), { action: 'info' })
  const info = { available: true, platform: 'win32', name: 'Windows', shell: 'powershell.exe', cwd: 'C:\\work' }
  assert.deepEqual(parseComputerInfo({ ...info, token: 'private' }), info)
  assert.deepEqual(parseComputerInfo({ ...info, available: false }), { available: false })
  assert.throws(() => parseComputerInfo({ ...info, platform: 'darwin' }))
  assert.throws(() => parseComputerInfo({ ...info, cwd: '/tmp' }))
})
test('exec schema bounds commands and timeouts, and discards identity fields', () => {
  assert.deepEqual(parseInput({ action: 'exec', command: 'pwd', deviceId: 'forged' }), {
    action: 'exec',
    command: 'pwd',
    timeout_sec: 60
  })
  for (const input of [
    null,
    { action: 'exec', command: '' },
    { action: 'exec', command: 'x\0y' },
    { action: 'exec', command: 'x'.repeat(LIMITS.command + 1) },
    { action: 'exec', command: 'pwd', timeout_sec: 601 },
    { action: 'status', operationId: 'wrong' },
    { action: 'status', operationId: randomUUID(), cursor: -1 }
  ])
    assert.throws(() => parseInput(input))
})
test('wire commands require protocol, epoch, operation, grant and hash', () => {
  const command = {
    ...ids(),
    type: 'exec',
    grantId: randomUUID(),
    argsHash: 'a'.repeat(64),
    command: 'pwd',
    cwd: '/tmp',
    timeoutSec: 30,
    deadline: Date.now() + 30000
  }
  assert.equal(parseCommand(command).command, 'pwd')
  for (const patch of [{ version: 2 }, { grantId: null }, { cwd: '../tmp' }, { argsHash: 'x' }])
    assert.throws(() => parseCommand({ ...command, ...patch }))
})
test('output and terminal reports are discriminated and bounded', () => {
  const output = { ...ids(), type: 'output', state: 'running', seq: 1, stream: 'stderr', data: 'error' }
  assert.equal(parseReport(output).stream, 'stderr')
  assert.throws(() => parseReport({ ...output, data: 'a'.repeat(LIMITS.chunk + 1) }))
  assert.throws(() => parseReport({ ...output, type: 'state', exitCode: '0', truncated: false }))
  assert.equal(
    parseReport({ ...output, type: 'state', state: 'unknown', exitCode: null, truncated: true }).state,
    'unknown'
  )
})
test('only supported executable paths and absolute default directories are accepted', () => {
  const settings = { name: 'Computer', shell: '/bin/zsh', cwd: '/tmp', path: '/usr/bin:/bin' }
  assert.equal(parseSettings(settings).shell, '/bin/zsh')
  for (const patch of [{ shell: '/tmp/script' }, { cwd: '.' }, { path: '\0' }])
    assert.throws(() => parseSettings({ ...settings, ...patch }))
})

test('Windows settings accept explicit PowerShell and fully qualified paths without accepting drive-relative paths', () => {
  const settings = {
    name: 'Windows',
    shell: 'powershell.exe',
    cwd: 'C:\\Users\\测试 User',
    path: 'C:\\Windows;C:\\Tools'
  }
  assert.deepEqual(parseSettings(settings, 'win32'), settings)
  assert.throws(() => parseSettings(settings, 'darwin'), /INVALID_SETTINGS/)
  for (const cwd of ['C:\\work', 'D:/work space/中文', '\\\\server\\share\\project'])
    assert.equal(isShellCwd(cwd, 'win32'), true, cwd)
  for (const cwd of ['C:work', '\\work', '/tmp', '.', '\\\\?\\C:\\work', '\\\\.\\pipe\\device'])
    assert.throws(() => parseSettings({ ...settings, cwd }, 'win32'), /INVALID_SETTINGS/, cwd)
  assert.throws(() => parseSettings({ ...settings, shell: 'cmd.exe' }), /INVALID_SETTINGS/)
})

test('Windows wire commands preserve exact cwd for approval digests', () => {
  const command = {
    ...ids(),
    type: 'exec',
    grantId: randomUUID(),
    argsHash: 'b'.repeat(64),
    command: 'Get-Location',
    cwd: 'D:\\Project 中文',
    timeoutSec: 30,
    deadline: Date.now() + 30000
  }
  assert.equal(parseCommand(command).cwd, command.cwd)
  assert.equal(parseCommand(command, 'win32').cwd, command.cwd)
  assert.throws(() => parseCommand(command, 'darwin'))
  assert.throws(() => parseCommand({ ...command, cwd: 'D:relative' }))
})

test('exit evidence binds the original operation; legacy reports remain unconfirmed', () => {
  const report = { ...ids(), type: 'state', state: 'cancelled', seq: 1, exitCode: null, truncated: false }
  assert.equal(parseReport(report).completion, undefined)
  const completion = { version: 1, state: 'exited', coverage: 'descendants', generation: report.operationId }
  assert.deepEqual(parseReport({ ...report, completion }).completion, completion)
  for (const patch of [{ generation: randomUUID() }, { coverage: 'parent' }, { version: 2 }, { state: 'accepted' }])
    assert.throws(() => parseReport({ ...report, completion: { ...completion, ...patch } }))
  assert.throws(() => parseReport({ ...report, state: 'running', completion }))
})
