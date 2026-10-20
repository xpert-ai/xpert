const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { test } = require('node:test')
const { createRedactor } = require('./health-diagnostics.cjs')

test('redacts generated and encoded credentials while retaining useful errors', () => {
  const secret = 'temporary:/secret+with%encoding'
  const redact = createRedactor({ CHECK_DB_PASS: secret }, { GH_TOKEN: 'synthetic-github-token' })
  const raw = [
    secret,
    encodeURIComponent(secret),
    Buffer.from(secret).toString('base64'),
    'synthetic-github-token',
    'postgres://other:unlisted-password@db:5432/health',
    'Authorization: Bearer unlisted-auth-token',
    '{"JWT_SECRET": "unlisted jwt secret", "port": 3000}',
    "redis_password: 'unlisted redis password'",
    'apiKey=unlisted-key',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.fakeSignature',
    '::warning::untrusted command',
    'Error: Cannot find module @xpert-ai/missing',
    'connect ECONNREFUSED db:5432'
  ].join('\n')
  const safe = redact(raw)
  for (const credential of [
    secret,
    encodeURIComponent(secret),
    Buffer.from(secret).toString('base64'),
    'synthetic-github-token',
    'unlisted-password',
    'unlisted-auth-token',
    'unlisted jwt secret',
    'unlisted redis password',
    'unlisted-key',
    'fakeSignature'
  ]) {
    assert.ok(!safe.includes(credential))
  }
  assert.match(safe, /Cannot find module @xpert-ai\/missing/)
  assert.match(safe, /ECONNREFUSED db:5432/)
  assert.ok(!safe.split('\n').some((line) => line.startsWith('::')))
})

function fixture(t, mode) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'health-diagnostics-test-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  fs.mkdirSync(path.join(directory, 'bin'))
  fs.writeFileSync(
    path.join(directory, 'bin/docker'),
    `#!/usr/bin/env node
const fs = require('node:fs')
const path = require('node:path')
const args = process.argv.slice(2)
const root = process.env.TEST_HEALTH_ROOT
const mode = process.env.TEST_HEALTH_MODE
fs.appendFileSync(path.join(root, 'calls.jsonl'), JSON.stringify(args) + '\\n')
if (args[0] === 'compose') {
  const envFile = args[args.indexOf('--env-file') + 1]
  fs.writeFileSync(path.join(root, 'env-path'), envFile)
  const values = Object.fromEntries(fs.readFileSync(envFile, 'utf8').split('\\n').map(line => line.split('=')))
  fs.writeFileSync(path.join(root, 'secrets.json'), JSON.stringify(Object.values(values).slice(1)))
  if (args.includes('up')) {
    if (mode === 'success' || mode === 'cleanup-failure') process.exit(0)
    console.error('api is unhealthy; credential ' + values.CHECK_DB_PASS)
    process.exit(1)
  }
  if (args.includes('logs')) {
    console.log(args.at(-1) + ' ECONNREFUSED; password=' + values.CHECK_REDIS_PASS)
    console.log('JWT_SECRET: "unknown-fallback-value"')
    process.exit(0)
  }
  if (args.includes('ps')) {
    if (mode === 'no-containers') process.exit(0)
    console.log(args.at(-1))
    process.exit(0)
  }
  if (args.includes('down')) process.exit(mode === 'cleanup-failure' ? 1 : 0)
}
if (args[0] === 'inspect') {
  const service = args.at(-1)
  console.log(JSON.stringify({
    Status: 'running', Running: true, OOMKilled: service === 'api', ExitCode: 0,
    Error: '', StartedAt: '2026-10-20T00:00:00Z',
    Config: { Env: ['PRIVATE=must-not-export'] },
    Health: { Status: service === 'api' ? 'unhealthy' : 'healthy', FailingStreak: 30,
      Log: [{ Start: 'now', End: 'later', ExitCode: 1,
        Output: 'HTTP 503; {"token": "unknown-probe-secret"}' }] }
  }))
} else if (args[0] === 'image') console.log('sha256:fixture linux/amd64')
`,
    { mode: 0o700 }
  )
  const diagnostics = path.join(directory, 'diagnostics')
  const result = spawnSync(process.execPath, [path.join(__dirname, 'check-image.cjs'), 'synthetic:health'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${path.join(directory, 'bin')}${path.delimiter}${process.env.PATH}`,
      API_HEALTH_DIAGNOSTICS_DIR: diagnostics,
      TEST_HEALTH_ROOT: directory,
      TEST_HEALTH_MODE: mode
    }
  })
  const envFile = fs.readFileSync(path.join(directory, 'env-path'), 'utf8')
  t.after(() => fs.rmSync(path.dirname(envFile), { recursive: true, force: true }))
  return { directory, diagnostics, result, envFile }
}

test('failed startup preserves safe logs and health before cleanup and still fails', (t) => {
  const { directory, diagnostics, result, envFile } = fixture(t, 'unhealthy')
  assert.equal(result.status, 1)
  assert.deepEqual(fs.readdirSync(diagnostics).sort(), [
    'api.log',
    'compose.log',
    'containers.json',
    'db.log',
    'redis.log'
  ])
  const state = JSON.parse(fs.readFileSync(path.join(diagnostics, 'containers.json'), 'utf8'))
  assert.deepEqual(
    state.map((container) => container.service),
    ['api', 'db', 'redis']
  )
  assert.equal(state[0].health.status, 'unhealthy')
  assert.equal(state[0].oomKilled, true)
  assert.equal(state[0].health.checks[0].exitCode, 1)
  assert.match(state[0].health.checks[0].output, /HTTP 503/)
  const exported =
    result.stdout +
    result.stderr +
    fs
      .readdirSync(diagnostics)
      .map((name) => fs.readFileSync(path.join(diagnostics, name), 'utf8'))
      .join('\n')
  for (const secret of JSON.parse(fs.readFileSync(path.join(directory, 'secrets.json'), 'utf8'))) {
    assert.ok(!exported.includes(secret))
  }
  for (const secret of ['unknown-fallback-value', 'unknown-probe-secret', 'must-not-export']) {
    assert.ok(!exported.includes(secret))
  }
  assert.ok(!fs.existsSync(envFile))
  const calls = fs.readFileSync(path.join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse)
  assert.ok(calls.at(-1).includes('down'))
  assert.ok(calls.filter((args) => args[0] === 'inspect').every((args) => args.includes('{{json .State}}')))
})

test('failure before container creation remains diagnosable', (t) => {
  const { diagnostics, result } = fixture(t, 'no-containers')
  assert.equal(result.status, 1)
  const state = JSON.parse(fs.readFileSync(path.join(diagnostics, 'containers.json'), 'utf8'))
  assert.ok(state.every((container) => container.status === 'not-created'))
})

test('success retains the acceptance receipt and produces no failure artifact', (t) => {
  const { result, diagnostics, envFile } = fixture(t, 'success')
  assert.equal(result.status, 0)
  assert.ok(!fs.existsSync(diagnostics))
  assert.ok(!fs.existsSync(envFile))
  const receipt = JSON.parse(fs.readFileSync(path.join(path.dirname(envFile), 'receipt.json'), 'utf8'))
  assert.equal(receipt.status, 'api_healthy')
})

test('cleanup failure remains fatal and saves diagnostics', (t) => {
  const { result, diagnostics, envFile } = fixture(t, 'cleanup-failure')
  assert.equal(result.status, 1)
  assert.ok(fs.existsSync(envFile))
  assert.match(fs.readFileSync(path.join(diagnostics, 'cleanup.log'), 'utf8'), /Command exit status: 1/)
})
