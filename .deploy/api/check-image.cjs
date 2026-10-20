const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { createRedactor, commandOutput, collectDiagnostics } = require('./health-diagnostics.cjs')

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-api-health-'))
fs.chmodSync(directory, 0o700)
const project = `xpert-health-${randomBytes(6).toString('hex')}`
const values = { CHECK_API_IMAGE: process.argv[2] || 'xpert-api:health-check' }
for (const name of [
  'DB_PASS',
  'REDIS_PASS',
  'JWT_SECRET',
  'JWT_REFRESH_SECRET',
  'SESSION_SECRET',
  'ENCRYPTION_KEY',
  'MCP_TOKEN_SECRET',
  'MCP_STATE_SECRET'
]) {
  values[`CHECK_${name}`] = randomBytes(32).toString('hex')
}
const envFile = path.join(directory, '.env')
fs.writeFileSync(
  envFile,
  Object.entries(values)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n'),
  { mode: 0o600 }
)
const args = ['compose', '-p', project, '--env-file', envFile, '-f', path.join(__dirname, 'compose.health.yml')]
const redact = createRedactor(values)
const diagnostics = process.env.API_HEALTH_DIAGNOSTICS_DIR || path.join(directory, 'diagnostics')
const run = (extra) =>
  spawnSync('docker', [...args, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, ...values },
    maxBuffer: 32 * 1024 * 1024
  })

try {
  console.log(`Checking ${values.CHECK_API_IMAGE} in isolated Compose project ${project}`)
  const result = run(['up', '-d', '--wait', '--wait-timeout', '240'])
  if (result.error || result.status !== 0) {
    collectDiagnostics({
      directory: diagnostics,
      result,
      run,
      inspect: (id) =>
        spawnSync('docker', ['inspect', '--format', '{{json .State}}', id], {
          encoding: 'utf8',
          timeout: 30_000,
          maxBuffer: 4 * 1024 * 1024
        }),
      redact
    })
    throw new Error('API startup/health check failed; see sanitized diagnostics above')
  }
  const platform = path.resolve(__dirname, '../..')
  const inspect = spawnSync(
    'docker',
    ['image', 'inspect', values.CHECK_API_IMAGE, '--format', '{{.Id}} {{.Os}}/{{.Architecture}}'],
    { encoding: 'utf8' }
  )
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: platform, encoding: 'utf8' })
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: platform, encoding: 'utf8' })
  const receipt = {
    mode: 'docker',
    platform,
    image: values.CHECK_API_IMAGE,
    imageIdentity: inspect.stdout.trim(),
    revision: revision.stdout.trim(),
    dirty: Boolean(status.stdout.trim()),
    project,
    status: 'api_healthy',
    checkedAt: new Date().toISOString(),
    checks: ['readiness', 'database', 'cache', 'redis'],
    uiChecked: false,
    businessOperationsChecked: false
  }
  fs.writeFileSync(path.join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 })
  console.log(`API startup, readiness, database and Redis checks passed. Receipt: ${directory}/receipt.json`)
} catch (error) {
  console.error(redact(error.message))
  process.exitCode = 1
} finally {
  const cleanup = run(['down', '--volumes', '--remove-orphans'])
  if (cleanup.error || cleanup.status !== 0) {
    fs.mkdirSync(diagnostics, { recursive: true, mode: 0o700 })
    fs.writeFileSync(path.join(diagnostics, 'cleanup.log'), redact(commandOutput(cleanup)), { mode: 0o600 })
    console.error(`Cleanup failed for ${project}; protected configuration remains at ${directory}`)
    process.exitCode = 1
  } else {
    fs.rmSync(envFile)
  }
}
