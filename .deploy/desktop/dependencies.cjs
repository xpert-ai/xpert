// Invariants: Desktop CI installs only the renderer, Electron and shared contracts.
// Generate the isolated lock from the same workspace manifests/catalog as local builds.
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawnSync } = require('node:child_process')

const root = path.resolve(__dirname, '../..')
const packages = ['apps/desktop', 'packages/contracts', 'packages/desktop-protocol', 'packages/shadcn-ui']
const lock = '.deploy/desktop/pnpm-lock.yaml'
const forbidden = ['node-pty', 'isolated-vm', 'sharp', 'ffmpeg-ffprobe-static', 'cypress', '@nestjs/core']
function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.copyFileSync(source, target)
}
function prepare(destination, sources = false, sourceRoot = root) {
  if (path.resolve(destination) === path.resolve(sourceRoot)) throw new Error('Use a separate Desktop build directory')
  copy(path.join(sourceRoot, '.deploy/desktop/package.json'), path.join(destination, 'package.json'))
  for (const file of ['pnpm-workspace.yaml', '.npmrc', 'tsconfig.base.json'])
    copy(path.join(sourceRoot, file), path.join(destination, file))
  for (const dir of packages) {
    if (sources) {
      fs.cpSync(path.join(sourceRoot, dir), path.join(destination, dir), {
        recursive: true,
        filter: (file) => !['node_modules', 'dist', 'release', '.local', '.DS_Store'].includes(path.basename(file))
      })
    } else copy(path.join(sourceRoot, dir, 'package.json'), path.join(destination, dir, 'package.json'))
  }
  const seed = fs.existsSync(path.join(sourceRoot, lock)) ? lock : 'pnpm-lock.yaml'
  copy(path.join(sourceRoot, seed), path.join(destination, 'pnpm-lock.yaml'))
  if (sources)
    fs.cpSync(path.join(sourceRoot, '.deploy/desktop'), path.join(destination, '.deploy/desktop'), {
      recursive: true,
      filter: (file) => path.basename(file) !== 'node_modules'
    })
}
function runPnpm(args, cwd) {
  const result = spawnSync(process.platform === 'win32' ? 'corepack.cmd' : 'corepack', ['pnpm', ...args], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, CI: 'true' }
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error('Desktop dependency command failed')
}
function maintainLock(update) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'xpert-desktop-deps-'))
  try {
    prepare(temporary)
    runPnpm(
      [
        'install',
        '--lockfile-only',
        '--ignore-scripts',
        ...(update ? ['--no-frozen-lockfile'] : ['--frozen-lockfile', '--offline'])
      ],
      temporary
    )
    if (update) copy(path.join(temporary, 'pnpm-lock.yaml'), path.join(root, lock))
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}
function checkInstalled(directory = process.cwd()) {
  for (const name of forbidden) {
    // node-linker=hoisted: inspect this workspace, not a developer's parent checkout.
    if (!fs.existsSync(path.join(directory, 'node_modules', name, 'package.json'))) continue
    throw new Error(`Desktop build must not install ${name}`)
  }
  console.log('Desktop dependency isolation passed')
}
if (require.main === module) {
  const command = process.argv[2]
  if (command === 'update' || command === 'check') maintainLock(command === 'update')
  else if (command === 'prepare' && process.argv[3]) prepare(path.resolve(process.argv[3]), true)
  else if (command === 'check-installed') checkInstalled()
  else throw new Error('Usage: dependencies.cjs update|check|prepare <directory>|check-installed')
}
module.exports = { packages, forbidden, prepare, checkInstalled }
