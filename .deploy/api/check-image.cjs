const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')

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
    // Startup logs can include environment values; keep diagnostics private.
    const logs = run(['logs', '--no-color', '--tail', '250', 'api'])
    fs.writeFileSync(path.join(directory, 'api.log'), logs.stdout + logs.stderr, { mode: 0o600 })
    fs.writeFileSync(path.join(directory, 'compose.log'), result.stdout + result.stderr, { mode: 0o600 })
    throw new Error(`API startup/health check failed. Private diagnostics: ${directory}`)
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
  console.error(error.message)
  process.exitCode = 1
} finally {
  const cleanup = run(['down', '--volumes', '--remove-orphans'])
  if (cleanup.error || cleanup.status !== 0) {
    console.error(`Cleanup failed for ${project}; protected configuration remains at ${directory}`)
    process.exitCode = 1
  } else {
    fs.rmSync(envFile)
  }
}
