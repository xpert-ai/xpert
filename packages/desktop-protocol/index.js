// Invariants: validate both ends of the device channel; no message grants itself execution authority.
const VERSION = 1
const NAMESPACE = '/desktop-shell'
const LIMITS = Object.freeze({
  command: 16384,
  chunk: 16384,
  output: 1048576,
  result: 65536,
  timeout: 60,
  maxTimeout: 600,
  wait: 10000,
  lease: 90000,
  grant: 8 * 3600000,
  records: 2000
})
const FINAL = ['succeeded', 'failed', 'cancelled', 'timed_out', 'rejected', 'unknown']
const STATES = ['pending', 'running', 'cancel_requested', ...FINAL]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function fail(code = 'INVALID_MESSAGE') {
  throw Object.assign(new Error(code), { code })
}
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function text(value, max, empty = false) {
  return typeof value === 'string' && (empty || value.trim().length > 0) && value.length <= max && !value.includes('\0')
}
function integer(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
}
function isId(value) {
  return typeof value === 'string' && UUID.test(value)
}
function isFinal(state) {
  return FINAL.includes(state)
}
function parseSettings(value) {
  if (
    !object(value) ||
    !text(value.name, 100) ||
    !['/bin/zsh', '/bin/bash'].includes(value.shell) ||
    !text(value.cwd, 4096) ||
    !value.cwd.startsWith('/') ||
    !text(value.path, 8192)
  )
    fail('INVALID_SETTINGS')
  return { name: value.name.trim(), shell: value.shell, cwd: value.cwd, path: value.path }
}
function parseInput(value) {
  if (!object(value)) fail()
  if (value.action === 'exec') {
    if (
      !text(value.command, LIMITS.command) ||
      (value.cwd !== undefined && !text(value.cwd, 4096)) ||
      (value.timeout_sec !== undefined && !integer(value.timeout_sec, 1, LIMITS.maxTimeout))
    )
      fail()
    return {
      action: 'exec',
      command: value.command,
      ...(value.cwd === undefined ? {} : { cwd: value.cwd }),
      timeout_sec: value.timeout_sec ?? LIMITS.timeout
    }
  }
  if (
    !['status', 'cancel'].includes(value.action) ||
    !isId(value.operationId) ||
    (value.cursor !== undefined && !integer(value.cursor, 0, Number.MAX_SAFE_INTEGER))
  )
    fail()
  return {
    action: value.action,
    operationId: value.operationId,
    ...(value.action === 'status' ? { cursor: value.cursor ?? 0 } : {})
  }
}
function parseCommand(value) {
  if (
    !object(value) ||
    value.version !== VERSION ||
    !isId(value.operationId) ||
    !isId(value.connectionEpoch) ||
    !['exec', 'cancel'].includes(value.type)
  )
    fail()
  if (value.type === 'cancel') {
    if (value.reason !== undefined && !['cancelled', 'timed_out'].includes(value.reason)) fail()
    return {
      type: 'cancel',
      version: VERSION,
      operationId: value.operationId,
      connectionEpoch: value.connectionEpoch,
      reason: value.reason ?? 'cancelled'
    }
  }
  if (
    !isId(value.grantId) ||
    !text(value.argsHash, 64) ||
    !/^[a-f0-9]{64}$/.test(value.argsHash) ||
    !integer(value.deadline, 1, Number.MAX_SAFE_INTEGER) ||
    !text(value.cwd, 4096) ||
    !value.cwd.startsWith('/')
  )
    fail()
  const input = parseInput({ action: 'exec', command: value.command, cwd: value.cwd, timeout_sec: value.timeoutSec })
  return {
    type: 'exec',
    version: VERSION,
    operationId: value.operationId,
    connectionEpoch: value.connectionEpoch,
    grantId: value.grantId,
    argsHash: value.argsHash,
    command: input.command,
    cwd: value.cwd,
    timeoutSec: input.timeout_sec,
    deadline: value.deadline
  }
}
function parseReport(value) {
  if (
    !object(value) ||
    value.version !== VERSION ||
    !isId(value.operationId) ||
    !isId(value.connectionEpoch) ||
    !STATES.includes(value.state) ||
    !integer(value.seq, 0, Number.MAX_SAFE_INTEGER)
  )
    fail()
  if (value.type === 'output') {
    if (!['stdout', 'stderr'].includes(value.stream) || !text(value.data, LIMITS.chunk, true)) fail()
    return {
      type: 'output',
      version: VERSION,
      operationId: value.operationId,
      connectionEpoch: value.connectionEpoch,
      state: 'running',
      seq: value.seq,
      stream: value.stream,
      data: value.data
    }
  }
  if (
    value.type !== 'state' ||
    !(value.exitCode === null || integer(value.exitCode, -2147483648, 2147483647)) ||
    typeof value.truncated !== 'boolean' ||
    (value.signal !== undefined && !text(value.signal, 32)) ||
    (value.errorCode !== undefined && !text(value.errorCode, 80))
  )
    fail()
  return {
    type: 'state',
    version: VERSION,
    operationId: value.operationId,
    connectionEpoch: value.connectionEpoch,
    state: value.state,
    seq: value.seq,
    exitCode: value.exitCode,
    truncated: value.truncated,
    ...(value.signal ? { signal: value.signal } : {}),
    ...(value.errorCode ? { errorCode: value.errorCode } : {})
  }
}
module.exports = {
  VERSION,
  NAMESPACE,
  LIMITS,
  STATES,
  isId,
  isFinal,
  parseSettings,
  parseInput,
  parseCommand,
  parseReport
}
