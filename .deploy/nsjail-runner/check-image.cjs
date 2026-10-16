// Invariants: probe the exact image to be published using disposable workspaces.
// No production mounts, host ports or existing Runner credentials are used.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { setTimeout: sleep } = require('node:timers/promises')

async function main() {
  const image = process.argv[2]
  if (!image || image.startsWith('-')) throw new Error('An image reference is required')
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-nsjail-check-'))
  // The jail drops to UID 1000 before resolving bind sources.
  fs.chmodSync(workspace, 0o711)
  const name = `xpert-nsjail-check-${randomBytes(6).toString('hex')}`
  const env = { ...process.env, XPERT_NSJAIL_RUNNER_TOKEN: randomBytes(32).toString('hex') }
  const run = (args, timeout = 30000) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', env, timeout, maxBuffer: 8 * 1024 * 1024 })
    if (result.error || result.status !== 0)
      throw new Error(result.error?.message || result.stderr.trim() || result.stdout.trim() || 'Docker command failed')
    return result.stdout.trim()
  }
  let created = false
  try {
    run([
      'create',
      '--name',
      name,
      '--privileged',
      '--cgroupns=host',
      '--security-opt',
      'apparmor=unconfined',
      '--env',
      'XPERT_NSJAIL_RUNNER_TOKEN',
      '--env',
      'XPERT_NSJAIL_MEMORY_BYTES=134217728',
      '--env',
      'XPERT_NSJAIL_CPU_MS_PER_SEC=200',
      '--env',
      'XPERT_NSJAIL_PIDS=32',
      '--env',
      'XPERT_NSJAIL_RLIMIT_AS_MB=512',
      '--env',
      'XPERT_NSJAIL_RLIMIT_FSIZE_MB=2',
      '--env',
      'XPERT_NSJAIL_RLIMIT_NOFILE=64',
      '--mount',
      `type=bind,source=${workspace},target=/sandbox`,
      '--mount',
      'type=bind,source=/sys/fs/cgroup,target=/sys/fs/cgroup',
      image
    ])
    created = true
    run(['start', name])
    let healthy = false
    for (let attempt = 0; attempt < 45; attempt++) {
      const state = JSON.parse(run(['inspect', '--format', '{{json .State}}', name]))
      if (state.Health?.Status === 'healthy') {
        healthy = true
        break
      }
      if (!state.Running || state.Health?.Status === 'unhealthy') throw new Error('Runner startup failed')
      await sleep(1000)
    }
    if (!healthy) throw new Error('Runner health check timed out')
    console.log(run(['exec', name, 'python3', '/app/poc_validate.py'], 240000))
    console.log(run(['exec', name, 'python3', '/app/verify_app_data.py'], 60000))
    console.log(`NsJail protocol, isolation and managed app-data checks passed: ${image}`)
  } finally {
    if (created) {
      // Cleanup must also succeed before an image can be published.
      run(['rm', '--force', name])
      run([
        'run',
        '--rm',
        '--network',
        'none',
        '--entrypoint',
        'python3',
        '--mount',
        `type=bind,source=${workspace},target=/probe`,
        image,
        '-c',
        "import pathlib,shutil; [(p.unlink() if p.is_symlink() or not p.is_dir() else shutil.rmtree(p)) for p in pathlib.Path('/probe').iterdir()]"
      ])
    }
    fs.rmdirSync(workspace)
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
