// Why this exists: Web builds must not install API or Desktop dependencies.
// This manifest-only workspace matches the Docker COPY layout and has its own
// committed lock, seeded from the reviewed workspace resolutions.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const packages = ['apps/cloud', 'packages/contracts', 'packages/ui', 'libs/formly']
const lock = '.deploy/webapp/pnpm-lock.yaml'
const forbidden = ['node-pty', 'isolated-vm', 'sharp', 'ffmpeg-ffprobe-static', 'electron', 'cypress']

function copy(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination)
}

function prepareManifestWorkspace(destination, sourceRoot = root, seedLock) {
  copy(path.join(sourceRoot, '.deploy/webapp/package.json'), path.join(destination, 'package.json'))
  for (const file of ['pnpm-workspace.yaml', '.npmrc']) copy(path.join(sourceRoot, file), path.join(destination, file))
  for (const dir of packages)
    copy(path.join(sourceRoot, dir, 'package.json'), path.join(destination, dir, 'package.json'))
  copy(seedLock ?? path.join(sourceRoot, lock), path.join(destination, 'pnpm-lock.yaml'))
}

function checkInstalled(directory = process.cwd()) {
  for (const name of forbidden) {
    try {
      require.resolve(`${name}/package.json`, { paths: [directory] })
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') continue
      throw error
    }
    throw new Error(`Web build must not install ${name}`)
  }
  console.log('Web dependency isolation passed')
}

function maintainLock(update) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-web-dependencies-'))
  try {
    const target = path.join(root, lock)
    prepareManifestWorkspace(temporary, root, fs.existsSync(target) ? target : path.join(root, 'pnpm-lock.yaml'))
    const result = spawnSync(
      'corepack',
      [
        'pnpm',
        'install',
        '--lockfile-only',
        '--ignore-scripts',
        ...(update ? ['--no-frozen-lockfile'] : ['--frozen-lockfile', '--offline'])
      ],
      {
        cwd: temporary,
        stdio: 'inherit',
        env: { ...process.env, CI: 'true' }
      }
    )
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Web dependency lock ${update ? 'update' : 'check'} failed`)
    if (update) copy(path.join(temporary, 'pnpm-lock.yaml'), target)
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

if (require.main === module) {
  const command = process.argv[2]
  if (command === 'check' || command === 'update') maintainLock(command === 'update')
  else if (command === 'check-installed') checkInstalled()
  else throw new Error('Usage: node .deploy/webapp/dependencies.cjs update|check|check-installed')
}

module.exports = { packages, forbidden, prepareManifestWorkspace, checkInstalled }
