const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { parseInput, parseCommand, parseReport, parseSettings, LIMITS } = require('..')
const ids = () => ({ version: 1, operationId: randomUUID(), connectionEpoch: randomUUID() })
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
